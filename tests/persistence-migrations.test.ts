import { describe, expect, it } from "vitest";
import {
  PersistenceMigrationRegistry,
  type MemorySnapshot,
  type PersistedMemoryEvent,
} from "../src/index.js";

const event: PersistedMemoryEvent = {
  eventId: "event-1",
  streamId: "stream-a",
  sequence: 1,
  type: "synthetic",
  payload: { value: 1 },
  schemaVersion: 1,
  occurredAt: "2026-07-31T00:00:00.000Z",
  recordedAt: "2026-07-31T00:00:00.000Z",
  previousHash: "GENESIS",
  payloadHash: "payload",
  eventHash: "event",
};

const snapshot: MemorySnapshot = {
  snapshotId: "snapshot-1",
  streamId: "stream-a",
  sequence: 1,
  eventHash: "event",
  schemaVersion: 1,
  state: { value: 1 },
  stateHash: "state",
  snapshotHash: "snapshot",
  createdAt: "2026-07-31T00:00:00.000Z",
};

describe("persistence migration registry", () => {
  it("projects events through consecutive migrations", () => {
    const registry = new PersistenceMigrationRegistry();
    registry.registerEventMigration({
      fromVersion: 1,
      toVersion: 2,
      migrate: (payload) => ({ ...(payload as object), migratedTo2: true }),
    });
    registry.registerEventMigration({
      fromVersion: 2,
      toVersion: 3,
      migrate: (payload) => ({ ...(payload as object), migratedTo3: true }),
    });
    const projected = registry.projectEvent(event, 3);
    expect(projected.schemaVersion).toBe(3);
    expect(projected.payload).toEqual({
      value: 1,
      migratedTo2: true,
      migratedTo3: true,
    });
  });

  it("projects snapshots without mutating the stored envelope", () => {
    const registry = new PersistenceMigrationRegistry();
    registry.registerSnapshotMigration({
      fromVersion: 1,
      toVersion: 2,
      migrate: (state) => ({ ...(state as object), migrated: true }),
    });
    const projected = registry.projectSnapshot<{ value: number; migrated: boolean }>(
      snapshot,
      2,
    );
    expect(projected.state.migrated).toBe(true);
    expect(snapshot.schemaVersion).toBe(1);
  });

  it("rejects migration gaps", () => {
    const registry = new PersistenceMigrationRegistry();
    expect(() =>
      registry.registerEventMigration({
        fromVersion: 1,
        toVersion: 3,
        migrate: (payload) => payload,
      }),
    ).toThrow("advance exactly one schema version");
  });

  it("fails when a required migration is missing", () => {
    const registry = new PersistenceMigrationRegistry();
    expect(() => registry.projectEvent(event, 2)).toThrow(
      "Missing event migration",
    );
  });
});
