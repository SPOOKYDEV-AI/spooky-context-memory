import type { SituationPhase } from "../situations/types.js";

export interface ContextPhaseSnapshot {
  phase: SituationPhase;
  estimatedCharacters: number;
  preservedInvariantCount: number;
  missingInvariantCount: number;
  activeFrameCount: number;
  compactedFrameCount: number;
  dormantFrameCount: number;
  usefulItemCount: number;
}

export interface ContextEfficiencyMetrics {
  fidelity: number;
  informationDensity: number;
  compactionRatio: number;
  phaseIntensity: number;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function calculateContextEfficiency(
  snapshot: ContextPhaseSnapshot,
  baselineCharacters: number,
): ContextEfficiencyMetrics {
  const totalInvariants =
    snapshot.preservedInvariantCount + snapshot.missingInvariantCount;
  const fidelity =
    totalInvariants === 0
      ? 1
      : snapshot.preservedInvariantCount / totalInvariants;
  const informationDensity = clamp(
    snapshot.usefulItemCount / Math.max(1, snapshot.estimatedCharacters / 220),
  );
  const compactionRatio = clamp(
    1 - snapshot.estimatedCharacters / Math.max(1, baselineCharacters),
  );
  const phaseIntensity = clamp(
    fidelity * 0.62 + informationDensity * 0.25 + (1 - snapshot.missingInvariantCount * 0.12) * 0.13,
  );

  return {
    fidelity: clamp(fidelity),
    informationDensity,
    compactionRatio,
    phaseIntensity,
  };
}
