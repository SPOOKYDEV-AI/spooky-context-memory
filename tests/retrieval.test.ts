import { describe, expect, it } from "vitest";
import {
  InMemoryMemoryStore,
  retrieveContext,
  type MemoryNode,
} from "../src/index.js";

function node(
  id: string,
  parentId: string | null,
  path: string,
  projectId: string,
): MemoryNode {
  return {
    id,
    parentId,
    path,
    type: parentId ? "topic" : "project",
    status: "active",
    title: id,
    summary: id,
    scope: { projectId },
    metadata: {
      confidence: 1,
      sourceTrust: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    },
    provenance: {
      sourceType: "test",
      createdBy: "test",
    },
  };
}

describe("retrieveContext", () => {
  it("keeps retrieval inside the allowed project branch", () => {
    const store = new InMemoryMemoryStore();

    store.addNode(node("atlas", null, "/projects/atlas", "atlas"));
    store.addNode(
      node("atlas-incident", "atlas", "/projects/atlas/incidents", "atlas"),
    );
    store.addNode(node("vinted", null, "/projects/vinted", "vinted"));
    store.addNode(
      node(
        "vinted-incident",
        "vinted",
        "/projects/vinted/incidents",
        "vinted",
      ),
    );

    const result = retrieveContext(store, {
      query: "Atlas incident",
      anchorNodeIds: ["atlas"],
      currentScope: { projectId: "atlas" },
      semanticScores: {
        atlas: 0.8,
        "atlas-incident": 0.9,
        vinted: 1,
        "vinted-incident": 1,
      },
      now: "2026-07-30T00:00:00.000Z",
      traversal: {
        maxNodes: 10,
        maxDepth: 3,
        minimumScore: 0.2,
        allowedPathPrefixes: ["/projects/atlas"],
        deniedPathPrefixes: [],
        allowedLinkTypes: [],
      },
    });

    expect(result.nodes.map((item) => item.node.id)).toContain("atlas-incident");
    expect(result.nodes.map((item) => item.node.id)).not.toContain("vinted");
  });
});
