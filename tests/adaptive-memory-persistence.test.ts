import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FileEventJournal,
  FileSnapshotStore,
  PersistentAdaptiveMemory,
  createEmptyAdaptiveMemoryDurableState,
  type MemoryNode,
} from "../src/index.js";

const roots: string[] = [];
const now = "2026-07-31T00:00:00.000Z";

async function runtime(snapshotEveryEvents = 50): Promise<PersistentAdaptiveMemory> {
  const root = await mkdtemp(join(tmpdir(), "spooky-adaptive-persistence-"));
  roots.push(root);
  return new PersistentAdaptiveMemory({
    streamId: "project-atlas",
    journal: new FileEventJournal({ rootDirectory: root }),
    snapshots: new FileSnapshotStore({ rootDirectory: root }),
    policy: { snapshotEveryEvents, maximumSnapshots: 2 },
  });
}

function node(id: string, parentId: string | null = null): MemoryNode {
  return {
    id,
    parentId,
    path: parentId === null ? `/${id}` : `/root/${id}`,
    type: parentId === null ? "project" : "fact",
    status: "active",
    title: id,
    summary: "Synthetic persistence fixture.",
    scope: { projectId: "project-atlas" },
    metadata: {
      confidence: 1,
      sourceTrust: 1,
      createdAt: now,
      updatedAt: now,
    },
    provenance: { sourceType: "test", createdBy: "vitest" },
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("persistent adaptive memory", () => {
  it("imports a durable state as an explicit event", async () => {
    const memory = await runtime();
    const result = await memory.importState(
      createEmptyAdaptiveMemoryDurableState(now),
      now,
      0,
    );
    expect(result.events[0]?.type).toBe("adaptive.state_imported");
    expect(result.state.revision).toBe(1);
  });

  it("reduces node and link events deterministically", async () => {
    const memory = await runtime();
    await memory.append([
      {
        type: "memory.node_upserted",
        payload: { node: node("root") },
        schemaVersion: 1,
        occurredAt: now,
      },
      {
        type: "memory.node_upserted",
        payload: { node: node("fact", "root") },
        schemaVersion: 1,
        occurredAt: now,
      },
      {
        type: "memory.link_upserted",
        payload: {
          link: {
            id: "link-1",
            sourceNodeId: "root",
            targetNodeId: "fact",
            type: "depends_on",
            weight: 0.8,
          },
        },
        schemaVersion: 1,
        occurredAt: now,
      },
    ]);
    const hydrated = await memory.hydrate();
    expect(hydrated.state.nodes.map((item) => item.id)).toEqual(["fact", "root"]);
    expect(hydrated.state.links).toHaveLength(1);
  });

  it("removes dependent links when a node is removed", async () => {
    const memory = await runtime();
    await memory.append([
      {
        type: "memory.node_upserted",
        payload: { node: node("root") },
        schemaVersion: 1,
        occurredAt: now,
      },
      {
        type: "memory.node_upserted",
        payload: { node: node("fact", "root") },
        schemaVersion: 1,
        occurredAt: now,
      },
      {
        type: "memory.link_upserted",
        payload: {
          link: {
            id: "link-1",
            sourceNodeId: "root",
            targetNodeId: "fact",
            type: "depends_on",
            weight: 0.8,
          },
        },
        schemaVersion: 1,
        occurredAt: now,
      },
      {
        type: "memory.node_removed",
        payload: { nodeId: "fact" },
        schemaVersion: 1,
        occurredAt: now,
      },
    ]);
    const hydrated = await memory.hydrate();
    expect(hydrated.state.nodes.map((item) => item.id)).toEqual(["root"]);
    expect(hydrated.state.links).toHaveLength(0);
  });

  it("creates automatic snapshots at the configured event interval", async () => {
    const memory = await runtime(2);
    await memory.append([
      {
        type: "memory.node_upserted",
        payload: { node: node("root") },
        schemaVersion: 1,
        occurredAt: now,
      },
      {
        type: "memory.node_upserted",
        payload: { node: node("fact", "root") },
        schemaVersion: 1,
        occurredAt: now,
      },
    ]);
    const hydrated = await memory.hydrate();
    expect(hydrated.snapshotId).not.toBeNull();
    expect(hydrated.replayedEventCount).toBe(0);
  });
});
