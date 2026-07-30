import type { ExperienceCapsule } from "../capsules/types.js";
import type { MemoryClaim } from "../claims/types.js";
import { uniqueNormalizedStrings } from "../utils/normalized-set.js";
import type { CausalSignature } from "./types.js";

export function buildCausalSignature(
  capsule: ExperienceCapsule,
  claims: readonly MemoryClaim[] = [],
): CausalSignature {
  const reasoningClaims = claims
    .filter(
      (claim) =>
        claim.kind === "hypothesis" || claim.kind === "root_cause",
    )
    .map((claim) => claim.statement);
  const applicabilityClaims = claims
    .filter((claim) => claim.kind === "applicability")
    .map((claim) => claim.statement);

  return {
    reasoningFailures: uniqueNormalizedStrings([
      capsule.experience.rootCause ?? "",
      ...capsule.experience.rejectedHypotheses.map(
        (attempt) => attempt.description,
      ),
      ...reasoningClaims,
    ]),
    triggeringSignals: uniqueNormalizedStrings([
      capsule.initialNeed.intent,
      ...capsule.initialNeed.operations,
      ...capsule.experience.observedSymptoms,
      ...applicabilityClaims,
    ]),
    lostOrRequiredConstraints: uniqueNormalizedStrings([
      ...capsule.initialNeed.constraints,
      ...capsule.resolution.preserves,
    ]),
    predictedConsequences: uniqueNormalizedStrings([
      ...capsule.initialNeed.forbiddenEffects,
      ...capsule.resolution.risks,
      ...capsule.experience.errors.map((error) => error.description),
    ]),
    resolutionPrinciples: uniqueNormalizedStrings([
      capsule.resolution.description,
      capsule.resolution.rationale,
      ...capsule.resolution.preserves,
    ]),
    scopeKeys: uniqueNormalizedStrings([
      capsule.origin.projectId ?? "",
      capsule.origin.workflowId ?? "",
      capsule.initialNeed.target,
    ]),
  };
}
