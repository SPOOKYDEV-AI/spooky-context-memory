import { clonePlainData } from "../utils/clone-plain-data.js";
import type { MemoryVision } from "./types.js";

export class VisionCache {
  private readonly visions = new Map<string, MemoryVision>();

  public get(taskSignatureHash: string, memoryRevision: number): MemoryVision | null {
    const key = this.buildKey(taskSignatureHash, memoryRevision);
    const vision = this.visions.get(key);
    return vision ? clonePlainData(vision) : null;
  }

  public set(vision: MemoryVision): void {
    this.visions.set(
      this.buildKey(vision.taskSignatureHash, vision.memoryRevision),
      clonePlainData(vision),
    );
  }

  public invalidateByMemoryRevision(memoryRevision: number): number {
    let removed = 0;

    for (const [key, vision] of this.visions) {
      if (vision.memoryRevision < memoryRevision) {
        this.visions.delete(key);
        removed += 1;
      }
    }

    return removed;
  }

  public invalidateByBranchIds(branchIds: readonly string[]): number {
    const impacted = new Set(branchIds);
    let removed = 0;

    for (const [key, vision] of this.visions) {
      const touchesBranch =
        vision.allowedBranchIds.some((id) => impacted.has(id)) ||
        vision.excludedBranches.some((item) => impacted.has(item.branchId));

      if (touchesBranch) {
        this.visions.delete(key);
        removed += 1;
      }
    }

    return removed;
  }

  public clear(): void {
    this.visions.clear();
  }

  private buildKey(taskSignatureHash: string, memoryRevision: number): string {
    return `${taskSignatureHash}:${memoryRevision}`;
  }
}
