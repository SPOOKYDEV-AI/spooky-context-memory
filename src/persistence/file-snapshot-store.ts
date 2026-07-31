import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { clonePlainData } from "../utils/clone-plain-data.js";
import { stableStringify } from "../utils/stable-hash.js";
import {
  computeSnapshotHash,
  hashPlainData,
  sha256,
  verifySnapshotHash,
} from "./checksums.js";
import type {
  MemorySnapshot,
  SaveSnapshotInput,
  SnapshotInspection,
  SnapshotStore,
} from "./types.js";

export interface FileSnapshotStoreOptions {
  rootDirectory: string;
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

export class FileSnapshotStore implements SnapshotStore {
  private readonly rootDirectory: string;

  public constructor(options: FileSnapshotStoreOptions) {
    this.rootDirectory = options.rootDirectory;
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
    const createdAt = input.createdAt ?? new Date().toISOString();
    const state = clonePlainData(input.state);
    const stateHash = hashPlainData(state);
    const snapshotId = `snap_${sha256(
      stableStringify({
        streamId: input.streamId,
        sequence: input.sequence,
        eventHash: input.eventHash,
        schemaVersion: input.schemaVersion,
        stateHash,
      }),
    ).slice(0, 32)}`;
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
    await mkdir(this.snapshotDirectory(), { recursive: true });
    const finalPath = this.snapshotPath(input.streamId, input.sequence);
    const temporaryPath = `${finalPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryPath, `${stableStringify(snapshot)}\n`, "utf8");
    await rename(temporaryPath, finalPath);
    return clonePlainData(snapshot);
  }

  public async loadLatest<TState>(
    streamId: string,
  ): Promise<MemorySnapshot<TState> | null> {
    const snapshots = await this.readAll(streamId);
    for (const snapshot of snapshots) {
      if (snapshot.streamId === streamId && verifySnapshotHash(snapshot)) {
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
        const snapshot = JSON.parse(await readFile(filePath, "utf8")) as MemorySnapshot;
        const valid =
          snapshot.streamId === streamId && verifySnapshotHash(snapshot);
        inspections.push({
          snapshotId: snapshot.snapshotId ?? basename(filePath),
          valid,
          reason: valid
            ? "Snapshot checksum is valid."
            : snapshot.streamId !== streamId
              ? "Snapshot stream id does not match its storage location."
              : "Snapshot checksum or state hash is invalid.",
        });
      } catch (error) {
        inspections.push({
          snapshotId: basename(filePath),
          valid: false,
          reason: `Snapshot cannot be parsed: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
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

  private async snapshotFiles(streamId: string): Promise<string[]> {
    let entries: string[] = [];
    try {
      entries = await readdir(this.snapshotDirectory());
    } catch (error) {
      if (asErrorCode(error) !== "ENOENT") {
        throw error;
      }
    }
    const prefix = `${streamKey(streamId)}.`;
    return entries
      .filter(
        (entry) =>
          entry.startsWith(prefix) && entry.endsWith(".snapshot.json"),
      )
      .sort((left, right) => (parseSequence(right) ?? -1) - (parseSequence(left) ?? -1))
      .map((entry) => join(this.snapshotDirectory(), entry));
  }

  private async readAll(streamId: string): Promise<MemorySnapshot[]> {
    const files = await this.snapshotFiles(streamId);
    const snapshots: MemorySnapshot[] = [];
    for (const filePath of files) {
      try {
        const snapshot = JSON.parse(await readFile(filePath, "utf8")) as MemorySnapshot;
        snapshots.push(snapshot);
      } catch {
        // Invalid snapshots remain visible through inspect() but are skipped for loading.
      }
    }
    return snapshots;
  }
}
