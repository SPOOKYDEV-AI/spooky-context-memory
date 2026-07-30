import type {
  ProgressiveVision,
  ProgressiveVisionEnsemblePolicy,
} from "./progressive-types.js";
import { visionDominates } from "./progressive-vision.js";

export interface VisionBeamSelection {
  visions: ProgressiveVision[];
  dominantVisionId: string | null;
  activeVisionIds: string[];
  deferredVisionIds: string[];
  supersededVisionIds: string[];
}

function rank(left: ProgressiveVision, right: ProgressiveVision): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  if (left.costPenalty !== right.costPenalty) {
    return left.costPenalty - right.costPenalty;
  }

  return left.id.localeCompare(right.id);
}

export function selectProgressiveVisionBeam(
  visions: readonly ProgressiveVision[],
  policy: ProgressiveVisionEnsemblePolicy,
): VisionBeamSelection {
  const mutable = visions.map((vision) => ({ ...vision }));
  const eligible = mutable
    .filter(
      (vision) =>
        vision.status !== "pruned" &&
        vision.status !== "exhausted" &&
        vision.status !== "superseded",
    )
    .sort(rank);
  const dominated = new Set<string>();

  for (let leftIndex = 0; leftIndex < eligible.length; leftIndex += 1) {
    const left = eligible[leftIndex];
    if (left === undefined || dominated.has(left.id)) {
      continue;
    }

    for (let rightIndex = leftIndex + 1; rightIndex < eligible.length; rightIndex += 1) {
      const right = eligible[rightIndex];
      if (right === undefined || dominated.has(right.id)) {
        continue;
      }

      if (visionDominates(left, right, policy.dominanceMargin)) {
        dominated.add(right.id);
      }
    }
  }

  const ranked = eligible.filter((vision) => !dominated.has(vision.id));
  const active = ranked
    .filter(
      (vision) =>
        vision.score >= policy.minimumActiveScore &&
        vision.staleContextRevisions === 0,
    )
    .slice(0, policy.maxActiveVisions);
  const activeIds = new Set(active.map((vision) => vision.id));
  const deferred = ranked
    .filter((vision) => !activeIds.has(vision.id))
    .slice(0, policy.maxDeferredVisions);
  const deferredIds = new Set(deferred.map((vision) => vision.id));
  const dominantVisionId = active[0]?.id ?? null;
  const next = mutable.map((vision) => {
    if (dominated.has(vision.id)) {
      return { ...vision, status: "superseded" as const };
    }

    if (vision.id === dominantVisionId) {
      return { ...vision, status: "dominant" as const };
    }

    if (activeIds.has(vision.id)) {
      return { ...vision, status: "exploring" as const };
    }

    if (deferredIds.has(vision.id)) {
      return { ...vision, status: "deferred" as const };
    }

    if (
      vision.status !== "pruned" &&
      vision.status !== "exhausted" &&
      vision.status !== "superseded"
    ) {
      return { ...vision, status: "deferred" as const };
    }

    return vision;
  });

  return {
    visions: next,
    dominantVisionId,
    activeVisionIds: active.map((vision) => vision.id),
    deferredVisionIds: deferred.map((vision) => vision.id),
    supersededVisionIds: [...dominated],
  };
}
