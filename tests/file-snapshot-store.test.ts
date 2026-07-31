import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileSnapshotStore } from "../src/index.js";

const roots: string[] = [];

async function snapshots(): Promise<FileSnapshotStore> {
  const root = await mkdtemp(join(tmpdir(), "spooky-snapshot-"));
  roots.push(root);
  return new FileSnapshotStore({ rootDirectory: root });
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("file snapshot store", () => {
  it("writes and loads a verified snapshot", async () => {
    const store = await snapshots();
    const saved = await store.save({
      streamId: "project-a",
      sequence: 4,
      eventHash: "hash-4",
      schemaVersion: 1,
      state: { value: 4 },
      createdAt: "2026-07-31T00:00:04.000Z",
    });
    const loaded = await store.loadLatest<{ value: number }>("project-a");
    expect(loaded?.snapshotId).toBe(saved.snapshotId);
    expect(loaded?.state.value).toBe(4);
  });

  it("loads the highest valid sequence", async () => {
    const store = await snapshots();
    await store.save({
      streamId: "project-a",
      sequence: 2,
      eventHash: "hash-2",
      schemaVersion: 1,
      state: { value: 2 },
    });
    await store.save({
      streamId: "project-a",
      sequence: 5,
      eventHash: "hash-5",
      schemaVersion: 1,
      state: { value: 5 },
    });
    expect((await store.loadLatest<{ value: number }>("project-a"))?.sequence).toBe(5);
  });

  it("skips a corrupted newest snapshot", async () => {
    const store = await snapshots();
    const older = await store.save({
      streamId: "project-a",
      sequence: 2,
      eventHash: "hash-2",
      schemaVersion: 1,
      state: { value: 2 },
    });
    await store.save({
      streamId: "project-a",
      sequence: 5,
      eventHash: "hash-5",
      schemaVersion: 1,
      state: { value: 5 },
    });
    const path = store.snapshotPath("project-a", 5);
    const raw = JSON.parse(await readFile(path, "utf8")) as { state: { value: number } };
    raw.state.value = 99;
    await writeFile(path, JSON.stringify(raw), "utf8");
    expect((await store.loadLatest("project-a"))?.snapshotId).toBe(older.snapshotId);
    expect((await store.inspect("project-a")).some((item) => !item.valid)).toBe(true);
  });

  it("prunes only snapshots beyond the retention count", async () => {
    const store = await snapshots();
    for (const sequence of [1, 2, 3]) {
      await store.save({
        streamId: "project-a",
        sequence,
        eventHash: `hash-${sequence}`,
        schemaVersion: 1,
        state: { sequence },
      });
    }
    const deleted = await store.prune("project-a", 2);
    expect(deleted).toHaveLength(1);
    expect(await store.list("project-a")).toHaveLength(2);
  });
});
