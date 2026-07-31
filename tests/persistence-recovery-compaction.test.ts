import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FileEventJournal,
  planLogicalCompaction,
  type MemorySnapshot,
} from "../src/index.js";

const roots: string[] = [];

async function journal(): Promise<FileEventJournal> {
  const root = await mkdtemp(join(tmpdir(), "spooky-recovery-"));
  roots.push(root);
  return new FileEventJournal({ rootDirectory: root });
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("persistence recovery and logical compaction", () => {
  it("detects and explicitly truncates a partial trailing record", async () => {
    const store = await journal();
    await store.append("project-a", [
      {
        type: "valid",
        payload: { value: 1 },
        schemaVersion: 1,
        occurredAt: "2026-07-31T00:00:01.000Z",
      },
    ]);
    await appendFile(store.journalPath("project-a"), '{"partial":', "utf8");
    expect((await store.inspect("project-a")).issue?.kind).toBe("parse_error");
    const recovery = await store.recoverTrailingCorruption("project-a");
    expect(recovery.recovered).toBe(true);
    expect((await store.inspect("project-a")).issue).toBeNull();
  });

  it("does not perform a silent recovery when the stream is healthy", async () => {
    const store = await journal();
    const recovery = await store.recoverTrailingCorruption("project-a");
    expect(recovery.recovered).toBe(false);
    expect(recovery.reason).toContain("No corruption");
  });

  it("plans a snapshot without allowing physical event deletion", async () => {
    const store = await journal();
    await store.append(
      "project-a",
      [1, 2, 3].map((value) => ({
        type: "value",
        payload: { value },
        schemaVersion: 1,
        occurredAt: `2026-07-31T00:00:0${value}.000Z`,
      })),
    );
    const plan = planLogicalCompaction({
      inspection: await store.inspect("project-a"),
      snapshots: [],
      policy: { snapshotAfterEvents: 2 },
    });
    expect(plan.action).toBe("create_snapshot");
    expect(plan.physicalDeletionAllowed).toBe(false);
  });

  it("recommends snapshot pruning when retention is exceeded", async () => {
    const store = await journal();
    const inspection = await store.inspect("project-a");
    const snapshots: MemorySnapshot[] = [1, 2, 3].map((sequence) => ({
      snapshotId: `snapshot-${sequence}`,
      streamId: "project-a",
      sequence,
      eventHash: `hash-${sequence}`,
      schemaVersion: 1,
      state: {},
      stateHash: "state",
      snapshotHash: "snapshot",
      createdAt: "2026-07-31T00:00:00.000Z",
    }));
    const plan = planLogicalCompaction({
      inspection,
      snapshots,
      policy: { retainSnapshots: 2 },
    });
    expect(plan.action).toBe("prune_snapshots");
  });
});
