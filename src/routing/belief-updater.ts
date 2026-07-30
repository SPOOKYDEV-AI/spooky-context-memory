import type {
  BeliefEvidence,
  BeliefHypothesis,
  UpdatedBelief,
} from "./types.js";

function clampProbability(value: number): number {
  return Math.max(0.001, Math.min(0.999, value));
}

function toOdds(probability: number): number {
  const clamped = clampProbability(probability);
  return clamped / (1 - clamped);
}

function toProbability(odds: number): number {
  return odds / (1 + odds);
}

export function updateBeliefs(
  hypotheses: readonly BeliefHypothesis[],
  evidence: readonly BeliefEvidence[],
): UpdatedBelief[] {
  return hypotheses.map((hypothesis) => {
    const relevant = evidence.filter(
      (item) => item.hypothesisId === hypothesis.id,
    );
    const strongestByIndependenceGroup = new Map<string, BeliefEvidence>();

    for (const item of relevant) {
      const previous = strongestByIndependenceGroup.get(item.independenceKey);
      const strength = Math.abs(Math.log(Math.max(0.01, item.likelihoodRatio)));
      const previousStrength = previous
        ? Math.abs(Math.log(Math.max(0.01, previous.likelihoodRatio)))
        : -1;

      if (!previous || strength > previousStrength) {
        strongestByIndependenceGroup.set(item.independenceKey, item);
      }
    }

    let odds = toOdds(hypothesis.priorProbability);
    const appliedEvidenceIds: string[] = [];

    for (const item of strongestByIndependenceGroup.values()) {
      odds *= Math.max(0.01, Math.min(100, item.likelihoodRatio));
      appliedEvidenceIds.push(item.evidenceId);
    }

    return {
      hypothesisId: hypothesis.id,
      priorProbability: hypothesis.priorProbability,
      posteriorProbability: clampProbability(toProbability(odds)),
      appliedEvidenceIds,
    };
  });
}
