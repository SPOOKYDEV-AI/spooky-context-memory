import type {
  MemoryNode,
  RetrievalRequest,
  RetrievalResult,
  RetrievedMemory,
} from "../domain/types.js";
import type { MemoryStore } from "../storage/memory-store.js";
import { getAllowedNeighbours } from "../traversal/neighbours.js";
import { isPathAllowed } from "../traversal/path-policy.js";
import { scoreNode } from "./scorer.js";

interface FrontierItem {
  node: MemoryNode;
  depth: number;
  edgeWeight: number;
  reachedThrough: NonNullable<RetrievedMemory["reachedThrough"]>;
}

export function retrieveContext(
  store: MemoryStore,
  request: RetrievalRequest,
): RetrievalResult {
  const anchors = request.anchorNodeIds
    .map((id) => store.getNode(id))
    .filter((node): node is MemoryNode => Boolean(node));

  const anchorPaths = anchors.map((node) => node.path);
  const now = new Date(request.now ?? new Date().toISOString());
  const frontier: FrontierItem[] = anchors.map((node) => ({
    node,
    depth: 0,
    edgeWeight: 1,
    reachedThrough: "anchor",
  }));

  const selected: RetrievedMemory[] = [];
  const rejectedNodeIds: string[] = [];
  const visited = new Set<string>();

  while (
    frontier.length > 0 &&
    selected.length < request.traversal.maxNodes
  ) {
    const scoredFrontier = frontier.map((item) => ({
      item,
      score: scoreNode({
        node: item.node,
        currentScope: request.currentScope,
        anchorPaths,
        semanticRelevance: request.semanticScores?.[item.node.id] ?? 0.5,
        edgeWeight: item.edgeWeight,
        now,
      }),
    }));

    scoredFrontier.sort((a, b) => b.score.total - a.score.total);
    const next = scoredFrontier.shift();

    if (!next) {
      break;
    }

    const frontierIndex = frontier.findIndex(
      (item) => item.node.id === next.item.node.id,
    );
    if (frontierIndex >= 0) {
      frontier.splice(frontierIndex, 1);
    }

    if (visited.has(next.item.node.id)) {
      continue;
    }

    visited.add(next.item.node.id);

    if (
      next.item.depth > request.traversal.maxDepth ||
      !isPathAllowed(next.item.node.path, request.traversal) ||
      next.score.total < request.traversal.minimumScore
    ) {
      rejectedNodeIds.push(next.item.node.id);
      continue;
    }

    selected.push({
      node: next.item.node,
      depth: next.item.depth,
      score: next.score,
      reachedThrough: next.item.reachedThrough,
    });

    for (const neighbour of getAllowedNeighbours(
      store,
      next.item.node,
      request.traversal,
    )) {
      if (visited.has(neighbour.node.id)) {
        continue;
      }

      frontier.push({
        node: neighbour.node,
        depth: next.item.depth + 1,
        edgeWeight: neighbour.edgeWeight,
        reachedThrough: neighbour.reachedThrough,
      });
    }
  }

  return {
    nodes: selected,
    rejectedNodeIds,
  };
}
