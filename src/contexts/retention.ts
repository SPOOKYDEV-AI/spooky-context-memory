import type {
  ContextRetentionAssessment,
  ContextRetentionSignals,
  ContextRetentionState,
} from "./types.js";

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function recommendedState(score: number): ContextRetentionState {
  if (score >= 0.82) {
    return "pinned";
  }
  if (score >= 0.64) {
    return "active";
  }
  if (score >= 0.46) {
    return "background";
  }
  if (score >= 0.28) {
    return "compacted";
  }
  if (score >= 0.14) {
    return "dormant";
  }
  return "archived";
}

export function assessContextRetention(
  signals: ContextRetentionSignals,
): ContextRetentionAssessment {
  const positive =
    clamp(signals.goalDependency) * 0.22 +
    clamp(signals.constraintImportance) * 0.18 +
    clamp(signals.unresolvedDependency) * 0.18 +
    clamp(signals.discriminatingPower) * 0.14 +
    clamp(signals.validationImportance) * 0.14 +
    clamp(signals.reuseValue) * 0.14;
  const negative =
    clamp(signals.redundancy) * 0.12 +
    clamp(signals.resolutionCompleteness) * 0.18;
  const score = clamp(positive - negative + 0.18);
  const reasons: string[] = [];

  if (signals.goalDependency >= 0.7) {
    reasons.push("The context still controls the current goal.");
  }
  if (signals.constraintImportance >= 0.7) {
    reasons.push("The context carries high-value constraints.");
  }
  if (signals.unresolvedDependency >= 0.5) {
    reasons.push("Unresolved work still depends on this context.");
  }
  if (signals.validationImportance >= 0.7) {
    reasons.push("The context is required for final validation.");
  }
  if (signals.redundancy >= 0.7) {
    reasons.push("Much of the raw context is now redundant.");
  }
  if (signals.resolutionCompleteness >= 0.8) {
    reasons.push("The situation is sufficiently resolved for compaction.");
  }

  return {
    score,
    recommendedState: recommendedState(score),
    reasons,
  };
}
