import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FileEventJournal,
  FileSnapshotStore,
  replayMemoryStream,
  verifyDeterministicReplay,
  type ProjectedMemoryEvent,
} from "../src/index.js";

const roots: string[] = [];

async function stores(): Promise<{
  journal: FileEventJournal;
  snapshots: FileSnapshotStore;
}> {
  const root = await mkdtemp(join(tmpdir(), "spooky-replay-"));
  roots.push(root);
  return {
    journal: new FileEventJournal({ rootDirectory: root }),
    snapshots: new FileSnapshotStore({ rootDirectory: root }),
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function reducer(
  state: { total: number },
  event: ProjectedMemoryEvent,
): { total: number } {
  return {
    total: state.total + (event.payload as { amount: number }).amount,
  };
}

describe("deterministic replay", () => {
  it("reconstructs state from the full event stream", async () => {
    const { journal } = await stores();
    await journal.append(
      "counter",
      [1, 2, 3].map((amount) => ({
        type: "counter.added",
        payload: { amount },
        schemaVersion: 1,
        occurredAt: `2026-07-31T00:00:0${amount}.000Z`,
      })),
    );
    const replay = await replayMemoryStream({
      streamId: "counter",
      journal,
      targetSchemaVersion: 1,
      initialState: { total: 0 },
      reducer,
    });
    expect(replay.state.total).toBe(6);
    expect(replay.replayedEventCount).toBe(3);
  });

  it("starts after a verified snapshot", async () => {
    const { journal, snapshots } = await stores();
    const events = await journal.append(
      "counter",
      [1, 2, 3].map((amount) => ({
        type: "counter.added",
        payload: { amount },
        schemaVersion: 1,
        occurredAt: `2026-07-31T00:00:0${amount}.000Z`,
      })),
    );
    await snapshots.save({
      streamId: "counter",
      sequence: 2,
      eventHash: events[1]!.eventHash,
      schemaVersion: 1,
      state: { total: 3 },
    });
    const replay = await replayMemoryStream({
      streamId: "counter",
      journal,
      snapshots,
      targetSchemaVersion: 1,
      initialState: { total: 0 },
      reducer,
    });
    expect(replay.state.total).toBe(6);
    expect(replay.snapshotSequence).toBe(2);
    expect(replay.replayedEventCount).toBe(1);
  });

  it("rejects a snapshot with the wrong journal anchor", async () => {
    const { journal, snapshots } = await stores();
    await journal.append("counter", [
      {
        type: "counter.added",
        payload: { amount: 1 },
        schemaVersion: 1,
        occurredAt: "2026-07-31T00:00:01.000Z",
      },
    ]);
    await snapshots.save({
      streamId: "counter",
      sequence: 1,
      eventHash: "wrong-hash",
      schemaVersion: 1,
      state: { total: 1 },
    });
    await expect(
      replayMemoryStream({
        streamId: "counter",
        journal,
        snapshots,
        targetSchemaVersion: 1,
        initialState: { total: 0 },
        reducer,
      }),
    ).rejects.toThrow("does not match the journal hash chain");
  });

  it("verifies two independent replay results", async () => {
    const { journal } = await stores();
    await journal.append("counter", [
      {
        type: "counter.added",
        payload: { amount: 1 },
        schemaVersion: 1,
        occurredAt: "2026-07-31T00:00:01.000Z",
      },
    ]);
    const verification = await verifyDeterministicReplay({
      streamId: "counter",
      journal,
      targetSchemaVersion: 1,
      initialState: { total: 0 },
      reducer,
    });
    expect(verification.deterministic).toBe(true);
    expect(verification.first.stateHash).toBe(verification.second.stateHash);
  });
});
