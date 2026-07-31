import { createHash } from "node:crypto";
import { stableStringify } from "../utils/stable-hash.js";
import type {
  MemorySnapshot,
  PersistedMemoryEvent,
  UncommittedMemoryEvent,
} from "./types.js";

export const GENESIS_EVENT_HASH = "GENESIS";

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashPlainData(value: unknown): string {
  return sha256(stableStringify(value));
}

export function createEventIdentity(input: {
  streamId: string;
  sequence: number;
  event: UncommittedMemoryEvent;
  payloadHash: string;
}): string {
  return `evt_${sha256(
    stableStringify({
      streamId: input.streamId,
      sequence: input.sequence,
      type: input.event.type,
      payloadHash: input.payloadHash,
      schemaVersion: input.event.schemaVersion,
      occurredAt: input.event.occurredAt,
      causationId: input.event.causationId ?? null,
      correlationId: input.event.correlationId ?? null,
      contextFingerprint: input.event.contextFingerprint ?? null,
    }),
  ).slice(0, 32)}`;
}

export function computeEventHash(
  event: Omit<PersistedMemoryEvent, "eventHash">,
): string {
  return hashPlainData(event);
}

export function verifyPersistedEventHash(event: PersistedMemoryEvent): boolean {
  const { eventHash, ...withoutEventHash } = event;
  return computeEventHash(withoutEventHash) === eventHash;
}

export function computeSnapshotHash<TState>(
  snapshot: Omit<MemorySnapshot<TState>, "snapshotHash">,
): string {
  return hashPlainData(snapshot);
}

export function verifySnapshotHash<TState>(
  snapshot: MemorySnapshot<TState>,
): boolean {
  const { snapshotHash, ...withoutSnapshotHash } = snapshot;
  return (
    hashPlainData(snapshot.state) === snapshot.stateHash &&
    computeSnapshotHash(withoutSnapshotHash) === snapshotHash
  );
}
