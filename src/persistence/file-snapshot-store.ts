import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  unlink,
} from "node:fs/promises";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { clonePlainData } from "../utils/clone-plain-data.js";
import {
  canonicalJsonStringify,
  normalizeCanonicalJson,
} from "./canonical-json.js";
import {
  computeSnapshotHash,
  GENESIS_EVENT_HASH,
  hashPlainData,
  sha256,
  verifySnapshotHash,
} from "./checksums.js";
import {
  NoopPersistenceFaultInjector,
  type PersistenceFaultInjector,
} from "./fault-injection.js";
import type {
  MemorySnapshot,
  SaveSnapshotInput,
  SnapshotInspection,
  SnapshotStore,
} from "./types.js";

export interface FileSnapshotStoreOptions {
  rootDirectory: string;
  faultInjector?: PersistenceFaultInjector;
  now?: () => Date;
}

export interface CleanupSnapshotTemporaryFilesOptions {
  confirm: boolean;
  minimumAgeMs?: number;
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

function parseSequence(fileName: string): number | null {
  const match = fileName.match(/\.(\d+)\.snapshot\.json$/u);
  if (match?.[1] === undefined) {
    return null;
  }
  const sequence = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : null;
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
      throw new Error(`Snapshot directory is not a real directory: ${path}`);
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
      throw new Error(`Snapshot path is not a regular file: ${path}`);
    }
  } catch (error) {
    if (asErrorCode(error) !== "ENOENT") {
      throw error;
    }
  }
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

function temporaryOwnerPid(path: string): number | null {
  const match = basename(path).match(/\.snapshot\.json\.(\d+)\.[^.]+\.tmp$/u);
  if (match?.[1] === undefined) {
    return null;
  }
  const pid = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
}

const SNAPSHOT_KEYS = new Set([
  "snapshotId",
  "streamId",
  "sequence",
  "eventHash",
  "schemaVersion",
  "state",
  "stateHash",
  "snapshotHash",
  "createdAt",
]);

function expectedSnapshotId(snapshot: {
  streamId: string;
  sequence: number;
  eventHash: string;
  schemaVersion: number;
  stateHash: string;
}): string {
  return `snap_${sha256(
    canonicalJsonStringify({
      streamId: snapshot.streamId,
      sequence: snapshot.sequence,
      eventHash: snapshot.eventHash,
      schemaVersion: snapshot.schemaVersion,
      stateHash: snapshot.stateHash,
    }),
  ).slice(0, 32)}`;
}

function isMemorySnapshotEnvelope(value: unknown): value is MemorySnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const snapshot = value as Record<string, unknown>;
  return (
    Object.keys(snapshot).every((key) => SNAPSHOT_KEYS.has(key)) &&
    Object.keys(snapshot).length === SNAPSHOT_KEYS.size &&
    typeof snapshot.snapshotId === "string" &&
    /^snap_[a-f0-9]{32}$/u.test(snapshot.snapshotId) &&
    typeof snapshot.streamId === "string" &&
    snapshot.streamId.trim().length > 0 &&
    Number.isSafeInteger(snapshot.sequence) &&
    (snapshot.sequence as number) >= 0 &&
    typeof snapshot.eventHash === "string" &&
    (snapshot.eventHash === GENESIS_EVENT_HASH ||
      /^[a-f0-9]{64}$/u.test(snapshot.eventHash)) &&
    Number.isSafeInteger(snapshot.schemaVersion) &&
    (snapshot.schemaVersion as number) >= 1 &&
    "state" in snapshot &&
    typeof snapshot.stateHash === "string" &&
    /^[a-f0-9]{64}$/u.test(snapshot.stateHash) &&
    typeof snapshot.snapshotHash === "string" &&
    /^[a-f0-9]{64}$/u.test(snapshot.snapshotHash) &&
    typeof snapshot.createdAt === "string" &&
    Number.isFinite(Date.parse(snapshot.createdAt)) &&
    snapshot.snapshotId ===
      expectedSnapshotId(snapshot as {
        streamId: string;
        sequence: number;
        eventHash: string;
        schemaVersion: number;
        stateHash: string;
      }) &&
    verifySnapshotHash(snapshot as unknown as MemorySnapshot)
  );
}

export class FileSnapshotStore implements SnapshotStore {
  private readonly rootDirectory: string;
  private readonly faultInjector: PersistenceFaultInjector;
  private readonly now: () => Date;

  public constructor(options: FileSnapshotStoreOptions) {
    this.rootDirectory = options.rootDirectory;
    if (this.rootDirectory.trim().length === 0) {
      throw new Error("Persistence root directory cannot be empty.");
    }
    this.faultInjector =
      options.faultInjector ?? new NoopPersistenceFaultInjector();
    this.now = options.now ?? (() => new Date());
  }

  public async save<TState>(
    input: SaveSnapshotInput<TState>,
  ): Promise<MemorySnapshot<TState>> {
    if (input.streamId.trim().length === 0) {
      throw new Error("Stream id cannot be empty.");
    }
    if (!Number.isSafeInteger(input.sequence) || input.sequence < 0) {
      throw new Error("Snapshot sequence must be a non-negative integer.");
    }
    if (!Number.isSafeInteger(input.schemaVersion) || input.schemaVersion < 1) {
      throw new Error("Snapshot schema version must be a positive integer.");
    }
    const createdAt = input.createdAt ?? this.now().toISOString();
    if (typeof createdAt !== "string" || !Number.isFinite(Date.parse(createdAt))) {
      throw new Error("Snapshot creation timestamp must be valid.");
    }
    if (
      typeof input.eventHash !== "string" ||
      (input.eventHash !== GENESIS_EVENT_HASH &&
        !/^[a-f0-9]{64}$/u.test(input.eventHash))
    ) {
      throw new Error("Snapshot event hash is invalid.");
    }
    const state = normalizeCanonicalJson(input.state) as unknown as TState;
    const stateHash = hashPlainData(state);
    const snapshotId = expectedSnapshotId({
      streamId: input.streamId,
      sequence: input.sequence,
      eventHash: input.eventHash,
      schemaVersion: input.schemaVersion,
      stateHash,
    });
    const withoutHash: Omit<MemorySnapshot<TState>, "snapshotHash"> = {
      snapshotId,
      streamId: input.streamId,
      sequence: input.sequence,
      eventHash: input.eventHash,
      schemaVersion: input.schemaVersion,
      state,
      stateHash,
      createdAt,
    };
    const snapshot: MemorySnapshot<TState> = {
      ...withoutHash,
      snapshotHash: computeSnapshotHash(withoutHash),
    };
    await assertDirectoryOrMissing(this.snapshotDirectory());
    await mkdir(this.snapshotDirectory(), { recursive: true });
    await assertDirectoryOrMissing(this.snapshotDirectory());
    const finalPath = this.snapshotPath(input.streamId, input.sequence);
    await assertRegularFileOrMissing(finalPath);

    try {
      const existing = JSON.parse(
        await readFile(finalPath, "utf8"),
      ) as MemorySnapshot<TState>;
      if (
        isMemorySnapshotEnvelope(existing) &&
        existing.streamId === input.streamId &&
        existing.sequence === input.sequence &&
        existing.snapshotHash === snapshot.snapshotHash
      ) {
        return clonePlainData(existing);
      }
      throw new Error(
        `Refusing to replace immutable snapshot at sequence ${input.sequence}.`,
      );
    } catch (error) {
      if (asErrorCode(error) !== "ENOENT") {
        if (
          error instanceof SyntaxError ||
          (error instanceof Error && error.message.startsWith("Refusing"))
        ) {
          throw error;
        }
        throw error;
      }
    }

    const temporaryPath = `${finalPath}.${process.pid}.${randomUUID()}.tmp`;
    await this.faultInjector.trigger({
      point: "snapshot.before_write",
      streamId: input.streamId,
      path: temporaryPath,
      sequence: input.sequence,
    });
    const handle = await open(temporaryPath, "wx");
    let renamed = false;
    try {
      await handle.writeFile(`${canonicalJsonStringify(snapshot)}\n`, "utf8");
      await this.faultInjector.trigger({
        point: "snapshot.after_write",
        streamId: input.streamId,
        path: temporaryPath,
        sequence: input.sequence,
      });
      await this.faultInjector.trigger({
        point: "snapshot.before_fsync",
        streamId: input.streamId,
        path: temporaryPath,
        sequence: input.sequence,
      });
      await handle.sync();
      await this.faultInjector.trigger({
        point: "snapshot.after_fsync",
        streamId: input.streamId,
        path: temporaryPath,
        sequence: input.sequence,
      });
      await handle.close();
      await this.faultInjector.trigger({
        point: "snapshot.before_rename",
        streamId: input.streamId,
        path: finalPath,
        sequence: input.sequence,
      });
      try {
        await link(temporaryPath, finalPath);
      } catch (error) {
        if (asErrorCode(error) !== "EEXIST") {
          throw error;
        }
        const concurrent: unknown = JSON.parse(await readFile(finalPath, "utf8"));
        if (
          !isMemorySnapshotEnvelope(concurrent) ||
          concurrent.streamId !== input.streamId ||
          concurrent.sequence !== input.sequence ||
          concurrent.snapshotHash !== snapshot.snapshotHash
        ) {
          throw new Error(
            `Refusing to replace immutable snapshot at sequence ${input.sequence}.`,
          );
        }
      }
      await unlink(temporaryPath);
      renamed = true;
      await syncDirectory(this.snapshotDirectory());
      await this.faultInjector.trigger({
        point: "snapshot.after_rename",
        streamId: input.streamId,
        path: finalPath,
        sequence: input.sequence,
      });
    } catch (error) {
      try {
        await handle.close();
      } catch {
        // Preserve the primary failure.
      }
      if (!renamed) {
        try {
          await unlink(temporaryPath);
        } catch (cleanupError) {
          if (asErrorCode(cleanupError) !== "ENOENT") {
            throw new AggregateError(
              [error, cleanupError],
              "Snapshot write failed and the temporary file could not be removed.",
            );
          }
        }
      }
      throw error;
    }
    return clonePlainData(snapshot);
  }

  public async loadLatest<TState>(
    streamId: string,
  ): Promise<MemorySnapshot<TState> | null> {
    const snapshots = await this.readAll(streamId);
    for (const snapshot of snapshots) {
      if (
        isMemorySnapshotEnvelope(snapshot) &&
        snapshot.streamId === streamId
      ) {
        return clonePlainData(snapshot) as MemorySnapshot<TState>;
      }
    }
    return null;
  }

  public async list(streamId: string): Promise<MemorySnapshot[]> {
    const snapshots = await this.readAll(streamId);
    return snapshots.map((snapshot) => clonePlainData(snapshot));
  }

  public async inspect(streamId: string): Promise<SnapshotInspection[]> {
    const files = await this.snapshotFiles(streamId);
    const inspections: SnapshotInspection[] = [];
    for (const filePath of files) {
      try {
        await assertRegularFileOrMissing(filePath);
        const snapshot = JSON.parse(
          await readFile(filePath, "utf8"),
        ) as MemorySnapshot;
        const storedSequence = parseSequence(basename(filePath));
        const valid =
          isMemorySnapshotEnvelope(snapshot) &&
          snapshot.streamId === streamId &&
          snapshot.sequence === storedSequence &&
          basename(filePath) ===
            basename(this.snapshotPath(streamId, snapshot.sequence));
        inspections.push({
          snapshotId: snapshot.snapshotId ?? basename(filePath),
          valid,
          reason: valid
            ? "Snapshot checksum is valid."
            : !isMemorySnapshotEnvelope(snapshot)
              ? "Snapshot envelope, identity, checksum, or state hash is invalid."
              : snapshot.streamId !== streamId
                ? "Snapshot stream id does not match its storage location."
                : "Snapshot sequence does not match its storage filename.",
        });
      } catch (error) {
        inspections.push({
          snapshotId: basename(filePath),
          valid: false,
          reason: `Snapshot cannot be parsed: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
    for (const filePath of await this.temporaryFiles(streamId)) {
      inspections.push({
        snapshotId: basename(filePath),
        valid: false,
        reason: "Abandoned temporary snapshot file requires cleanup.",
      });
    }
    return inspections;
  }

  public async prune(streamId: string, keepLatest: number): Promise<string[]> {
    if (!Number.isSafeInteger(keepLatest) || keepLatest < 1) {
      throw new Error("At least one snapshot must be retained.");
    }
    const files = await this.snapshotFiles(streamId);
    const removable = files.slice(keepLatest);
    const deleted: string[] = [];
    for (const filePath of removable) {
      await unlink(filePath);
      deleted.push(basename(filePath));
    }
    if (deleted.length > 0) {
      await syncDirectory(this.snapshotDirectory());
    }
    return deleted;
  }

  public async cleanupTemporaryFiles(
    streamId: string,
    options: CleanupSnapshotTemporaryFilesOptions,
  ): Promise<string[]> {
    if (!options.confirm) {
      throw new Error(
        "Explicit confirm=true is required to clean snapshot temporary files.",
      );
    }
    const minimumAgeMs = options.minimumAgeMs ?? 30_000;
    if (!Number.isFinite(minimumAgeMs) || minimumAgeMs < 0) {
      throw new Error("minimumAgeMs must be a finite non-negative number.");
    }
    const files = await this.temporaryFiles(streamId);
    const deleted: string[] = [];
    const nowMs = this.now().getTime();
    for (const filePath of files) {
      const details = await lstat(filePath);
      const ageMs = Math.max(0, nowMs - details.mtimeMs);
      const ownerPid = temporaryOwnerPid(filePath);
      const ownerAlive = ownerPid === null ? null : processLiveness(ownerPid);
      if (ageMs < minimumAgeMs || ownerAlive === true || ownerAlive === null && ownerPid !== null) {
        continue;
      }
      await unlink(filePath);
      deleted.push(basename(filePath));
    }
    if (deleted.length > 0) {
      await syncDirectory(this.snapshotDirectory());
    }
    return deleted;
  }

  public snapshotPath(streamId: string, sequence: number): string {
    return join(
      this.snapshotDirectory(),
      `${streamKey(streamId)}.${String(sequence).padStart(16, "0")}.snapshot.json`,
    );
  }

  private snapshotDirectory(): string {
    return join(this.rootDirectory, "snapshots");
  }

  private async entries(): Promise<string[]> {
    await assertDirectoryOrMissing(this.snapshotDirectory());
    try {
      return await readdir(this.snapshotDirectory());
    } catch (error) {
      if (asErrorCode(error) !== "ENOENT") {
        throw error;
      }
      return [];
    }
  }

  private async snapshotFiles(streamId: string): Promise<string[]> {
    const prefix = `${streamKey(streamId)}.`;
    const canonicalPattern = new RegExp(
      `^${streamKey(streamId)}\\.\\d{16}\\.snapshot\\.json$`,
      "u",
    );
    return (await this.entries())
      .filter((entry) => entry.startsWith(prefix) && canonicalPattern.test(entry))
      .sort(
        (left, right) =>
          (parseSequence(right) ?? -1) - (parseSequence(left) ?? -1),
      )
      .map((entry) => join(this.snapshotDirectory(), entry));
  }

  private async temporaryFiles(streamId: string): Promise<string[]> {
    const prefix = `${streamKey(streamId)}.`;
    return (await this.entries())
      .filter((entry) => entry.startsWith(prefix) && entry.endsWith(".tmp"))
      .sort()
      .map((entry) => join(this.snapshotDirectory(), entry));
  }

  private async readAll(streamId: string): Promise<MemorySnapshot[]> {
    const files = await this.snapshotFiles(streamId);
    const snapshots: MemorySnapshot[] = [];
    for (const filePath of files) {
      try {
        await assertRegularFileOrMissing(filePath);
        const snapshot: unknown = JSON.parse(
          await readFile(filePath, "utf8"),
        );
        const sequence = parseSequence(basename(filePath));
        if (
          isMemorySnapshotEnvelope(snapshot) &&
          snapshot.streamId === streamId &&
          snapshot.sequence === sequence &&
          basename(filePath) ===
            basename(this.snapshotPath(streamId, snapshot.sequence))
        ) {
          snapshots.push(snapshot);
        }
      } catch {
        // Invalid snapshots remain visible through inspect() but are skipped for loading.
      }
    }
    return snapshots;
  }
}
