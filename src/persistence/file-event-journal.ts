import { constants } from "node:fs";
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  truncate,
  unlink,
} from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { clonePlainData } from "../utils/clone-plain-data.js";
import {
  canonicalJsonStringify,
  normalizeCanonicalJson,
} from "./canonical-json.js";
import {
  GENESIS_EVENT_HASH,
  computeEventHash,
  createEventIdentity,
  hashPlainData,
  sha256,
  verifyPersistedEventHash,
} from "./checksums.js";
import {
  NoopPersistenceFaultInjector,
  type PersistenceFaultInjector,
} from "./fault-injection.js";
import { isCanonicalUtcTimestamp } from "./timestamps.js";
import type {
  AppendEventsOptions,
  EventJournal,
  JournalInspection,
  JournalIntegrityIssue,
  JournalRecoveryResult,
  PersistedMemoryEvent,
  PersistenceLockInspection,
  PersistenceLockMetadata,
  PersistenceLockRecoveryResult,
  ReadEventsOptions,
  RecoverOrphanedLockOptions,
  UncommittedMemoryEvent,
} from "./types.js";

export interface FileEventJournalOptions {
  rootDirectory: string;
  lockTimeoutMs?: number;
  lockRetryMs?: number;
  staleLockMs?: number;
  maxEventBatchSize?: number;
  maxSerializedAppendBytes?: number;
  maxJournalBytes?: number;
  maxLockMetadataBytes?: number;
  faultInjector?: PersistenceFaultInjector;
  now?: () => Date;
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

async function syncDirectory(path: string): Promise<void> {
  try {
    const handle = await open(path, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    const code = asErrorCode(error);
    if (
      code !== "EINVAL" &&
      code !== "EISDIR" &&
      code !== "EPERM" &&
      code !== "ENOTSUP"
    ) {
      throw error;
    }
  }
}

async function assertDirectoryOrMissing(path: string): Promise<void> {
  try {
    const details = await lstat(path);
    if (!details.isDirectory() || details.isSymbolicLink()) {
      throw new Error(`Persistence directory is not a real directory: ${path}`);
    }
  } catch (error) {
    if (asErrorCode(error) !== "ENOENT") {
      throw error;
    }
  }
}

async function assertRegularFileOrMissing(path: string): Promise<void> {
  try {
    const details = await lstat(path);
    if (!details.isFile() || details.isSymbolicLink()) {
      throw new Error(`Persistence path is not a regular file: ${path}`);
    }
  } catch (error) {
    if (asErrorCode(error) !== "ENOENT") {
      throw error;
    }
  }
}

function ensureDuration(
  name: string,
  value: number,
  minimum: number,
): void {
  if (!Number.isFinite(value) || value < minimum) {
    throw new Error(`${name} must be a finite number >= ${minimum}.`);
  }
}

function ensurePositiveSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive safe integer.`);
  }
}

function streamKey(streamId: string): string {
  return sha256(streamId).slice(0, 40);
}

const RETRYABLE_LOCK_FILESYSTEM_CODES = new Set([
  "EACCES",
  "EBUSY",
  "EPERM",
]);

const LOCK_FILESYSTEM_RETRY_LIMIT = 20;

function asErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function isRetryableLockFilesystemError(error: unknown): boolean {
  const code = asErrorCode(error);
  return code !== null && RETRYABLE_LOCK_FILESYSTEM_CODES.has(code);
}

function errorDescription(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ensureStreamId(streamId: string): void {
  if (streamId.trim().length === 0) {
    throw new Error("Stream id cannot be empty.");
  }
}

const UNCOMMITTED_EVENT_KEYS = new Set([
  "type",
  "payload",
  "schemaVersion",
  "occurredAt",
  "actor",
  "causationId",
  "correlationId",
  "contextFingerprint",
  "classification",
]);

const PERSISTED_EVENT_KEYS = new Set([
  ...UNCOMMITTED_EVENT_KEYS,
  "eventId",
  "streamId",
  "sequence",
  "recordedAt",
  "previousHash",
  "payloadHash",
  "eventHash",
]);

function hasOnlyKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): boolean {
  return Object.keys(record).every((key) => allowed.has(key));
}

function isOptionalString(
  record: Record<string, unknown>,
  key: string,
): boolean {
  return !(key in record) || typeof record[key] === "string";
}

function hasValidOptionalMetadata(record: Record<string, unknown>): boolean {
  return (
    isOptionalString(record, "actor") &&
    isOptionalString(record, "causationId") &&
    isOptionalString(record, "correlationId") &&
    isOptionalString(record, "contextFingerprint") &&
    (!("classification" in record) ||
      record.classification === "public" ||
      record.classification === "private" ||
      record.classification === "restricted")
  );
}

function isUncommittedMemoryEventRecord(
  value: unknown,
): value is UncommittedMemoryEvent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const event = value as Record<string, unknown>;
  return (
    hasOnlyKeys(event, UNCOMMITTED_EVENT_KEYS) &&
    typeof event.type === "string" &&
    event.type.trim().length > 0 &&
    Number.isSafeInteger(event.schemaVersion) &&
    (event.schemaVersion as number) >= 1 &&
    isCanonicalUtcTimestamp(event.occurredAt) &&
    "payload" in event &&
    hasValidOptionalMetadata(event)
  );
}

function isPersistedMemoryEvent(value: unknown): value is PersistedMemoryEvent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const event = value as Record<string, unknown>;
  return (
    hasOnlyKeys(event, PERSISTED_EVENT_KEYS) &&
    isUncommittedMemoryEventRecord(
      Object.fromEntries(
        Object.entries(event).filter(([key]) => UNCOMMITTED_EVENT_KEYS.has(key)),
      ),
    ) &&
    typeof event.eventId === "string" &&
    /^evt_[a-f0-9]{32}$/u.test(event.eventId) &&
    typeof event.streamId === "string" &&
    event.streamId.trim().length > 0 &&
    Number.isSafeInteger(event.sequence) &&
    (event.sequence as number) >= 1 &&
    isCanonicalUtcTimestamp(event.recordedAt) &&
    typeof event.previousHash === "string" &&
    (event.previousHash === GENESIS_EVENT_HASH ||
      /^[a-f0-9]{64}$/u.test(event.previousHash)) &&
    typeof event.payloadHash === "string" &&
    /^[a-f0-9]{64}$/u.test(event.payloadHash) &&
    typeof event.eventHash === "string" &&
    /^[a-f0-9]{64}$/u.test(event.eventHash)
  );
}

function parseJournalBuffer(buffer: Buffer): ParsedLine[] {
  const parsed: ParsedLine[] = [];
  let start = 0;
  let line = 0;
  while (start < buffer.length) {
    const newline = buffer.indexOf(0x0a, start);
    const end = newline === -1 ? buffer.length : newline + 1;
    const segment = buffer.subarray(start, end);
    const rawBuffer = newline === -1 ? segment : segment.subarray(0, -1);
    line += 1;
    const byteLength = segment.length;
    const raw = rawBuffer.toString("utf8");
    if (raw.trim().length === 0) {
      parsed.push({
        value: null,
        line,
        byteOffset: start,
        byteLength,
        issue: {
          kind: "unsupported_record",
          line,
          byteOffset: start,
          sequence: null,
          message: "Blank journal records are not allowed.",
          recoverableByTrailingTruncation: false,
        },
      });
      break;
    }
    try {
      const value: unknown = JSON.parse(raw);
      if (!isPersistedMemoryEvent(value)) {
        parsed.push({
          value: null,
          line,
          byteOffset: start,
          byteLength,
          issue: {
            kind: "unsupported_record",
            line,
            byteOffset: start,
            sequence: null,
            message: "Journal record does not match the persisted event envelope.",
            recoverableByTrailingTruncation: false,
          },
        });
        break;
      }
      parsed.push({ value, line, byteOffset: start, byteLength, issue: null });
    } catch (error) {
      parsed.push({
        value: null,
        line,
        byteOffset: start,
        byteLength,
        issue: {
          kind: "parse_error",
          line,
          byteOffset: start,
          sequence: null,
          message: `Invalid JSON event record: ${error instanceof Error ? error.message : String(error)}`,
          recoverableByTrailingTruncation: end >= buffer.length,
        },
      });
      break;
    }
    start = end;
  }
  return parsed;
}

function processLiveness(pid: number): boolean | null {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    return null;
  }
  if (pid === process.pid) {
    return true;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = asErrorCode(error);
    if (code === "ESRCH") {
      return false;
    }
    if (code === "EPERM") {
      return true;
    }
    return null;
  }
}

const LOCK_METADATA_KEYS = new Set([
  "formatVersion",
  "streamId",
  "ownerId",
  "pid",
  "hostname",
  "createdAt",
  "heartbeatAt",
]);

function isLockMetadata(value: unknown): value is PersistenceLockMetadata {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const metadata = value as Record<string, unknown>;
  return (
    Object.keys(metadata).length === LOCK_METADATA_KEYS.size &&
    Object.keys(metadata).every((key) => LOCK_METADATA_KEYS.has(key)) &&
    metadata.formatVersion === 1 &&
    typeof metadata.streamId === "string" &&
    metadata.streamId.trim().length > 0 &&
    typeof metadata.ownerId === "string" &&
    metadata.ownerId.trim().length > 0 &&
    Number.isSafeInteger(metadata.pid) &&
    (metadata.pid as number) > 0 &&
    typeof metadata.hostname === "string" &&
    metadata.hostname.trim().length > 0 &&
    typeof metadata.createdAt === "string" &&
    isCanonicalUtcTimestamp(metadata.createdAt) &&
    typeof metadata.heartbeatAt === "string" &&
    isCanonicalUtcTimestamp(metadata.heartbeatAt)
  );
}

export class FileEventJournal implements EventJournal {
  private readonly rootDirectory: string;
  private readonly lockTimeoutMs: number;
  private readonly lockRetryMs: number;
  private readonly staleLockMs: number;
  private readonly maxEventBatchSize: number;
  private readonly maxSerializedAppendBytes: number;
  private readonly maxJournalBytes: number;
  private readonly maxLockMetadataBytes: number;
  private readonly faultInjector: PersistenceFaultInjector;
  private readonly now: () => Date;
  private readonly queues = new Map<string, Promise<void>>();

  public constructor(options: FileEventJournalOptions) {
    this.rootDirectory = options.rootDirectory;
    if (this.rootDirectory.trim().length === 0) {
      throw new Error("Persistence root directory cannot be empty.");
    }
    this.lockTimeoutMs = options.lockTimeoutMs ?? 5_000;
    this.lockRetryMs = options.lockRetryMs ?? 25;
    this.staleLockMs = options.staleLockMs ?? 30_000;
    this.maxEventBatchSize = options.maxEventBatchSize ?? 10_000;
    this.maxSerializedAppendBytes =
      options.maxSerializedAppendBytes ?? 64 * 1024 * 1024;
    this.maxJournalBytes = options.maxJournalBytes ?? 1024 * 1024 * 1024;
    this.maxLockMetadataBytes = options.maxLockMetadataBytes ?? 64 * 1024;
    ensureDuration("lockTimeoutMs", this.lockTimeoutMs, 0);
    ensureDuration("lockRetryMs", this.lockRetryMs, 1);
    ensureDuration("staleLockMs", this.staleLockMs, 0);
    ensurePositiveSafeInteger("maxEventBatchSize", this.maxEventBatchSize);
    ensurePositiveSafeInteger(
      "maxSerializedAppendBytes",
      this.maxSerializedAppendBytes,
    );
    ensurePositiveSafeInteger("maxJournalBytes", this.maxJournalBytes);
    ensurePositiveSafeInteger(
      "maxLockMetadataBytes",
      this.maxLockMetadataBytes,
    );
    this.faultInjector =
      options.faultInjector ?? new NoopPersistenceFaultInjector();
    this.now = options.now ?? (() => new Date());
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
    if (events.length > this.maxEventBatchSize) {
      throw new Error(
        `Event batch size ${events.length} exceeds maxEventBatchSize ${this.maxEventBatchSize}.`,
      );
    }
    return this.enqueue(streamId, async () =>
      this.withStreamLock(streamId, async () => {
        await this.faultInjector.trigger({
          point: "journal.before_inspect",
          streamId,
        });
        const inspection = await this.inspect(streamId);
        if (inspection.issue !== null) {
          throw new Error(
            `Cannot append to corrupted stream "${streamId}": ${inspection.issue.message}`,
          );
        }
        if (
          options.expectedSequence !== undefined &&
          (!Number.isSafeInteger(options.expectedSequence) ||
            options.expectedSequence < 0)
        ) {
          throw new Error(
            "expectedSequence must be a non-negative safe integer.",
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
        const recordedAt = options.recordedAt ?? this.now().toISOString();
        if (!isCanonicalUtcTimestamp(recordedAt)) {
          throw new Error("Event recording timestamp must be valid canonical UTC.");
        }
        let previousHash = inspection.validThroughHash;
        let nextSequence = inspection.validThroughSequence + 1;
        const persisted = events.map((event) => {
          const normalized = normalizeCanonicalJson(event);
          if (!isUncommittedMemoryEventRecord(normalized)) {
            throw new Error(
              "Event does not match the supported uncommitted event envelope.",
            );
          }
          const normalizedEvent = normalized as unknown as UncommittedMemoryEvent<
            TType,
            TPayload
          >;
          const payloadHash = hashPlainData(normalizedEvent.payload);
          const eventId = createEventIdentity({
            streamId,
            sequence: nextSequence,
            event: normalizedEvent,
            payloadHash,
          });
          const withoutHash: Omit<
            PersistedMemoryEvent<TType, TPayload>,
            "eventHash"
          > = {
            ...normalizedEvent,
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
        await this.faultInjector.trigger({
          point: "journal.after_prepare",
          streamId,
          eventCount: persisted.length,
          sequence: inspection.validThroughSequence,
        });
        await assertDirectoryOrMissing(this.journalDirectory());
        await mkdir(this.journalDirectory(), { recursive: true, mode: 0o700 });
        await assertDirectoryOrMissing(this.journalDirectory());
        const path = this.journalPath(streamId);
        await assertRegularFileOrMissing(path);
        const recordSeparator =
          inspection.totalByteLength > 0 &&
          inspection.endsWithRecordTerminator === false
            ? "\n"
            : "";
        const payload =
          recordSeparator +
          persisted.map((event) => canonicalJsonStringify(event)).join("\n") +
          "\n";
        const appendByteLength = Buffer.byteLength(payload, "utf8");
        if (appendByteLength > this.maxSerializedAppendBytes) {
          throw new Error(
            `Serialized append size ${appendByteLength} exceeds maxSerializedAppendBytes ${this.maxSerializedAppendBytes}.`,
          );
        }
        if (inspection.totalByteLength + appendByteLength > this.maxJournalBytes) {
          throw new Error(
            `Journal size would exceed maxJournalBytes ${this.maxJournalBytes}.`,
          );
        }
        const handle = await open(path, "a", 0o600);
        try {
          await this.faultInjector.trigger({
            point: "journal.before_append",
            streamId,
            path,
            eventCount: persisted.length,
          });
          await handle.writeFile(payload, "utf8");
          await this.faultInjector.trigger({
            point: "journal.after_append",
            streamId,
            path,
            eventCount: persisted.length,
          });
          await this.faultInjector.trigger({
            point: "journal.before_fsync",
            streamId,
            path,
          });
          await handle.sync();
          await this.faultInjector.trigger({
            point: "journal.after_fsync",
            streamId,
            path,
          });
        } finally {
          await handle.close();
        }
        await syncDirectory(this.journalDirectory());
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
    if (!Number.isSafeInteger(fromSequence) || fromSequence < 1) {
      throw new Error("fromSequence must be a positive safe integer.");
    }
    if (!Number.isSafeInteger(toSequence) || toSequence < fromSequence) {
      throw new Error("toSequence must be a safe integer greater than fromSequence.");
    }
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
    await assertDirectoryOrMissing(this.journalDirectory());
    await assertRegularFileOrMissing(path);
    let buffer = Buffer.alloc(0);
    try {
      const details = await lstat(path);
      if (details.size > this.maxJournalBytes) {
        throw new Error(
          `Journal size ${details.size} exceeds maxJournalBytes ${this.maxJournalBytes}.`,
        );
      }
      buffer = await readFile(path);
    } catch (error) {
      if (asErrorCode(error) !== "ENOENT") {
        throw error;
      }
    }
    const totalByteLength = buffer.length;
    const lines = parseJournalBuffer(buffer);
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
        sequence: event.sequence,
        recoverableByTrailingTruncation: false,
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
      let actualPayloadHash: string;
      try {
        actualPayloadHash = hashPlainData(event.payload);
      } catch (error) {
        issue = {
          ...issueBase,
          kind: "unsupported_record",
          message: `Payload is not canonical JSON: ${error instanceof Error ? error.message : String(error)}`,
        };
        break;
      }
      if (event.payloadHash !== actualPayloadHash) {
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
      if (
        event.eventId !==
        createEventIdentity({
          streamId: event.streamId,
          sequence: event.sequence,
          event,
          payloadHash: event.payloadHash,
        })
      ) {
        issue = {
          ...issueBase,
          kind: "unsupported_record",
          message: `Event identity mismatch at sequence ${event.sequence}.`,
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
      endsWithRecordTerminator:
        totalByteLength === 0 || buffer[totalByteLength - 1] === 0x0a,
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
        const handle = await open(this.journalPath(streamId), "r+");
        try {
          await handle.sync();
        } finally {
          await handle.close();
        }
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

  public async inspectLock(streamId: string): Promise<PersistenceLockInspection> {
    ensureStreamId(streamId);
    const path = this.lockPath(streamId);
    let details: Awaited<ReturnType<typeof lstat>>;
    try {
      details = await lstat(path);
    } catch (error) {
      if (asErrorCode(error) === "ENOENT") {
        return {
          streamId,
          path,
          status: "absent",
          metadata: null,
          ageMs: null,
          ownerAlive: null,
          reason: "No stream lock exists.",
        };
      }
      throw error;
    }
    if (!details.isFile() || details.isSymbolicLink()) {
      return {
        streamId,
        path,
        status: "invalid",
        metadata: null,
        ageMs: Math.max(0, this.now().getTime() - details.mtimeMs),
        ownerAlive: null,
        reason: "Lock path is not a regular file.",
      };
    }
    if (details.size > this.maxLockMetadataBytes) {
      return {
        streamId,
        path,
        status: "invalid",
        metadata: null,
        ageMs: Math.max(0, this.now().getTime() - details.mtimeMs),
        ownerAlive: null,
        reason: `Lock metadata exceeds maxLockMetadataBytes ${this.maxLockMetadataBytes}.`,
      };
    }
    let metadata: PersistenceLockMetadata | null = null;
    try {
      const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
      if (isLockMetadata(parsed)) {
        metadata = parsed;
      }
    } catch {
      // Reported as invalid below.
    }
    const nowMs = this.now().getTime();
    const fallbackAge = Math.max(0, nowMs - details.mtimeMs);
    if (metadata === null || metadata.streamId !== streamId) {
      return {
        streamId,
        path,
        status: "invalid",
        metadata,
        ageMs: fallbackAge,
        ownerAlive: null,
        reason: "Lock metadata is missing, malformed, or belongs to another stream.",
      };
    }
    const heartbeatMs = Date.parse(metadata.heartbeatAt);
    const ageMs = Number.isFinite(heartbeatMs)
      ? Math.max(0, nowMs - heartbeatMs)
      : fallbackAge;
    if (metadata.hostname !== hostname()) {
      return {
        streamId,
        path,
        status: "active",
        metadata,
        ageMs,
        ownerAlive: null,
        reason:
          "The lock belongs to another host and cannot be safely recovered from this process.",
      };
    }
    const ownerAlive = processLiveness(metadata.pid);
    if (ownerAlive === true) {
      return {
        streamId,
        path,
        status: "active",
        metadata,
        ageMs,
        ownerAlive,
        reason: "The lock owner process is alive.",
      };
    }
    if (ownerAlive === false) {
      return {
        streamId,
        path,
        status: "orphaned",
        metadata,
        ageMs,
        ownerAlive,
        reason: "The lock owner process no longer exists.",
      };
    }
    return {
      streamId,
      path,
      status: ageMs >= this.staleLockMs ? "expired_unknown_owner" : "active",
      metadata,
      ageMs,
      ownerAlive,
      reason:
        ageMs >= this.staleLockMs
          ? "The lock is expired and owner liveness could not be established."
          : "Owner liveness is unknown; the lock remains conservatively active.",
    };
  }

  public async recoverOrphanedLock(
    streamId: string,
    options: RecoverOrphanedLockOptions,
  ): Promise<PersistenceLockRecoveryResult> {
    if (!options.confirm) {
      throw new Error("Explicit confirm=true is required to recover a lock.");
    }
    const inspection = await this.inspectLock(streamId);
    if (inspection.status === "absent") {
      return {
        streamId,
        recovered: false,
        previousStatus: "absent",
        reason: "No lock exists.",
      };
    }
    if (inspection.status === "active") {
      throw new Error(`Refusing to remove active lock for stream "${streamId}".`);
    }
    if (inspection.status === "invalid") {
      throw new Error(
        `Refusing to remove invalid lock for stream "${streamId}" because ownership cannot be established. Preserve it for inspection and remove it manually only under operator control.`,
      );
    }
    if (
      options.expectedOwnerId !== undefined &&
      inspection.metadata?.ownerId !== options.expectedOwnerId
    ) {
      throw new Error("Lock owner changed after inspection; recovery was aborted.");
    }
    const ownerId = inspection.metadata?.ownerId;
    if (ownerId === undefined) {
      throw new Error(
        `Refusing to recover lock for stream "${streamId}" because ownership cannot be established.`,
      );
    }
    const removed = await this.removeOwnedLockAtomically(
      streamId,
      ownerId,
      "recovery",
    );
    return {
      streamId,
      recovered: removed,
      previousStatus: inspection.status,
      reason: removed
        ? inspection.reason
        : "The inspected lock disappeared before recovery could claim it.",
    };
  }

  public journalPath(streamId: string): string {
    return join(this.journalDirectory(), `${streamKey(streamId)}.jsonl`);
  }

  public lockPath(streamId: string): string {
    return join(this.journalDirectory(), `${streamKey(streamId)}.lock`);
  }

  private journalDirectory(): string {
    return join(this.rootDirectory, "journals");
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
    await assertDirectoryOrMissing(this.journalDirectory());
    await mkdir(this.journalDirectory(), { recursive: true, mode: 0o700 });
    await assertDirectoryOrMissing(this.journalDirectory());
    const path = this.lockPath(streamId);
    const ownerId = randomUUID();
    const createdAt = this.now().toISOString();
    const metadata: PersistenceLockMetadata = {
      formatVersion: 1,
      streamId,
      ownerId,
      pid: process.pid,
      hostname: hostname(),
      createdAt,
      heartbeatAt: createdAt,
    };
    const startedAt = performance.now();
    await this.faultInjector.trigger({
      point: "journal.before_lock",
      streamId,
      path,
    });
    while (true) {
      try {
        const handle = await open(
          path,
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
          0o600,
        );
        try {
          await handle.writeFile(`${canonicalJsonStringify(metadata)}\n`, "utf8");
          await handle.sync();
        } finally {
          await handle.close();
        }
        await syncDirectory(this.journalDirectory());
        break;
      } catch (error) {
        if (asErrorCode(error) !== "EEXIST") {
          throw error;
        }
        const lock = await this.inspectLock(streamId);
        if (lock.status === "absent") {
          continue;
        }
        if (performance.now() - startedAt >= this.lockTimeoutMs) {
          const suffix =
            lock.status === "orphaned" ||
            lock.status === "expired_unknown_owner" ||
            lock.status === "invalid"
              ? " Explicit lock recovery is required."
              : "";
          throw new Error(
            `Timed out waiting for stream lock "${streamId}" (${lock.status}).${suffix}`,
          );
        }
        await delay(this.lockRetryMs);
      }
    }
    await this.faultInjector.trigger({
      point: "journal.after_lock",
      streamId,
      path,
      metadata: { ownerId },
    });

    let result: T | undefined;
    let operationError: unknown;
    try {
      result = await operation();
    } catch (error) {
      operationError = error;
    }

    let releaseError: unknown;
    try {
      await this.faultInjector.trigger({
        point: "journal.before_unlock",
        streamId,
        path,
        metadata: { ownerId },
      });
    } catch (error) {
      releaseError = error;
    }
    try {
      await this.releaseOwnedLock(streamId, ownerId);
      await this.faultInjector.trigger({
        point: "journal.after_unlock",
        streamId,
        path,
        metadata: { ownerId },
      });
    } catch (error) {
      releaseError = releaseError ?? error;
    }

    if (operationError !== undefined && releaseError !== undefined) {
      throw new AggregateError(
        [operationError, releaseError],
        `Stream operation and lock release both failed for "${streamId}".`,
      );
    }
    if (operationError !== undefined) {
      throw operationError;
    }
    if (releaseError !== undefined) {
      throw releaseError;
    }
    return result as T;
  }

  private async releaseOwnedLock(
    streamId: string,
    ownerId: string,
  ): Promise<void> {
    await this.removeOwnedLockAtomically(streamId, ownerId, "release");
  }

  /**
   * Claims the current lock through an atomic rename before deleting it.
   *
   * A plain inspect-then-unlink sequence can delete a successor lock when the
   * path is replaced between those operations. Windows can also reject unlink
   * transiently while another process is reading the lock. The claim path
   * closes both gaps: the exact inode-like entry is moved aside, its owner is
   * verified again, and transient sharing violations are retried with bounded
   * backoff. A mismatched claimed lock is restored or preserved for operator
   * inspection; it is never deleted.
   */
  private async removeOwnedLockAtomically(
    streamId: string,
    ownerId: string,
    action: "release" | "recovery",
  ): Promise<boolean> {
    const lockPath = this.lockPath(streamId);
    const claimedPath = `${lockPath}.claimed-${process.pid}-${randomUUID()}`;
    let claimed = false;

    for (let attempt = 0; attempt < LOCK_FILESYSTEM_RETRY_LIMIT; attempt += 1) {
      const inspection = await this.inspectLock(streamId);
      if (inspection.status === "absent") {
        return false;
      }
      if (inspection.metadata?.ownerId !== ownerId) {
        throw new Error(
          `Refusing lock ${action} for stream "${streamId}" because ownership changed.`,
        );
      }

      try {
        await this.faultInjector.trigger({
          point: "journal.before_lock_claim",
          streamId,
          path: lockPath,
          metadata: { action, ownerId, claimedPath },
        });
        await rename(lockPath, claimedPath);
        claimed = true;
        break;
      } catch (error) {
        const code = asErrorCode(error);
        if (code === "ENOENT") {
          continue;
        }
        if (
          isRetryableLockFilesystemError(error) &&
          attempt + 1 < LOCK_FILESYSTEM_RETRY_LIMIT
        ) {
          await delay(Math.min(250, this.lockRetryMs * (attempt + 1)));
          continue;
        }
        throw error;
      }
    }

    if (!claimed) {
      throw new Error(
        `Unable to atomically claim lock for stream "${streamId}" during ${action}.`,
      );
    }

    try {
      await this.faultInjector.trigger({
        point: "journal.after_lock_claim",
        streamId,
        path: lockPath,
        metadata: { action, ownerId, claimedPath },
      });
    } catch (error) {
      try {
        await link(claimedPath, lockPath);
        await unlink(claimedPath);
      } catch (restoreError) {
        throw new AggregateError(
          [error, restoreError],
          `A fault occurred after claiming the lock for stream "${streamId}" and the claimed entry could not be restored without overwriting another owner. It remains preserved at ${claimedPath}.`,
        );
      }
      throw error;
    }

    let claimedMetadata: PersistenceLockMetadata | null = null;
    try {
      const parsed: unknown = JSON.parse(await readFile(claimedPath, "utf8"));
      if (isLockMetadata(parsed)) {
        claimedMetadata = parsed;
      }
    } catch {
      // Handled as an ownership mismatch below.
    }

    if (claimedMetadata?.ownerId !== ownerId) {
      let restored = false;
      try {
        await link(claimedPath, lockPath);
        await unlink(claimedPath);
        restored = true;
      } catch (restoreError) {
        if (asErrorCode(restoreError) !== "EEXIST") {
          throw new AggregateError(
            [restoreError],
            `Claimed lock ownership changed for stream "${streamId}" and the mismatched lock could not be restored. It remains preserved at ${claimedPath}.`,
          );
        }
      }
      throw new Error(
        restored
          ? `Lock changed during ${action} for stream "${streamId}"; the replacement lock was restored and no lock was deleted.`
          : `Lock changed during ${action} for stream "${streamId}"; another lock already occupies the path and the mismatched lock remains preserved at ${claimedPath}.`,
      );
    }

    for (let attempt = 0; attempt < LOCK_FILESYSTEM_RETRY_LIMIT; attempt += 1) {
      try {
        await this.faultInjector.trigger({
          point: "journal.before_lock_delete",
          streamId,
          path: lockPath,
          metadata: { action, ownerId, claimedPath },
        });
        await unlink(claimedPath);
      } catch (error) {
        if (asErrorCode(error) === "ENOENT") {
          await syncDirectory(this.journalDirectory());
          return true;
        }
        if (
          isRetryableLockFilesystemError(error) &&
          attempt + 1 < LOCK_FILESYSTEM_RETRY_LIMIT
        ) {
          await delay(Math.min(250, this.lockRetryMs * (attempt + 1)));
          continue;
        }

        try {
          await link(claimedPath, lockPath);
          await unlink(claimedPath);
        } catch (restoreError) {
          throw new AggregateError(
            [error, restoreError],
            `Lock ${action} failed for stream "${streamId}" and the claimed lock could not be restored without overwriting another owner. It may remain at ${claimedPath}.`,
          );
        }
        throw new Error(
          `Lock ${action} failed for stream "${streamId}" after atomic claim; the owned lock was restored: ${errorDescription(error)}`,
        );
      }

      await syncDirectory(this.journalDirectory());
      await this.faultInjector.trigger({
        point: "journal.after_lock_delete",
        streamId,
        path: lockPath,
        metadata: { action, ownerId, claimedPath },
      });
      return true;
    }

    throw new Error(
      `Lock ${action} retries were exhausted for stream "${streamId}".`,
    );
  }
}
