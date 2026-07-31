import { GENESIS_EVENT_HASH } from "../persistence/checksums.js";
import type {
  JournalInspection,
  MemorySnapshot,
  PersistenceHealthReport,
  PersistenceLockInspection,
  ReplayResult,
  SnapshotInspection,
} from "../persistence/types.js";

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, numerator / denominator));
}

export function buildPersistenceHealthReport<TState>(input: {
  inspection: JournalInspection;
  snapshots: MemorySnapshot[];
  snapshotInspections: SnapshotInspection[];
  lock: PersistenceLockInspection;
  replay?: ReplayResult<TState>;
  deterministicReplay?: boolean;
  backupCreatedAt?: string;
  backupVerified?: boolean;
  now?: string;
}): PersistenceHealthReport {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];
  const issue = input.inspection.issue;
  const journalIntegrity =
    issue === null
      ? "healthy"
      : issue.recoverableByTrailingTruncation
        ? "recoverable"
        : "corrupted";
  if (issue !== null) {
    blockingReasons.push(issue.message);
  }

  const streamSnapshots = input.snapshots.filter(
    (snapshot) => snapshot.streamId === input.inspection.streamId,
  );
  const misplacedSnapshotCount =
    input.snapshots.length - streamSnapshots.length;
  const anchoredSnapshots = streamSnapshots.filter((snapshot) => {
    const expectedAnchor =
      snapshot.sequence === 0
        ? GENESIS_EVENT_HASH
        : input.inspection.events.find(
            (event) => event.sequence === snapshot.sequence,
          )?.eventHash;
    return expectedAnchor !== undefined && expectedAnchor === snapshot.eventHash;
  });
  const anchorMismatchCount =
    streamSnapshots.length - anchoredSnapshots.length;
  const invalidSnapshotCount =
    input.snapshotInspections.filter((snapshot) => !snapshot.valid).length +
    misplacedSnapshotCount +
    anchorMismatchCount;
  if (invalidSnapshotCount > 0) {
    warnings.push(`${invalidSnapshotCount} invalid snapshot artifact(s) detected.`);
  }
  if (anchoredSnapshots.length === 0 && input.inspection.events.length > 0) {
    warnings.push("No valid anchored snapshot exists; restart requires full replay.");
  }

  const staleLockCount =
    input.lock.status === "orphaned" ||
    input.lock.status === "expired_unknown_owner" ||
    input.lock.status === "invalid"
      ? 1
      : 0;
  if (staleLockCount > 0) {
    blockingReasons.push(input.lock.reason);
  } else if (input.lock.status === "active") {
    blockingReasons.push("A live writer currently owns the stream lock.");
  }

  const deterministicReplay = input.deterministicReplay ?? null;
  if (deterministicReplay === false) {
    blockingReasons.push("Independent replays produced different outputs.");
  } else if (deterministicReplay === null) {
    warnings.push("Deterministic replay verification was not supplied.");
  }

  const latestSnapshotSequence = Math.max(
    0,
    ...anchoredSnapshots.map((snapshot) => snapshot.sequence),
  );
  const snapshotCoverage = ratio(
    latestSnapshotSequence,
    input.inspection.validThroughSequence,
  );

  let backupAgeMs: number | undefined;
  if (input.backupVerified === false) {
    warnings.push("The supplied backup failed verification.");
  }
  if (input.backupCreatedAt !== undefined && input.backupVerified !== false) {
    const backupAt = Date.parse(input.backupCreatedAt);
    const nowAt = Date.parse(input.now ?? new Date().toISOString());
    if (Number.isFinite(backupAt) && Number.isFinite(nowAt)) {
      backupAgeMs = Math.max(0, nowAt - backupAt);
    } else {
      warnings.push("Backup timestamp is invalid and its age cannot be evaluated.");
    }
  } else if (input.backupVerified !== false) {
    warnings.push("No verified backup timestamp was supplied.");
  }

  const recoveryRequired =
    journalIntegrity === "recoverable" || staleLockCount > 0;
  const safeToWrite =
    journalIntegrity === "healthy" &&
    input.lock.status === "absent" &&
    deterministicReplay !== false;

  const status =
    journalIntegrity === "corrupted"
      ? "corrupted"
      : deterministicReplay === false
        ? "unsafe_to_write"
        : input.lock.status === "active"
          ? "unsafe_to_write"
          : recoveryRequired
            ? "recovery_required"
            : invalidSnapshotCount > 0 || warnings.length > 0
              ? "degraded_but_readable"
              : "healthy";

  return {
    streamId: input.inspection.streamId,
    status,
    journalIntegrity,
    deterministicReplay,
    snapshotCoverage,
    replayEventCount: input.replay?.replayedEventCount ?? null,
    staleLockCount,
    ...(backupAgeMs === undefined ? {} : { backupAgeMs }),
    recoveryRequired,
    safeToWrite,
    blockingReasons,
    warnings,
  };
}
