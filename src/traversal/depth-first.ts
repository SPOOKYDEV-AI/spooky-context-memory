import type { MemoryNode, TraversalPolicy } from "../domain/types.js";
import type { MemoryStore } from "../storage/memory-store.js";
import { isPathAllowed } from "./path-policy.js";
import { getAllowedNeighbours } from "./neighbours.js";
import type { TraversedNode } from "./breadth-first.js";

export function depthFirstTraversal(
  store: MemoryStore,
  anchorNodeIds: string[],
  policy: TraversalPolicy,
): TraversedNode[] {
  const result: TraversedNode[] = [];
  const visited = new Set<string>();
  const stack: TraversedNode[] = anchorNodeIds
    .map((id) => store.getNode(id))
    .filter((node): node is MemoryNode => Boolean(node))
    .reverse()
    .map((node) => ({ node, depth: 0 }));

  while (stack.length > 0 && result.length < policy.maxNodes) {
    const current = stack.pop();
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

    const neighbours = getAllowedNeighbours(store, current.node, policy);
    for (const neighbour of neighbours.reverse()) {
      if (!visited.has(neighbour.node.id)) {
        stack.push({
          node: neighbour.node,
          depth: current.depth + 1,
        });
      }
    }
  }

  return result;
}
