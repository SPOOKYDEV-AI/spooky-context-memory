import { clonePlainData } from "../utils/clone-plain-data.js";
import type { VisionFrontier } from "../visions/types.js";

export class FrontierCache {
  private readonly frontiers = new Map<string, VisionFrontier[]>();

  public get(visionId: string): VisionFrontier[] {
    return clonePlainData(this.frontiers.get(visionId) ?? []);
  }

  public set(visionId: string, frontiers: readonly VisionFrontier[]): void {
    this.frontiers.set(visionId, clonePlainData([...frontiers]));
  }

  public updateState(
    visionId: string,
    branchId: string,
    state: VisionFrontier["state"],
  ): void {
    const current = this.frontiers.get(visionId) ?? [];
    const next = current.map((frontier) =>
      frontier.branchId === branchId ? { ...frontier, state } : frontier,
    );
    this.frontiers.set(visionId, next);
  }

  public delete(visionId: string): void {
    this.frontiers.delete(visionId);
  }
}
