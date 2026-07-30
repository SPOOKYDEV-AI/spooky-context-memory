import type { MemoryLink, MemoryNode } from "../domain/types.js";
import type { MemoryStore } from "./memory-store.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class InMemoryMemoryStore implements MemoryStore {
  private readonly nodes = new Map<string, MemoryNode>();
  private readonly links = new Map<string, MemoryLink>();

  public addNode(node: MemoryNode): void {
    if (this.nodes.has(node.id)) {
      throw new Error(`Memory node "${node.id}" already exists.`);
    }

    if (!node.path.startsWith("/")) {
      throw new Error(`Memory node "${node.id}" must use an absolute path.`);
    }

    if (node.parentId !== null && !this.nodes.has(node.parentId)) {
      throw new Error(
        `Parent node "${node.parentId}" must exist before adding "${node.id}".`,
      );
    }

    this.nodes.set(node.id, clone(node));
  }

  public upsertNode(node: MemoryNode): void {
    if (node.parentId !== null && !this.nodes.has(node.parentId)) {
      throw new Error(
        `Parent node "${node.parentId}" must exist before upserting "${node.id}".`,
      );
    }

    this.nodes.set(node.id, clone(node));
  }

  public addLink(link: MemoryLink): void {
    if (this.links.has(link.id)) {
      throw new Error(`Memory link "${link.id}" already exists.`);
    }

    if (!this.nodes.has(link.sourceNodeId)) {
      throw new Error(`Unknown source node "${link.sourceNodeId}".`);
    }

    if (!this.nodes.has(link.targetNodeId)) {
      throw new Error(`Unknown target node "${link.targetNodeId}".`);
    }

    this.links.set(link.id, clone(link));
  }

  public getNode(id: string): MemoryNode | undefined {
    const node = this.nodes.get(id);
    return node ? clone(node) : undefined;
  }

  public getAllNodes(): MemoryNode[] {
    return [...this.nodes.values()].map((node) => clone(node));
  }

  public getChildren(parentId: string): MemoryNode[] {
    return [...this.nodes.values()]
      .filter((node) => node.parentId === parentId)
      .map((node) => clone(node));
  }

  public getLinksFrom(nodeId: string): MemoryLink[] {
    return [...this.links.values()]
      .filter((link) => link.sourceNodeId === nodeId)
      .map((link) => clone(link));
  }

  public getLinksTo(nodeId: string): MemoryLink[] {
    return [...this.links.values()]
      .filter((link) => link.targetNodeId === nodeId)
      .map((link) => clone(link));
  }
}
