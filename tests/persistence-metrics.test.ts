import { describe, expect, it } from "vitest";
import {
  evaluatePersistenceHealth,
  type DeterministicReplayVerification,
  type JournalInspection,
  type MemorySnapshot,
  type ReplayResult,
} from "../src/index.js";

const inspection: JournalInspection = {
  streamId: "project-a",
  events: [],
  validThroughSequence: 10,
  validThroughHash: "hash-10",
  validByteLength: 100,
  totalByteLength: 100,
  issue: null,
};

const replay: ReplayResult<{ value: number }> = {
  streamId: "project-a",
  state: { value: 10 },
  finalSequence: 10,
  finalEventHash: "hash-10",
  stateHash: "state-10",
  usedSnapshotId: "snapshot-8",
  snapshotSequence: 8,
  replayedEventCount: 2,
  elapsedMs: 1,
};

const verification: DeterministicReplayVerification<{ value: number }> = {
  deterministic: true,
  first: replay,
  second: replay,
  reason: "Deterministic.",
};

const snapshots: MemorySnapshot[] = [
  {
    snapshotId: "snapshot-8",
    streamId: "project-a",
    sequence: 8,
    eventHash: "hash-8",
    schemaVersion: 1,
    state: { value: 8 },
    stateHash: "state-8",
    snapshotHash: "snapshot-hash",
    createdAt: "2026-07-31T00:00:08.000Z",
  },
];

describe("persistence health metrics", () => {
  it("reports snapshot coverage and replay efficiency", () => {
    const metrics = evaluatePersistenceHealth({
      inspection: { ...inspection, events: Array.from({ length: 10 }, () => ({}) as never) },
      snapshots,
      replay,
      deterministicReplay: verification,
    });
    expect(metrics.snapshotCoverageRatio).toBe(0.8);
    expect(metrics.replayEfficiency).toBe(0.8);
  });

  it("propagates deterministic replay status", () => {
    const metrics = evaluatePersistenceHealth({
      inspection,
      snapshots,
      replay,
      deterministicReplay: verification,
    });
    expect(metrics.deterministicReplay).toBe(true);
  });

  it("marks recovery as required when journal inspection fails", () => {
    const metrics = evaluatePersistenceHealth({
      inspection: {
        ...inspection,
        issue: {
          kind: "parse_error",
          line: 2,
          byteOffset: 10,
          sequence: null,
          message: "partial",
          recoverableByTrailingTruncation: true,
        },
      },
      snapshots,
      replay,
      deterministicReplay: verification,
    });
    expect(metrics.integrityValid).toBe(false);
    expect(metrics.recoveryRequired).toBe(true);
  });
});
