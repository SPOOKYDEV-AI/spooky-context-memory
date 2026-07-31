import { performance } from "node:perf_hooks";
import { clonePlainData } from "../utils/clone-plain-data.js";
import { normalizeCanonicalJson } from "./canonical-json.js";
import { hashPlainData, GENESIS_EVENT_HASH } from "./checksums.js";
import type {
  DeterministicReplayVerification,
  MemorySnapshot,
  PersistedMemoryEvent,
  ProjectedMemoryEvent,
  ProjectedSnapshot,
  ReplayOptions,
  ReplayResult,
} from "./types.js";

function canonicalStateClone<TState>(state: unknown): TState {
  return normalizeCanonicalJson(state) as unknown as TState;
}

function defaultEventProjection(
  event: PersistedMemoryEvent,
  targetVersion: number,
): ProjectedMemoryEvent {
  if (event.schemaVersion !== targetVersion) {
    throw new Error(
      `Event ${event.eventId} uses schema ${event.schemaVersion}; target is ${targetVersion} and no migration registry was provided.`,
    );
  }
  return {
    source: clonePlainData(event),
    schemaVersion: targetVersion,
    payload: clonePlainData(event.payload),
  };
}

function defaultSnapshotProjection<TState>(
  snapshot: MemorySnapshot,
  targetVersion: number,
): ProjectedSnapshot<TState> {
  if (snapshot.schemaVersion !== targetVersion) {
    throw new Error(
      `Snapshot ${snapshot.snapshotId} uses schema ${snapshot.schemaVersion}; target is ${targetVersion} and no migration registry was provided.`,
    );
  }
  return {
    source: clonePlainData(snapshot),
    schemaVersion: targetVersion,
    state: clonePlainData(snapshot.state) as TState,
  };
}

export async function replayMemoryStream<TState>(
  options: ReplayOptions<TState>,
): Promise<ReplayResult<TState>> {
  const startedAt = performance.now();
  const events = await options.journal.read(options.streamId);
  const latestSequence = events.at(-1)?.sequence ?? 0;
  const latestHash = events.at(-1)?.eventHash ?? GENESIS_EVENT_HASH;
  let state = canonicalStateClone<TState>(options.initialState);
  let snapshotSequence = 0;
  let usedSnapshotId: string | null = null;

  if (options.snapshots !== undefined) {
    const snapshot = await options.snapshots.loadLatest<TState>(options.streamId);
    if (snapshot !== null) {
      if (snapshot.sequence > latestSequence) {
        throw new Error(
          `Snapshot ${snapshot.snapshotId} is ahead of journal sequence ${latestSequence}.`,
        );
      }
      const anchor =
        snapshot.sequence === 0
          ? GENESIS_EVENT_HASH
          : events.find((event) => event.sequence === snapshot.sequence)?.eventHash;
      if (anchor === undefined || anchor !== snapshot.eventHash) {
        throw new Error(
          `Snapshot ${snapshot.snapshotId} does not match the journal hash chain.`,
        );
      }
      const projected = (options.migrateSnapshot ?? defaultSnapshotProjection<TState>)(
        snapshot,
        options.targetSchemaVersion,
      );
      state = canonicalStateClone<TState>(projected.state);
      snapshotSequence = snapshot.sequence;
      usedSnapshotId = snapshot.snapshotId;
    }
  }

  const relevantEvents = events.filter(
    (event) => event.sequence > snapshotSequence,
  );
  for (const event of relevantEvents) {
    const projected = (options.migrateEvent ?? defaultEventProjection)(
      event,
      options.targetSchemaVersion,
    );
    state = canonicalStateClone<TState>(
      options.reducer(canonicalStateClone<TState>(state), projected),
    );
  }
  options.validateState?.(state);
  return {
    streamId: options.streamId,
    state: canonicalStateClone<TState>(state),
    finalSequence: latestSequence,
    finalEventHash: latestHash,
    stateHash: hashPlainData(state),
    usedSnapshotId,
    snapshotSequence,
    replayedEventCount: relevantEvents.length,
    elapsedMs: Math.max(0, performance.now() - startedAt),
  };
}

export async function verifyDeterministicReplay<TState>(
  options: ReplayOptions<TState>,
): Promise<DeterministicReplayVerification<TState>> {
  const first = await replayMemoryStream(options);
  const second = await replayMemoryStream(options);
  const sameHistory =
    first.finalSequence === second.finalSequence &&
    first.finalEventHash === second.finalEventHash;
  const sameState = first.stateHash === second.stateHash;
  const deterministic = sameHistory && sameState;
  return {
    deterministic,
    first,
    second,
    reason: deterministic
      ? "Two independent replays produced the same sequence, event hash, and state hash."
      : !sameHistory
        ? "The journal changed between replay passes; retry verification while the stream is quiescent."
        : "The same journal history produced different state hashes; the reducer or migrations are not deterministic.",
  };
}
