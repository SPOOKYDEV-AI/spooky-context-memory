import type { ReflectiveMemoryState } from "../reflection/types.js";
import type { AdaptiveUnlearningState } from "../unlearning/types.js";
import type { GlobalUnderstandingState } from "../understanding/types.js";

export interface AdaptiveMemoryMetrics {
  globalCoherence: number;
  globalStability: number;
  globalPlasticity: number;
  revisionLocality: number;
  mirrorGroundingRate: number;
  causalCalibrationGap: number;
  reflectivePolicyCoverage: number;
  habitRigidity: number;
  reversibleUnlearningRate: number;
  safeInhibitionBeforeSupersessionRate: number;
  recoveryReadiness: number;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function measureAdaptiveMemory(
  understanding: GlobalUnderstandingState,
  reflection: ReflectiveMemoryState,
  unlearning: AdaptiveUnlearningState,
): AdaptiveMemoryMetrics {
  const dominant = understanding.models.find(
    (model) => model.id === understanding.dominantModelId,
  );
  const totalRevisions = understanding.localRevisionCount + understanding.globalRevisionCount;
  const grounded = reflection.trajectories.filter(
    (trajectory) => trajectory.externalGroundingKeys.length > 0,
  );
  const successful = reflection.trajectories.filter(
    (trajectory) =>
      trajectory.verdict === "supported" ||
      trajectory.verdict === "partially_supported",
  );
  const causalGap = successful.map((trajectory) => {
    const outcome = trajectory.verdict === "supported" ? 1 : 0.68;
    const causal =
      trajectory.causalValidation === "verified"
        ? 1
        : trajectory.causalValidation === "supported"
          ? 0.72
          : trajectory.causalValidation === "unsupported"
            ? 0.25
            : trajectory.causalValidation === "refuted"
              ? 0
              : 0.15;
    return Math.max(0, outcome - causal);
  });
  const activeHabits = unlearning.habits.filter(
    (habit) => !["superseded", "quarantined"].includes(habit.status),
  );
  const habitRigidity = average(
    activeHabits.map((habit) =>
      clamp(habit.automaticity * (1 - habit.adaptability) * habit.confidence.currentApplicability),
    ),
  );
  const reversible = unlearning.decisions.filter((decision) => decision.reversible);
  const supersessions = unlearning.decisions.filter(
    (decision) => decision.action === "supersede",
  );
  const safeSupersessions = supersessions.filter((decision) =>
    unlearning.inhibitions.some(
      (record) =>
        record.habitId === decision.habitId &&
        Date.parse(record.createdAt) <= Date.parse(decision.decidedAt),
    ),
  );
  return {
    globalCoherence: dominant?.coherence ?? 0,
    globalStability: dominant?.stability ?? 0,
    globalPlasticity: dominant?.plasticity ?? 0,
    revisionLocality:
      totalRevisions === 0 ? 1 : understanding.localRevisionCount / totalRevisions,
    mirrorGroundingRate:
      reflection.trajectories.length === 0
        ? 0
        : grounded.length / reflection.trajectories.length,
    causalCalibrationGap: average(causalGap),
    reflectivePolicyCoverage:
      reflection.capsules.length === 0
        ? 0
        : clamp(reflection.cognitivePolicies.length / reflection.capsules.length),
    habitRigidity,
    reversibleUnlearningRate:
      unlearning.decisions.length === 0
        ? 1
        : reversible.length / unlearning.decisions.length,
    safeInhibitionBeforeSupersessionRate:
      supersessions.length === 0 ? 1 : safeSupersessions.length / supersessions.length,
    recoveryReadiness:
      unlearning.recoveryRegistry.length === 0
        ? 0
        : unlearning.recoveryRegistry.filter((entry) => entry.ready).length /
          unlearning.recoveryRegistry.length,
  };
}
