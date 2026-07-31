import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileEventJournal } from "../src/index.js";

const roots: string[] = [];

async function journal(): Promise<FileEventJournal> {
  const root = await mkdtemp(join(tmpdir(), "spooky-journal-"));
  roots.push(root);
  return new FileEventJournal({ rootDirectory: root });
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("file event journal", () => {
  it("appends a contiguous hash chain", async () => {
    const store = await journal();
    const events = await store.append(
      "project-a",
      [
        {
          type: "first",
          payload: { value: 1 },
          schemaVersion: 1,
          occurredAt: "2026-07-31T00:00:01.000Z",
        },
        {
          type: "second",
          payload: { value: 2 },
          schemaVersion: 1,
          occurredAt: "2026-07-31T00:00:02.000Z",
        },
      ],
      { expectedSequence: 0, recordedAt: "2026-07-31T00:00:03.000Z" },
    );
    expect(events.map((event) => event.sequence)).toEqual([1, 2]);
    expect(events[1]?.previousHash).toBe(events[0]?.eventHash);
    expect((await store.inspect("project-a")).issue).toBeNull();
  });

  it("rejects stale optimistic writes", async () => {
    const store = await journal();
    await store.append("project-a", [
      {
        type: "first",
        payload: {},
        schemaVersion: 1,
        occurredAt: "2026-07-31T00:00:01.000Z",
      },
    ]);
    await expect(
      store.append(
        "project-a",
        [
          {
            type: "stale",
            payload: {},
            schemaVersion: 1,
            occurredAt: "2026-07-31T00:00:02.000Z",
          },
        ],
        { expectedSequence: 0 },
      ),
    ).rejects.toThrow("Optimistic concurrency conflict");
  });

  it("supports sequence-bounded reads", async () => {
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
    const events = await store.read("project-a", {
      fromSequence: 2,
      toSequence: 2,
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.sequence).toBe(2);
  });

  it("returns defensive event copies", async () => {
    const store = await journal();
    await store.append("project-a", [
      {
        type: "value",
        payload: { nested: { value: 1 } },
        schemaVersion: 1,
        occurredAt: "2026-07-31T00:00:01.000Z",
      },
    ]);
    const first = await store.read("project-a");
    (first[0]?.payload as { nested: { value: number } }).nested.value = 99;
    const second = await store.read("project-a");
    expect((second[0]?.payload as { nested: { value: number } }).nested.value).toBe(1);
  });

  it("isolates independent streams", async () => {
    const store = await journal();
    await store.append("project-a", [
      {
        type: "value",
        payload: { project: "a" },
        schemaVersion: 1,
        occurredAt: "2026-07-31T00:00:01.000Z",
      },
    ]);
    await store.append("project-b", [
      {
        type: "value",
        payload: { project: "b" },
        schemaVersion: 1,
        occurredAt: "2026-07-31T00:00:01.000Z",
      },
    ]);
    expect(await store.read("project-a")).toHaveLength(1);
    expect(await store.read("project-b")).toHaveLength(1);
  });
});
