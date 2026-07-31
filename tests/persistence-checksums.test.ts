import { describe, expect, it } from "vitest";
import {
  computeEventHash,
  computeSnapshotHash,
  createEventIdentity,
  hashPlainData,
  verifyPersistedEventHash,
  verifySnapshotHash,
  type PersistedMemoryEvent,
  type UncommittedMemoryEvent,
} from "../src/index.js";

const occurredAt = "2026-07-31T00:00:00.000Z";

function makeEvent(): PersistedMemoryEvent {
  const event: UncommittedMemoryEvent = {
    type: "synthetic.recorded",
    payload: { beta: 2, alpha: 1 },
    schemaVersion: 1,
    occurredAt,
  };
  const payloadHash = hashPlainData(event.payload);
  const eventId = createEventIdentity({
    streamId: "stream-a",
    sequence: 1,
    event,
    payloadHash,
  });
  const withoutHash = {
    ...event,
    eventId,
    streamId: "stream-a",
    sequence: 1,
    recordedAt: occurredAt,
    previousHash: "GENESIS",
    payloadHash,
  };
  return { ...withoutHash, eventHash: computeEventHash(withoutHash) };
}

describe("persistence checksums", () => {
  it("hashes plain objects independently of key order", () => {
    expect(hashPlainData({ alpha: 1, beta: 2 })).toBe(
      hashPlainData({ beta: 2, alpha: 1 }),
    );
  });

  it("creates a deterministic event identity", () => {
    const first = makeEvent();
    const second = makeEvent();
    expect(first.eventId).toBe(second.eventId);
    expect(first.eventHash).toBe(second.eventHash);
  });

  it("detects payload mutation", () => {
    const event = makeEvent();
    const mutated = { ...event, payload: { alpha: 99 } };
    expect(verifyPersistedEventHash(mutated)).toBe(false);
  });

  it("verifies snapshot state and envelope hashes", () => {
    const withoutHash = {
      snapshotId: "snapshot-a",
      streamId: "stream-a",
      sequence: 1,
      eventHash: makeEvent().eventHash,
      schemaVersion: 1,
      state: { value: 1 },
      stateHash: hashPlainData({ value: 1 }),
      createdAt: occurredAt,
    };
    const snapshot = {
      ...withoutHash,
      snapshotHash: computeSnapshotHash(withoutHash),
    };
    expect(verifySnapshotHash(snapshot)).toBe(true);
    expect(verifySnapshotHash({ ...snapshot, state: { value: 2 } })).toBe(false);
  });
});
