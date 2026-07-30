import { clonePlainData } from "../utils/clone-plain-data.js";
import type { VisionCheckpoint } from "./progressive-types.js";

export class VisionCheckpointStore {
  private readonly checkpoints = new Map<string, VisionCheckpoint>();
  private readonly byVision = new Map<string, string[]>();

  public save(checkpoint: VisionCheckpoint): void {
    this.checkpoints.set(checkpoint.id, clonePlainData(checkpoint));
    const current = this.byVision.get(checkpoint.visionId) ?? [];

    if (!current.includes(checkpoint.id)) {
      current.push(checkpoint.id);
      this.byVision.set(checkpoint.visionId, current);
    }
  }

  public get(checkpointId: string): VisionCheckpoint | null {
    const checkpoint = this.checkpoints.get(checkpointId);
    return checkpoint === undefined ? null : clonePlainData(checkpoint);
  }

  public getLatest(visionId: string): VisionCheckpoint | null {
    const ids = this.byVision.get(visionId) ?? [];
    const lastId = ids.at(-1);
    return lastId === undefined ? null : this.get(lastId);
  }

  public list(visionId: string): VisionCheckpoint[] {
    return (this.byVision.get(visionId) ?? [])
      .map((id) => this.checkpoints.get(id))
      .filter((item): item is VisionCheckpoint => item !== undefined)
      .map((item) => clonePlainData(item));
  }

  public deleteVision(visionId: string): number {
    const ids = this.byVision.get(visionId) ?? [];

    for (const id of ids) {
      this.checkpoints.delete(id);
    }

    this.byVision.delete(visionId);
    return ids.length;
  }

  public clear(): void {
    this.checkpoints.clear();
    this.byVision.clear();
  }
}
