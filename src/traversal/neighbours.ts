import type {
  MemoryLinkType,
  MemoryNode,
  TraversalPolicy,
} from "../domain/types.js";
import type { MemoryStore } from "../storage/memory-store.js";

export interface Neighbour {
  node: MemoryNode;
  reachedThrough: MemoryLinkType | "parent" | "child";
  edgeWeight: number;
}

export function getAllowedNeighbours(
  store: MemoryStore,
  node: MemoryNode,
  policy: TraversalPolicy,
): Neighbour[] {
  const neighbours: Neighbour[] = [];

  if (node.parentId) {
    const parent = store.getNode(node.parentId);
    if (parent) {
      neighbours.push({
        node: parent,
        reachedThrough: "parent",
        edgeWeight: 0.8,
      });
    }
  }

  for (const child of store.getChildren(node.id)) {
    neighbours.push({
      node: child,
      reachedThrough: "child",
      edgeWeight: 1,
    });
  }

  for (const link of store.getLinksFrom(node.id)) {
    if (!policy.allowedLinkTypes.includes(link.type)) {
      continue;
    }

    const target = store.getNode(link.targetNodeId);
    if (target) {
      neighbours.push({
        node: target,
        reachedThrough: link.type,
        edgeWeight: link.weight,
      });
    }
  }

  return neighbours;
}
