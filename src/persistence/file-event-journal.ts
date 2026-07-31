import { constants } from "node:fs";
import {
  appendFile,
  mkdir,
  open,
  readFile,
  stat,
  truncate,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { clonePlainData } from "../utils/clone-plain-data.js";
import { stableStringify } from "../utils/stable-hash.js";
import {
  GENESIS_EVENT_HASH,
  computeEventHash,
  createEventIdentity,
  hashPlainData,
  sha256,
  verifyPersistedEventHash,
} from "./checksums.js";
import type {
  AppendEventsOptions,
  EventJournal,
  JournalInspection,
  JournalIntegrityIssue,
  JournalRecoveryResult,
  PersistedMemoryEvent,
  ReadEventsOptions,
  UncommittedMemoryEvent,
} from "./types.js";

export interface FileEventJournalOptions {
  rootDirectory: string;
  lockTimeoutMs?: number;
  lockRetryMs?: number;
  staleLockMs?: number;
}

interface ParsedLine {
  value: PersistedMemoryEvent | null;
  line: number;
  byteOffset: number;
  byteLength: number;
  issue: JournalIntegrityIssue | null;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function streamKey(streamId: string): string {
  return sha256(streamId).slice(0, 40);
}

function asErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function ensureStreamId(streamId: string): void {
  if (streamId.trim().length === 0) {
    throw new Error("Stream id cannot be empty.");
  }
}

function parseJournalLines(text: string): ParsedLine[] {
  const parsed: ParsedLine[] = [];
  let byteOffset = 0;
  const segments = text.match(/.*(?:\n|$)/g) ?? [];
  let line = 0;
  for (const segment of segments) {
    if (segment.length === 0) {
      continue;
    }
    line += 1;
    const byteLength = Buffer.byteLength(segment, "utf8");
    const raw = segment.endsWith("\n") ? segment.slice(0, -1) : segment;
    if (raw.trim().length === 0) {
      byteOffset += byteLength;
      continue;
    }
    try {
      const value = JSON.parse(raw) as PersistedMemoryEvent;
      parsed.push({ value, line, byteOffset, byteLength, issue: null });
    } catch (error) {
      parsed.push({
        value: null,
        line,
        byteOffset,
        byteLength,
        issue: {
          kind: "parse_error",
          line,
          byteOffset,
          sequence: null,
          message: `Invalid JSON event record: ${error instanceof Error ? error.message : String(error)}`,
          recoverableByTrailingTruncation:
            byteOffset + byteLength >= Buffer.byteLength(text, "utf8"),
        },
      });
    }
    byteOffset += byteLength;
  }
  return parsed;
}

export class FileEventJournal implements EventJournal {
  private readonly rootDirectory: string;
  private readonly lockTimeoutMs: number;
  private readonly lockRetryMs: number;
  private readonly staleLockMs: number;
  private readonly queues = new Map<string, Promise<void>>();

  public constructor(options: FileEventJournalOptions) {
    this.rootDirectory = options.rootDirectory;
    this.lockTimeoutMs = options.lockTimeoutMs ?? 5_000;
    this.lockRetryMs = options.lockRetryMs ?? 25;
    this.staleLockMs = options.staleLockMs ?? 30_000;
  }

  public async append<TType extends string, TPayload>(
    streamId: string,
    events: ReadonlyArray<UncommittedMemoryEvent<TType, TPayload>>,
    options: AppendEventsOptions = {},
  ): Promise<PersistedMemoryEvent<TType, TPayload>[]> {
    ensureStreamId(streamId);
    if (events.length === 0) {
      return [];
    }
    return this.enqueue(streamId, async () =>
      this.withStreamLock(streamId, async () => {
        const inspection = await this.inspect(streamId);
        if (inspection.issue !== null) {
          throw new Error(
            `Cannot append to corrupted stream "${streamId}": ${inspection.issue.message}`,
          );
        }
        if (
          options.expectedSequence !== undefined &&
          options.expectedSequence !== inspection.validThroughSequence
        ) {
          throw new Error(
            `Optimistic concurrency conflict for stream "${streamId}": expected sequence ${options.expectedSequence}, actual ${inspection.validThroughSequence}.`,
          );
        }
        const recordedAt = options.recordedAt ?? new Date().toISOString();
        let previousHash = inspection.validThroughHash;
        let nextSequence = inspection.validThroughSequence + 1;
        const persisted = events.map((event) => {
          if (!Number.isInteger(event.schemaVersion) || event.schemaVersion < 1) {
            throw new Error("Event schema version must be a positive integer.");
          }
          const payloadHash = hashPlainData(event.payload);
          const eventId = createEventIdentity({
            streamId,
            sequence: nextSequence,
            event: event as UncommittedMemoryEvent,
            payloadHash,
          });
          const withoutHash: Omit<PersistedMemoryEvent<TType, TPayload>, "eventHash"> = {
            ...clonePlainData(event),
            eventId,
            streamId,
            sequence: nextSequence,
            recordedAt,
            previousHash,
            payloadHash,
          };
          const persistedEvent: PersistedMemoryEvent<TType, TPayload> = {
            ...withoutHash,
            eventHash: computeEventHash(withoutHash),
          };
          previousHash = persistedEvent.eventHash;
          nextSequence += 1;
          return persistedEvent;
        });
        await mkdir(this.journalDirectory(), { recursive: true });
        const payload = persisted.map((event) => stableStringify(event)).join("\n") + "\n";
        await appendFile(this.journalPath(streamId), payload, { encoding: "utf8" });
        return clonePlainData(persisted);
      }),
    );
  }

  public async read(
    streamId: string,
    options: ReadEventsOptions = {},
  ): Promise<PersistedMemoryEvent[]> {
    const inspection = await this.inspect(streamId);
    if (inspection.issue !== null) {
      throw new Error(
        `Journal integrity check failed for stream "${streamId}": ${inspection.issue.message}`,
      );
    }
    const fromSequence = options.fromSequence ?? 1;
    const toSequence = options.toSequence ?? Number.MAX_SAFE_INTEGER;
    return inspection.events
      .filter(
        (event) =>
          event.sequence >= fromSequence && event.sequence <= toSequence,
      )
      .map((event) => clonePlainData(event));
  }

  public async inspect(streamId: string): Promise<JournalInspection> {
    ensureStreamId(streamId);
    const path = this.journalPath(streamId);
    let text = "";
    try {
      text = await readFile(path, "utf8");
    } catch (error) {
      if (asErrorCode(error) !== "ENOENT") {
        throw error;
      }
    }
    const totalByteLength = Buffer.byteLength(text, "utf8");
    const lines = parseJournalLines(text);
    const events: PersistedMemoryEvent[] = [];
    let expectedSequence = 1;
    let expectedPreviousHash = GENESIS_EVENT_HASH;
    let validByteLength = 0;
    let issue: JournalIntegrityIssue | null = null;
    for (const parsed of lines) {
      if (parsed.issue !== null) {
        issue = parsed.issue;
        break;
      }
      const event = parsed.value;
      if (event === null) {
        continue;
      }
      const issueBase = {
        line: parsed.line,
        byteOffset: parsed.byteOffset,
        sequence:
          typeof event.sequence === "number" ? event.sequence : null,
        recoverableByTrailingTruncation:
          parsed.byteOffset + parsed.byteLength >= totalByteLength,
      };
      if (event.streamId !== streamId) {
        issue = {
          ...issueBase,
          kind: "stream_mismatch",
          message: `Expected stream "${streamId}", found "${event.streamId}".`,
        };
        break;
      }
      if (event.sequence !== expectedSequence) {
        issue = {
          ...issueBase,
          kind: "sequence_gap",
          message: `Expected sequence ${expectedSequence}, found ${event.sequence}.`,
        };
        break;
      }
      if (event.payloadHash !== hashPlainData(event.payload)) {
        issue = {
          ...issueBase,
          kind: "payload_hash_mismatch",
          message: `Payload hash mismatch at sequence ${event.sequence}.`,
        };
        break;
      }
      if (event.previousHash !== expectedPreviousHash) {
        issue = {
          ...issueBase,
          kind: "previous_hash_mismatch",
          message: `Previous hash mismatch at sequence ${event.sequence}.`,
        };
        break;
      }
      if (!verifyPersistedEventHash(event)) {
        issue = {
          ...issueBase,
          kind: "event_hash_mismatch",
          message: `Event hash mismatch at sequence ${event.sequence}.`,
        };
        break;
      }
      events.push(clonePlainData(event));
      validByteLength = parsed.byteOffset + parsed.byteLength;
      expectedPreviousHash = event.eventHash;
      expectedSequence += 1;
    }
    return {
      streamId,
      events,
      validThroughSequence: events.at(-1)?.sequence ?? 0,
      validThroughHash: events.at(-1)?.eventHash ?? GENESIS_EVENT_HASH,
      validByteLength,
      totalByteLength,
      issue,
    };
  }

  public async recoverTrailingCorruption(
    streamId: string,
  ): Promise<JournalRecoveryResult> {
    return this.enqueue(streamId, async () =>
      this.withStreamLock(streamId, async () => {
        const inspection = await this.inspect(streamId);
        if (inspection.issue === null) {
          return {
            streamId,
            recovered: false,
            previousByteLength: inspection.totalByteLength,
            recoveredByteLength: inspection.totalByteLength,
            validThroughSequence: inspection.validThroughSequence,
            reason: "No corruption was detected.",
          };
        }
        if (!inspection.issue.recoverableByTrailingTruncation) {
          throw new Error(
            `Refusing to repair non-trailing corruption in stream "${streamId}".`,
          );
        }
        await truncate(this.journalPath(streamId), inspection.validByteLength);
        return {
          streamId,
          recovered: true,
          previousByteLength: inspection.totalByteLength,
          recoveredByteLength: inspection.validByteLength,
          validThroughSequence: inspection.validThroughSequence,
          reason: inspection.issue.message,
        };
      }),
    );
  }

  public journalPath(streamId: string): string {
    return join(this.journalDirectory(), `${streamKey(streamId)}.jsonl`);
  }

  private journalDirectory(): string {
    return join(this.rootDirectory, "journals");
  }

  private lockPath(streamId: string): string {
    return join(this.journalDirectory(), `${streamKey(streamId)}.lock`);
  }

  private async enqueue<T>(
    streamId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.queues.get(streamId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const current = previous.then(() => gate);
    this.queues.set(streamId, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.queues.get(streamId) === current) {
        this.queues.delete(streamId);
      }
    }
  }

  private async withStreamLock<T>(
    streamId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    await mkdir(this.journalDirectory(), { recursive: true });
    const lockPath = this.lockPath(streamId);
    const startedAt = Date.now();
    while (true) {
      try {
        const handle = await open(
          lockPath,
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        );
        try {
          await writeFile(handle, `${process.pid}:${Date.now()}\n`, "utf8");
        } finally {
          await handle.close();
        }
        break;
      } catch (error) {
        if (asErrorCode(error) !== "EEXIST") {
          throw error;
        }
        try {
          const details = await stat(lockPath);
          if (Date.now() - details.mtimeMs > this.staleLockMs) {
            await unlink(lockPath);
            continue;
          }
        } catch (statError) {
          if (asErrorCode(statError) !== "ENOENT") {
            throw statError;
          }
          continue;
        }
        if (Date.now() - startedAt >= this.lockTimeoutMs) {
          throw new Error(`Timed out waiting for stream lock "${streamId}".`);
        }
        await delay(this.lockRetryMs);
      }
    }
    try {
      return await operation();
    } finally {
      try {
        await unlink(lockPath);
      } catch (error) {
        if (asErrorCode(error) !== "ENOENT") {
          throw error;
        }
      }
    }
  }
}
