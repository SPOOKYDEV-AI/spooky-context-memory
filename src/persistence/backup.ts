import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { randomUUID } from "node:crypto";
import { canonicalJsonStringify } from "./canonical-json.js";
import { GENESIS_EVENT_HASH, hashPlainData, sha256 } from "./checksums.js";
import { FileEventJournal } from "./file-event-journal.js";
import { FileSnapshotStore } from "./file-snapshot-store.js";
import {
  NoopPersistenceFaultInjector,
  type PersistenceFaultInjector,
} from "./fault-injection.js";
import { isCanonicalUtcTimestamp } from "./timestamps.js";
import type {
  BackupFileRecord,
  BackupSnapshotRecord,
  BackupStreamRecord,
  PersistenceBackupManifest,
  PersistenceBackupVerification,
} from "./types.js";

export interface CreatePersistenceBackupOptions {
  sourceRootDirectory: string;
  destinationDirectory: string;
  streamIds: string[];
  sourcePackageVersion: string;
  createdAt?: string;
  replaceExisting?: boolean;
  confirmReplace?: boolean;
  faultInjector?: PersistenceFaultInjector;
}

export interface RestorePersistenceBackupOptions {
  backupDirectory: string;
  targetRootDirectory: string;
  confirm: boolean;
  replaceExisting?: boolean;
  faultInjector?: PersistenceFaultInjector;
}

export interface PersistenceRestoreResult {
  restored: boolean;
  targetRootDirectory: string;
  previousDirectory: string | null;
  streamIds: string[];
  reason: string;
}

const JOURNAL_BACKUP_PATH = /^journals\/[a-f0-9]{40}\.jsonl$/u;
const SNAPSHOT_BACKUP_PATH =
  /^snapshots\/[a-f0-9]{40}\.\d{16}\.snapshot\.json$/u;

function asErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (asErrorCode(error) === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function writeDurableFile(
  path: string,
  data: string | Uint8Array,
): Promise<void> {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
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

async function canonicalPotentialPath(path: string): Promise<string> {
  let current = resolve(path);
  const missingSegments: string[] = [];
  while (true) {
    try {
      const existing = await realpath(current);
      return resolve(existing, ...missingSegments);
    } catch (error) {
      if (asErrorCode(error) !== "ENOENT") {
        throw error;
      }
      const parent = dirname(current);
      if (parent === current) {
        throw error;
      }
      missingSegments.unshift(basename(current));
      current = parent;
    }
  }
}

async function pathsOverlap(left: string, right: string): Promise<boolean> {
  const leftResolved = await canonicalPotentialPath(left);
  const rightResolved = await canonicalPotentialPath(right);
  const leftToRight = relative(leftResolved, rightResolved);
  const rightToLeft = relative(rightResolved, leftResolved);
  const isInside = (value: string): boolean =>
    value === "" ||
    (value !== ".." &&
      !value.startsWith(`..${sep}`) &&
      !isAbsolute(value));
  return isInside(leftToRight) || isInside(rightToLeft);
}

async function assertRegularFile(path: string): Promise<void> {
  const details = await lstat(path);
  if (!details.isFile() || details.isSymbolicLink()) {
    throw new Error(`Backup path is not a regular file: ${path}`);
  }
}

async function readRegularFile(path: string): Promise<Buffer> {
  await assertRegularFile(path);
  return readFile(path);
}

async function readRegularUtf8(path: string): Promise<string> {
  await assertRegularFile(path);
  return readFile(path, "utf8");
}

function portableRelativePath(
  kind: "journals" | "snapshots",
  fileName: string,
): string {
  return `${kind}/${basename(fileName)}`;
}

function resolveBackupRecordPath(root: string, relativePath: string): string {
  const valid =
    JOURNAL_BACKUP_PATH.test(relativePath) ||
    SNAPSHOT_BACKUP_PATH.test(relativePath);
  if (!valid || relativePath.includes("\\") || relativePath.includes("\0")) {
    throw new Error(`Unsafe or unsupported backup path: ${relativePath}`);
  }
  const segments = relativePath.split("/");
  return join(root, ...segments);
}

async function fileRecord(
  absolutePath: string,
  relativePath: string,
): Promise<BackupFileRecord> {
  resolveBackupRecordPath(".", relativePath);
  const bytes = await readRegularFile(absolutePath);
  return {
    relativePath,
    byteLength: bytes.length,
    sha256: sha256(bytes),
  };
}

function manifestWithoutHash(
  manifest: PersistenceBackupManifest,
): Omit<PersistenceBackupManifest, "manifestHash"> {
  const { manifestHash: _manifestHash, ...withoutHash } = manifest;
  return withoutHash;
}

const BACKUP_FILE_KEYS = new Set(["relativePath", "byteLength", "sha256"]);
const BACKUP_SNAPSHOT_KEYS = new Set([
  ...BACKUP_FILE_KEYS,
  "snapshotId",
  "sequence",
  "eventHash",
  "stateHash",
  "snapshotHash",
]);
const BACKUP_STREAM_KEYS = new Set([
  "streamId",
  "journal",
  "eventCount",
  "latestSequence",
  "latestEventHash",
  "snapshots",
]);
const BACKUP_MANIFEST_KEYS = new Set([
  "format",
  "formatVersion",
  "createdAt",
  "sourcePackageVersion",
  "streams",
  "manifestHash",
]);

function hasExactKeys(
  record: Record<string, unknown>,
  expected: ReadonlySet<string>,
): boolean {
  const keys = Object.keys(record);
  return keys.length === expected.size && keys.every((key) => expected.has(key));
}

function isBackupFileRecord(value: unknown): value is BackupFileRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    hasExactKeys(record, BACKUP_FILE_KEYS) &&
    typeof record.relativePath === "string" &&
    Number.isSafeInteger(record.byteLength) &&
    (record.byteLength as number) >= 0 &&
    typeof record.sha256 === "string" &&
    /^[a-f0-9]{64}$/u.test(record.sha256)
  );
}

function isBackupSnapshotRecord(value: unknown): value is BackupSnapshotRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    hasExactKeys(record, BACKUP_SNAPSHOT_KEYS) &&
    typeof record.relativePath === "string" &&
    Number.isSafeInteger(record.byteLength) &&
    (record.byteLength as number) >= 0 &&
    typeof record.sha256 === "string" &&
    /^[a-f0-9]{64}$/u.test(record.sha256) &&
    typeof record.snapshotId === "string" &&
    /^snap_[a-f0-9]{32}$/u.test(record.snapshotId) &&
    Number.isSafeInteger(record.sequence) &&
    (record.sequence as number) >= 0 &&
    typeof record.eventHash === "string" &&
    record.eventHash.trim().length > 0 &&
    typeof record.stateHash === "string" &&
    /^[a-f0-9]{64}$/u.test(record.stateHash) &&
    typeof record.snapshotHash === "string" &&
    /^[a-f0-9]{64}$/u.test(record.snapshotHash)
  );
}

function isBackupStreamRecord(value: unknown): value is BackupStreamRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const stream = value as Record<string, unknown>;
  return (
    hasExactKeys(stream, BACKUP_STREAM_KEYS) &&
    typeof stream.streamId === "string" &&
    stream.streamId.trim().length > 0 &&
    (stream.journal === null || isBackupFileRecord(stream.journal)) &&
    Number.isSafeInteger(stream.eventCount) &&
    (stream.eventCount as number) >= 0 &&
    Number.isSafeInteger(stream.latestSequence) &&
    (stream.latestSequence as number) >= 0 &&
    typeof stream.latestEventHash === "string" &&
    (stream.latestEventHash === GENESIS_EVENT_HASH ||
      /^[a-f0-9]{64}$/u.test(stream.latestEventHash)) &&
    Array.isArray(stream.snapshots) &&
    stream.snapshots.every(isBackupSnapshotRecord)
  );
}

function isPersistenceBackupManifest(
  value: unknown,
): value is PersistenceBackupManifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const manifest = value as Record<string, unknown>;
  return (
    hasExactKeys(manifest, BACKUP_MANIFEST_KEYS) &&
    manifest.format === "spooky-context-memory-backup" &&
    manifest.formatVersion === 1 &&
    typeof manifest.createdAt === "string" &&
    isCanonicalUtcTimestamp(manifest.createdAt) &&
    typeof manifest.sourcePackageVersion === "string" &&
    manifest.sourcePackageVersion.trim().length > 0 &&
    Array.isArray(manifest.streams) &&
    manifest.streams.every(isBackupStreamRecord) &&
    typeof manifest.manifestHash === "string" &&
    /^[a-f0-9]{64}$/u.test(manifest.manifestHash)
  );
}

async function copyRecordedFile(
  source: string,
  destinationRoot: string,
  record: BackupFileRecord,
): Promise<void> {
  const destination = resolveBackupRecordPath(
    destinationRoot,
    record.relativePath,
  );
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  const bytes = await readRegularFile(source);
  if (bytes.length !== record.byteLength || sha256(bytes) !== record.sha256) {
    throw new Error(
      `Source changed while copying backup record: ${record.relativePath}.`,
    );
  }
  await writeDurableFile(destination, bytes);
  await syncDirectory(dirname(destination));
}

async function validateClosedBackupTree(
  root: string,
  expectedRelativeFiles: ReadonlySet<string>,
): Promise<string[]> {
  const errors: string[] = [];
  const expectedDirectories = new Set<string>();
  for (const relativePath of expectedRelativeFiles) {
    const parts = relativePath.split("/");
    parts.pop();
    let accumulated = "";
    for (const part of parts) {
      accumulated = accumulated.length === 0 ? part : `${accumulated}/${part}`;
      expectedDirectories.add(accumulated);
    }
  }

  const walk = async (absoluteDirectory: string, relativeDirectory: string): Promise<void> => {
    for (const entry of await readdir(absoluteDirectory)) {
      const absolutePath = join(absoluteDirectory, entry);
      const relativePath =
        relativeDirectory.length === 0 ? entry : `${relativeDirectory}/${entry}`;
      const details = await lstat(absolutePath);
      if (details.isSymbolicLink()) {
        errors.push(`Backup contains symbolic-link entry: ${relativePath}.`);
      } else if (details.isDirectory()) {
        if (!expectedDirectories.has(relativePath)) {
          errors.push(`Backup contains unexpected directory: ${relativePath}.`);
        } else {
          await walk(absolutePath, relativePath);
        }
      } else if (details.isFile()) {
        if (!expectedRelativeFiles.has(relativePath)) {
          errors.push(`Backup contains unexpected file: ${relativePath}.`);
        }
      } else {
        errors.push(`Backup contains unsupported filesystem entry: ${relativePath}.`);
      }
    }
  };

  try {
    const rootDetails = await lstat(root);
    if (!rootDetails.isDirectory() || rootDetails.isSymbolicLink()) {
      return [`Backup root is not a real directory: ${root}.`];
    }
    await walk(root, "");
  } catch (error) {
    errors.push(
      `Backup tree cannot be inspected: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return errors;
}

function recordsForStream(stream: BackupStreamRecord): BackupFileRecord[] {
  return [
    ...(stream.journal === null ? [] : [stream.journal]),
    ...stream.snapshots,
  ];
}

function requireNonEmptyValue(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${name} cannot be empty.`);
  }
}

export async function createPersistenceBackup(
  options: CreatePersistenceBackupOptions,
): Promise<PersistenceBackupManifest> {
  requireNonEmptyValue("Backup source root directory", options.sourceRootDirectory);
  requireNonEmptyValue("Backup destination directory", options.destinationDirectory);
  requireNonEmptyValue("Source package version", options.sourcePackageVersion);
  if (await pathsOverlap(options.sourceRootDirectory, options.destinationDirectory)) {
    throw new Error(
      "Backup destination must not overlap the source runtime directory.",
    );
  }
  if (options.streamIds.length === 0) {
    throw new Error("At least one stream id is required for backup.");
  }
  const uniqueStreamIds = [...new Set(options.streamIds)].sort();
  if (uniqueStreamIds.some((streamId) => streamId.trim().length === 0)) {
    throw new Error("Backup stream ids cannot be empty.");
  }
  const destinationExists = await exists(options.destinationDirectory);
  if (destinationExists && !options.replaceExisting) {
    throw new Error("Backup destination already exists.");
  }
  if (
    destinationExists &&
    options.replaceExisting &&
    options.confirmReplace !== true
  ) {
    throw new Error(
      "Replacing an existing backup requires confirmReplace=true.",
    );
  }

  const faultInjector =
    options.faultInjector ?? new NoopPersistenceFaultInjector();
  const temporaryDirectory = `${options.destinationDirectory}.tmp-${randomUUID()}`;
  const previousDirectory = destinationExists
    ? `${options.destinationDirectory}.previous-${randomUUID()}`
    : null;
  await rm(temporaryDirectory, { recursive: true, force: true });
  await mkdir(temporaryDirectory, { recursive: true, mode: 0o700 });
  const journal = new FileEventJournal({
    rootDirectory: options.sourceRootDirectory,
  });
  const snapshots = new FileSnapshotStore({
    rootDirectory: options.sourceRootDirectory,
  });
  const streamRecords: BackupStreamRecord[] = [];

  try {
    for (const streamId of uniqueStreamIds) {
      const inspection = await journal.inspect(streamId);
      if (inspection.issue !== null) {
        throw new Error(
          `Cannot back up corrupted stream "${streamId}": ${inspection.issue.message}`,
        );
      }
      const snapshotInspections = await snapshots.inspect(streamId);
      const invalidSnapshots = snapshotInspections.filter((item) => !item.valid);
      if (invalidSnapshots.length > 0) {
        throw new Error(
          `Cannot back up stream "${streamId}" while invalid snapshot artifacts exist.`,
        );
      }
      await faultInjector.trigger({
        point: "backup.before_copy",
        streamId,
      });

      let journalRecord: BackupFileRecord | null = null;
      const sourceJournalPath = journal.journalPath(streamId);
      if (await exists(sourceJournalPath)) {
        const relativePath = portableRelativePath(
          "journals",
          sourceJournalPath,
        );
        journalRecord = await fileRecord(sourceJournalPath, relativePath);
        await copyRecordedFile(
          sourceJournalPath,
          temporaryDirectory,
          journalRecord,
        );
      }

      const snapshotRecords: BackupSnapshotRecord[] = [];
      for (const snapshot of await snapshots.list(streamId)) {
        const sourceSnapshotPath = snapshots.snapshotPath(
          streamId,
          snapshot.sequence,
        );
        const relativePath = portableRelativePath(
          "snapshots",
          sourceSnapshotPath,
        );
        const record = await fileRecord(sourceSnapshotPath, relativePath);
        const snapshotRecord: BackupSnapshotRecord = {
          ...record,
          snapshotId: snapshot.snapshotId,
          sequence: snapshot.sequence,
          eventHash: snapshot.eventHash,
          stateHash: snapshot.stateHash,
          snapshotHash: snapshot.snapshotHash,
        };
        await copyRecordedFile(
          sourceSnapshotPath,
          temporaryDirectory,
          snapshotRecord,
        );
        const anchor =
          snapshot.sequence === 0
            ? GENESIS_EVENT_HASH
            : inspection.events[snapshot.sequence - 1]?.eventHash;
        if (anchor === undefined || anchor !== snapshot.eventHash) {
          throw new Error(
            `Snapshot ${snapshot.snapshotId} is not anchored to journal sequence ${snapshot.sequence}.`,
          );
        }
        snapshotRecords.push(snapshotRecord);
      }
      snapshotRecords.sort((left, right) => left.sequence - right.sequence);
      streamRecords.push({
        streamId,
        journal: journalRecord,
        eventCount: inspection.events.length,
        latestSequence: inspection.validThroughSequence,
        latestEventHash: inspection.validThroughHash,
        snapshots: snapshotRecords,
      });
      await faultInjector.trigger({
        point: "backup.after_copy",
        streamId,
      });
    }

    await faultInjector.trigger({ point: "backup.before_manifest" });
    const createdAt = options.createdAt ?? new Date().toISOString();
    if (!isCanonicalUtcTimestamp(createdAt)) {
      throw new Error("Backup timestamp must be valid canonical UTC.");
    }
    const withoutHash: Omit<PersistenceBackupManifest, "manifestHash"> = {
      format: "spooky-context-memory-backup",
      formatVersion: 1,
      createdAt,
      sourcePackageVersion: options.sourcePackageVersion,
      streams: streamRecords,
    };
    const manifest: PersistenceBackupManifest = {
      ...withoutHash,
      manifestHash: hashPlainData(withoutHash),
    };
    const checksums = Object.fromEntries(
      streamRecords.flatMap((stream) =>
        recordsForStream(stream).map(
          (record) => [record.relativePath, record.sha256] as const,
        ),
      ),
    );
    await writeDurableFile(
      join(temporaryDirectory, "manifest.json"),
      `${canonicalJsonStringify(manifest)}\n`,
    );
    await writeDurableFile(
      join(temporaryDirectory, "checksums.json"),
      `${canonicalJsonStringify(checksums)}\n`,
    );
    await syncDirectory(temporaryDirectory);
    await faultInjector.trigger({ point: "backup.after_manifest" });

    const verification = await verifyPersistenceBackup(temporaryDirectory);
    if (!verification.valid) {
      throw new Error(
        `Created backup failed self-verification: ${verification.errors.join("; ")}`,
      );
    }

    await faultInjector.trigger({ point: "backup.before_replace" });
    const destinationParent = dirname(options.destinationDirectory);
    await mkdir(destinationParent, { recursive: true, mode: 0o700 });
    await syncDirectory(destinationParent);
    if (destinationExists && previousDirectory !== null) {
      await rename(options.destinationDirectory, previousDirectory);
      await syncDirectory(destinationParent);
    }
    let published = false;
    try {
      await rename(temporaryDirectory, options.destinationDirectory);
      published = true;
      await syncDirectory(destinationParent);
    } catch (error) {
      if (
        !published &&
        previousDirectory !== null &&
        (await exists(previousDirectory))
      ) {
        try {
          await rename(previousDirectory, options.destinationDirectory);
          await syncDirectory(destinationParent);
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            "Backup publication failed and the previous backup could not be restored.",
          );
        }
      }
      throw error;
    }
    await faultInjector.trigger({ point: "backup.after_replace" });
    if (previousDirectory !== null && (await exists(previousDirectory))) {
      await rm(previousDirectory, { recursive: true, force: true });
      await syncDirectory(destinationParent);
    }
    return manifest;
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

export async function verifyPersistenceBackup(
  backupDirectory: string,
): Promise<PersistenceBackupVerification> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let manifest: PersistenceBackupManifest | null = null;
  try {
    const parsed: unknown = JSON.parse(
      await readRegularUtf8(join(backupDirectory, "manifest.json")),
    );
    if (!isPersistenceBackupManifest(parsed)) {
      throw new Error("Manifest does not match backup format version 1.");
    }
    manifest = parsed;
  } catch (error) {
    errors.push(
      `Backup manifest cannot be read: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      valid: false,
      manifest: null,
      checkedFileCount: 0,
      errors,
      warnings,
    };
  }

  try {
    if (hashPlainData(manifestWithoutHash(manifest)) !== manifest.manifestHash) {
      errors.push("Backup manifest hash mismatch.");
    }
  } catch (error) {
    errors.push(
      `Backup manifest is not canonical JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const streamIds = new Set<string>();
  const relativePaths = new Set<string>();
  const expectedChecksums: Record<string, string> = {};
  let checkedFileCount = 0;

  for (const stream of manifest.streams) {
    if (streamIds.has(stream.streamId)) {
      errors.push(`Duplicate backup stream id: ${stream.streamId}.`);
    }
    streamIds.add(stream.streamId);

    const expectedJournalPath = portableRelativePath(
      "journals",
      new FileEventJournal({ rootDirectory: backupDirectory }).journalPath(
        stream.streamId,
      ),
    );
    if (
      stream.journal !== null &&
      stream.journal.relativePath !== expectedJournalPath
    ) {
      errors.push(
        `Backup journal path does not match stream "${stream.streamId}".`,
      );
    }
    const pathSnapshotStore = new FileSnapshotStore({
      rootDirectory: backupDirectory,
    });
    for (const snapshot of stream.snapshots) {
      const expectedSnapshotPath = portableRelativePath(
        "snapshots",
        pathSnapshotStore.snapshotPath(stream.streamId, snapshot.sequence),
      );
      if (snapshot.relativePath !== expectedSnapshotPath) {
        errors.push(
          `Backup snapshot path does not match stream "${stream.streamId}" sequence ${snapshot.sequence}.`,
        );
      }
    }

    for (const record of recordsForStream(stream)) {
      checkedFileCount += 1;
      if (relativePaths.has(record.relativePath)) {
        errors.push(`Duplicate backup path: ${record.relativePath}.`);
      }
      relativePaths.add(record.relativePath);
      expectedChecksums[record.relativePath] = record.sha256;

      let path: string;
      try {
        path = resolveBackupRecordPath(backupDirectory, record.relativePath);
      } catch (error) {
        errors.push(
          error instanceof Error ? error.message : String(error),
        );
        continue;
      }
      try {
        const bytes = await readRegularFile(path);
        if (bytes.length !== record.byteLength) {
          errors.push(`Byte length mismatch for ${record.relativePath}.`);
        }
        if (sha256(bytes) !== record.sha256) {
          errors.push(`Checksum mismatch for ${record.relativePath}.`);
        }
      } catch (error) {
        errors.push(
          `Backup file ${record.relativePath} cannot be read: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  const expectedBackupFiles = new Set<string>([
    "manifest.json",
    "checksums.json",
    ...relativePaths,
  ]);
  errors.push(
    ...(await validateClosedBackupTree(backupDirectory, expectedBackupFiles)),
  );

  try {
    const checksums: unknown = JSON.parse(
      await readRegularUtf8(join(backupDirectory, "checksums.json")),
    );
    if (
      typeof checksums !== "object" ||
      checksums === null ||
      Array.isArray(checksums) ||
      canonicalJsonStringify(checksums) !==
        canonicalJsonStringify(expectedChecksums)
    ) {
      errors.push("checksums.json does not match the manifest file records.");
    }
  } catch (error) {
    errors.push(
      `checksums.json cannot be verified: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const backupJournal = new FileEventJournal({ rootDirectory: backupDirectory });
  const backupSnapshots = new FileSnapshotStore({
    rootDirectory: backupDirectory,
  });
  for (const stream of manifest.streams) {
    let inspection: Awaited<ReturnType<FileEventJournal["inspect"]>> | null = null;
    try {
      inspection = await backupJournal.inspect(stream.streamId);
    } catch (error) {
      errors.push(
        `Backup journal for "${stream.streamId}" cannot be inspected: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (inspection !== null && inspection.issue !== null) {
      errors.push(
        `Backup journal for "${stream.streamId}" is corrupted: ${inspection.issue.message}`,
      );
    }
    if (
      inspection === null ||
      inspection.events.length !== stream.eventCount ||
      inspection.validThroughSequence !== stream.latestSequence ||
      inspection.validThroughHash !== stream.latestEventHash
    ) {
      errors.push(
        `Backup journal metadata mismatch for stream "${stream.streamId}".`,
      );
    }
    if (
      stream.journal === null &&
      (stream.eventCount !== 0 ||
        stream.latestSequence !== 0 ||
        stream.latestEventHash !== GENESIS_EVENT_HASH)
    ) {
      errors.push(
        `Stream "${stream.streamId}" omits its journal but declares non-empty history.`,
      );
    }

    const snapshotInspections = await backupSnapshots.inspect(stream.streamId);
    if (snapshotInspections.some((item) => !item.valid)) {
      errors.push(
        `Backup snapshot verification failed for stream "${stream.streamId}".`,
      );
    }
    const actualSnapshots = await backupSnapshots.list(stream.streamId);
    if (actualSnapshots.length !== stream.snapshots.length) {
      errors.push(
        `Backup snapshot count mismatch for stream "${stream.streamId}".`,
      );
    }
    for (const expected of stream.snapshots) {
      const actual = actualSnapshots.find(
        (snapshot) => snapshot.snapshotId === expected.snapshotId,
      );
      const anchor =
        expected.sequence === 0
          ? GENESIS_EVENT_HASH
          : inspection?.events[expected.sequence - 1]?.eventHash;
      if (anchor === undefined || anchor !== expected.eventHash) {
        errors.push(
          `Backup snapshot ${expected.snapshotId} is not anchored to its journal sequence.`,
        );
      }
      if (
        actual === undefined ||
        actual.sequence !== expected.sequence ||
        actual.eventHash !== expected.eventHash ||
        actual.stateHash !== expected.stateHash ||
        actual.snapshotHash !== expected.snapshotHash
      ) {
        errors.push(
          `Backup snapshot metadata mismatch for ${expected.snapshotId}.`,
        );
      }
    }
  }

  if (manifest.streams.length === 0) {
    warnings.push("Backup contains no streams.");
  }
  return {
    valid: errors.length === 0,
    manifest,
    checkedFileCount,
    errors,
    warnings,
  };
}

export async function restorePersistenceBackup(
  options: RestorePersistenceBackupOptions,
): Promise<PersistenceRestoreResult> {
  requireNonEmptyValue("Backup directory", options.backupDirectory);
  requireNonEmptyValue("Restore target root directory", options.targetRootDirectory);
  if (!options.confirm) {
    throw new Error("Explicit confirm=true is required for restore.");
  }
  if (await pathsOverlap(options.backupDirectory, options.targetRootDirectory)) {
    throw new Error(
      "Restore target must not overlap the verified backup directory.",
    );
  }
  const faultInjector =
    options.faultInjector ?? new NoopPersistenceFaultInjector();
  await faultInjector.trigger({ point: "restore.before_verify" });
  const verification = await verifyPersistenceBackup(options.backupDirectory);
  if (!verification.valid || verification.manifest === null) {
    throw new Error(
      `Backup verification failed: ${verification.errors.join("; ")}`,
    );
  }
  const targetExists = await exists(options.targetRootDirectory);
  if (targetExists && !options.replaceExisting) {
    throw new Error("Restore target already exists; replacement was not enabled.");
  }
  const staging = `${options.targetRootDirectory}.restore-${randomUUID()}`;
  const previousDirectory = targetExists
    ? `${options.targetRootDirectory}.pre-restore-${randomUUID()}`
    : null;
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true, mode: 0o700 });

  try {
    for (const stream of verification.manifest.streams) {
      for (const record of recordsForStream(stream)) {
        const source = resolveBackupRecordPath(
          options.backupDirectory,
          record.relativePath,
        );
        await copyRecordedFile(source, staging, record);
      }
    }

    await syncDirectory(staging);
    await faultInjector.trigger({ point: "restore.after_copy" });
    const stagedJournal = new FileEventJournal({ rootDirectory: staging });
    const stagedSnapshots = new FileSnapshotStore({ rootDirectory: staging });
    for (const stream of verification.manifest.streams) {
      const inspection = await stagedJournal.inspect(stream.streamId);
      if (
        inspection.issue !== null ||
        inspection.validThroughSequence !== stream.latestSequence ||
        inspection.validThroughHash !== stream.latestEventHash
      ) {
        throw new Error(
          `Restored journal verification failed for stream "${stream.streamId}".`,
        );
      }
      const snapshotInspections = await stagedSnapshots.inspect(stream.streamId);
      if (snapshotInspections.some((item) => !item.valid)) {
        throw new Error(
          `Restored snapshots failed verification for stream "${stream.streamId}".`,
        );
      }
    }

    await faultInjector.trigger({ point: "restore.after_verify" });
    await faultInjector.trigger({ point: "restore.before_replace" });
    const targetParent = dirname(options.targetRootDirectory);
    await mkdir(targetParent, { recursive: true, mode: 0o700 });
    await syncDirectory(targetParent);
    if (targetExists && previousDirectory !== null) {
      await rename(options.targetRootDirectory, previousDirectory);
      await syncDirectory(targetParent);
    }
    let published = false;
    try {
      await rename(staging, options.targetRootDirectory);
      published = true;
      await syncDirectory(targetParent);
    } catch (error) {
      if (
        !published &&
        previousDirectory !== null &&
        (await exists(previousDirectory))
      ) {
        try {
          await rename(previousDirectory, options.targetRootDirectory);
          await syncDirectory(targetParent);
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            "Restore publication failed and the previous runtime could not be restored.",
          );
        }
      }
      throw error;
    }
    await faultInjector.trigger({ point: "restore.after_replace" });
    return {
      restored: true,
      targetRootDirectory: options.targetRootDirectory,
      previousDirectory,
      streamIds: verification.manifest.streams.map((stream) => stream.streamId),
      reason: "Backup checksums and restored journal chains are valid.",
    };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}
