import type {
  DeterministicReplayVerification,
  JournalInspection,
  MemorySnapshot,
  PersistenceHealthMetrics,
  ReplayResult,
} from "../persistence/types.js";

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, numerator / denominator));
}

export function evaluatePersistenceHealth<TState>(input: {
  inspection: JournalInspection;
  snapshots: MemorySnapshot[];
  replay: ReplayResult<TState>;
  deterministicReplay: DeterministicReplayVerification<TState>;
}): PersistenceHealthMetrics {
  const latestSnapshotSequence = Math.max(
    0,
    ...input.snapshots.map((snapshot) => snapshot.sequence),
  );
  const totalEvents = input.inspection.events.length;
  return {
    streamId: input.inspection.streamId,
    integrityValid: input.inspection.issue === null,
    validThroughSequence: input.inspection.validThroughSequence,
    totalEvents,
    snapshotCount: input.snapshots.length,
    latestSnapshotSequence,
    replayedEventCount: input.replay.replayedEventCount,
    snapshotCoverageRatio: ratio(latestSnapshotSequence, totalEvents),
    replayEfficiency: 1 - ratio(input.replay.replayedEventCount, totalEvents),
    deterministicReplay: input.deterministicReplay.deterministic,
    recoveryRequired: input.inspection.issue !== null,
  };
}
