import { weightedJaccardSimilarity } from "../utils/normalized-set.js";
import type {
  CausalSignature,
  ExperiencePattern,
  PatternMatch,
} from "./types.js";

function scorePattern(
  signature: CausalSignature,
  pattern: ExperiencePattern,
): PatternMatch {
  const componentScores = {
    reasoning: weightedJaccardSimilarity(
      signature.reasoningFailures,
      pattern.prototype.reasoningFailures,
    ),
    triggers: weightedJaccardSimilarity(
      signature.triggeringSignals,
      pattern.prototype.triggeringSignals,
    ),
    constraints: weightedJaccardSimilarity(
      signature.lostOrRequiredConstraints,
      pattern.prototype.lostOrRequiredConstraints,
    ),
    consequences: weightedJaccardSimilarity(
      signature.predictedConsequences,
      pattern.prototype.predictedConsequences,
    ),
    resolution: weightedJaccardSimilarity(
      signature.resolutionPrinciples,
      pattern.prototype.resolutionPrinciples,
    ),
    scope: weightedJaccardSimilarity(
      signature.scopeKeys,
      pattern.prototype.scopeKeys,
    ),
  };
  const score =
    componentScores.reasoning * 0.32 +
    componentScores.triggers * 0.16 +
    componentScores.constraints * 0.22 +
    componentScores.consequences * 0.16 +
    componentScores.resolution * 0.1 +
    componentScores.scope * 0.04;
  const relationship =
    score >= 0.92 && componentScores.scope >= 0.8
      ? "duplicate"
      : score >= 0.7
        ? "instance_of_pattern"
        : score >= 0.55
          ? "extends"
          : "new_pattern";
  const reasons = [
    `Reasoning similarity: ${componentScores.reasoning.toFixed(2)}.`,
    `Constraint similarity: ${componentScores.constraints.toFixed(2)}.`,
    `Consequence similarity: ${componentScores.consequences.toFixed(2)}.`,
  ];

  return {
    patternId: pattern.id,
    relationship,
    score,
    componentScores,
    reasons,
  };
}

export function detectExperiencePattern(
  signature: CausalSignature,
  patterns: readonly ExperiencePattern[],
): PatternMatch {
  const matches = patterns
    .filter((pattern) => pattern.lifecycle.status !== "superseded")
    .map((pattern) => scorePattern(signature, pattern))
    .sort((left, right) => right.score - left.score);

  return (
    matches[0] ?? {
      patternId: null,
      relationship: "new_pattern",
      score: 0,
      componentScores: {
        reasoning: 0,
        triggers: 0,
        constraints: 0,
        consequences: 0,
        resolution: 0,
        scope: 0,
      },
      reasons: ["No existing pattern was available for comparison."],
    }
  );
}
