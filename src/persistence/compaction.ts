import type {
  JournalInspection,
  LogicalCompactionPlan,
  LogicalCompactionPolicy,
  MemorySnapshot,
} from "./types.js";

export const DEFAULT_LOGICAL_COMPACTION_POLICY: LogicalCompactionPolicy = {
  snapshotAfterEvents: 50,
  retainSnapshots: 4,
  archiveRecommendationAfterEvents: 10_000,
};

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive safe integer.`);
  }
}

export function planLogicalCompaction(input: {
  inspection: JournalInspection;
  snapshots: MemorySnapshot[];
  policy?: Partial<LogicalCompactionPolicy>;
}): LogicalCompactionPlan {
  const policy = {
    ...DEFAULT_LOGICAL_COMPACTION_POLICY,
    ...input.policy,
  };
  assertPositiveSafeInteger(policy.snapshotAfterEvents, "snapshotAfterEvents");
  assertPositiveSafeInteger(policy.retainSnapshots, "retainSnapshots");
  assertPositiveSafeInteger(
    policy.archiveRecommendationAfterEvents,
    "archiveRecommendationAfterEvents",
  );
  const streamSnapshots = input.snapshots.filter(
    (snapshot) => snapshot.streamId === input.inspection.streamId,
  );
  const latestSequence = input.inspection.validThroughSequence;
  const latestSnapshotSequence = Math.max(
    0,
    ...streamSnapshots.map((snapshot) => snapshot.sequence),
  );
  const eventsAfterSnapshot = Math.max(
    0,
    latestSequence - latestSnapshotSequence,
  );
  const snapshotRequired = eventsAfterSnapshot >= policy.snapshotAfterEvents;
  const snapshotPruningRequired =
    streamSnapshots.length > policy.retainSnapshots;
  const archiveRecommended =
    latestSequence >= policy.archiveRecommendationAfterEvents;
  const reasons: string[] = [];
  if (input.inspection.issue !== null) {
    reasons.push("Journal recovery must complete before compaction planning.");
  }
  if (snapshotRequired) {
    reasons.push(
      `${eventsAfterSnapshot} events must be replayed after the latest snapshot.`,
    );
  }
  if (snapshotPruningRequired) {
    reasons.push(
      `${streamSnapshots.length} snapshots exceed the retention target ${policy.retainSnapshots}.`,
    );
  }
  if (archiveRecommended) {
    reasons.push(
      "The append-only journal is large enough to justify an external archival policy.",
    );
  }
  const action =
    input.inspection.issue !== null
      ? "none"
      : archiveRecommended
        ? "archive_recommended"
        : snapshotRequired && snapshotPruningRequired
          ? "create_snapshot_and_prune"
          : snapshotRequired
            ? "create_snapshot"
            : snapshotPruningRequired
              ? "prune_snapshots"
              : "none";
  return {
    streamId: input.inspection.streamId,
    action,
    latestSequence,
    latestSnapshotSequence,
    eventsAfterSnapshot,
    snapshotCount: streamSnapshots.length,
    retainSnapshots: policy.retainSnapshots,
    physicalDeletionAllowed: false,
    reasons:
      reasons.length > 0
        ? reasons
        : ["Replay cost and snapshot retention are within policy bands."],
  };
}
