import { describe, expect, it } from "vitest";
import {
  buildPersistenceHealthReport,
  type JournalInspection,
  type MemorySnapshot,
  type PersistenceLockInspection,
} from "../src/index.js";

const healthyInspection: JournalInspection = {
  streamId: "atlas",
  events: [],
  validThroughSequence: 0,
  validThroughHash: "GENESIS",
  validByteLength: 0,
  totalByteLength: 0,
  issue: null,
};

const absentLock: PersistenceLockInspection = {
  streamId: "atlas",
  path: "/synthetic/atlas.lock",
  status: "absent",
  metadata: null,
  ageMs: null,
  ownerAlive: null,
  reason: "No stream lock exists.",
};

describe("persistence operational health report", () => {
  it("reports a healthy writable stream when all signals are clean", () => {
    const report = buildPersistenceHealthReport({
      inspection: healthyInspection,
      snapshots: [],
      snapshotInspections: [],
      lock: absentLock,
      deterministicReplay: true,
      backupCreatedAt: "2026-07-31T00:00:00.000Z",
      now: "2026-07-31T01:00:00.000Z",
    });
    expect(report.status).toBe("healthy");
    expect(report.safeToWrite).toBe(true);
    expect(report.backupAgeMs).toBe(3_600_000);
  });

  it("blocks writes when deterministic replay diverges", () => {
    const report = buildPersistenceHealthReport({
      inspection: healthyInspection,
      snapshots: [],
      snapshotInspections: [],
      lock: absentLock,
      deterministicReplay: false,
    });
    expect(report.status).toBe("unsafe_to_write");
    expect(report.safeToWrite).toBe(false);
    expect(report.blockingReasons.join(" ")).toContain("different outputs");
  });

  it("distinguishes recoverable trailing corruption from middle corruption", () => {
    const recoverable = buildPersistenceHealthReport({
      inspection: {
        ...healthyInspection,
        totalByteLength: 10,
        issue: {
          kind: "parse_error",
          line: 1,
          byteOffset: 0,
          sequence: null,
          message: "partial tail",
          recoverableByTrailingTruncation: true,
        },
      },
      snapshots: [],
      snapshotInspections: [],
      lock: absentLock,
    });
    expect(recoverable.status).toBe("recovery_required");
    expect(recoverable.journalIntegrity).toBe("recoverable");

    const corrupted = buildPersistenceHealthReport({
      inspection: {
        ...healthyInspection,
        totalByteLength: 20,
        issue: {
          kind: "payload_hash_mismatch",
          line: 1,
          byteOffset: 0,
          sequence: 1,
          message: "middle tamper",
          recoverableByTrailingTruncation: false,
        },
      },
      snapshots: [],
      snapshotInspections: [],
      lock: absentLock,
    });
    expect(corrupted.status).toBe("corrupted");
    expect(corrupted.recoveryRequired).toBe(false);
  });
  it("degrades health for unanchored snapshots and unverified backups", () => {
    const eventInspection: JournalInspection = {
      ...healthyInspection,
      events: [
        {
          eventId: "evt_00000000000000000000000000000000",
          streamId: "atlas",
          sequence: 1,
          type: "synthetic",
          payload: { value: 1 },
          schemaVersion: 1,
          occurredAt: "2026-07-31T00:00:00.000Z",
          recordedAt: "2026-07-31T00:00:00.000Z",
          previousHash: "GENESIS",
          payloadHash: "a".repeat(64),
          eventHash: "b".repeat(64),
        },
      ],
      validThroughSequence: 1,
      validThroughHash: "b".repeat(64),
    };
    const snapshot: MemorySnapshot = {
      snapshotId: "snap_00000000000000000000000000000000",
      streamId: "atlas",
      sequence: 1,
      eventHash: "c".repeat(64),
      schemaVersion: 1,
      state: { value: 1 },
      stateHash: "d".repeat(64),
      snapshotHash: "e".repeat(64),
      createdAt: "2026-07-31T00:00:00.000Z",
    };
    const report = buildPersistenceHealthReport({
      inspection: eventInspection,
      snapshots: [snapshot],
      snapshotInspections: [
        { snapshotId: snapshot.snapshotId, valid: true, reason: "checksum valid" },
      ],
      lock: absentLock,
      deterministicReplay: true,
      backupVerified: false,
    });
    expect(report.status).toBe("degraded_but_readable");
    expect(report.snapshotCoverage).toBe(0);
    expect(report.warnings.join(" ")).toContain("invalid snapshot");
    expect(report.warnings.join(" ")).toContain("failed verification");
  });

});
