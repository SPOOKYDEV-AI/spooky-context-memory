import type { MemoryLink, MemoryNode } from "../domain/types.js";

export interface MemoryStore {
  getNode(id: string): MemoryNode | undefined;
  getAllNodes(): MemoryNode[];
  getChildren(parentId: string): MemoryNode[];
  getLinksFrom(nodeId: string): MemoryLink[];
  getLinksTo(nodeId: string): MemoryLink[];
}
