import type { MemoryNode, TraversalPolicy } from "../domain/types.js";
import type { MemoryStore } from "../storage/memory-store.js";
import { isPathAllowed } from "./path-policy.js";
import { getAllowedNeighbours } from "./neighbours.js";

export interface TraversedNode {
  node: MemoryNode;
  depth: number;
}

export function breadthFirstTraversal(
  store: MemoryStore,
  anchorNodeIds: string[],
  policy: TraversalPolicy,
): TraversedNode[] {
  const result: TraversedNode[] = [];
  const visited = new Set<string>();
  const queue: TraversedNode[] = anchorNodeIds
    .map((id) => store.getNode(id))
    .filter((node): node is MemoryNode => Boolean(node))
    .map((node) => ({ node, depth: 0 }));

  while (queue.length > 0 && result.length < policy.maxNodes) {
    const current = queue.shift();
    if (!current || visited.has(current.node.id)) {
      continue;
    }

    visited.add(current.node.id);

    if (
      current.depth > policy.maxDepth ||
      !isPathAllowed(current.node.path, policy)
    ) {
      continue;
    }

    result.push(current);

    for (const neighbour of getAllowedNeighbours(store, current.node, policy)) {
      if (!visited.has(neighbour.node.id)) {
        queue.push({
          node: neighbour.node,
          depth: current.depth + 1,
        });
      }
    }
  }

  return result;
}
