import { uniqueNormalizedStrings } from "../utils/normalized-set.js";
import type { BuildPreflightInput, MemoryPreflight } from "./types.js";
import { classifyKnowledgeState } from "./classify-knowledge-state.js";

function limit(values: readonly string[], maximum: number): string[] {
  return uniqueNormalizedStrings(values).slice(0, maximum);
}

export function buildMemoryPreflight(
  input: BuildPreflightInput,
): MemoryPreflight {
  const maximum = Math.max(1, input.maxItemsPerSection ?? 6);
  const applicableCapsules = input.capsules.filter(
    (item) =>
      item.usage !== "diagnostic_reference" &&
      item.applicabilityConfidence >= 0.6 &&
      item.capsule.lifecycle.status === "active",
  );
  const diagnosticCapsules = input.capsules.filter(
    (item) => item.usage === "diagnostic_reference",
  );
  const activePatterns = input.patterns.filter(
    (item) =>
      item.confidence >= 0.55 &&
      item.pattern.lifecycle.status !== "superseded",
  );

  const mustPreserve = limit(
    [
      ...input.task.constraints,
      ...applicableCapsules.flatMap((item) => item.capsule.resolution.preserves),
      ...activePatterns.flatMap((item) => item.pattern.prevention.mustPreserve),
    ],
    maximum,
  );
  const knownFailureModes = limit(
    [
      ...activePatterns.flatMap(
        (item) => item.pattern.prototype.reasoningFailures,
      ),
      ...applicableCapsules.flatMap((item) => [
        ...item.capsule.experience.rejectedHypotheses.map(
          (attempt) => attempt.description,
        ),
        ...item.capsule.experience.errors.map((error) => error.description),
      ]),
      ...diagnosticCapsules.flatMap((item) =>
        item.capsule.experience.errors.map((error) =>
          `Diagnostic only: ${error.description}`,
        ),
      ),
    ],
    maximum,
  );
  const prunedApproaches = limit(
    [
      ...(input.prunedApproaches ?? []),
      ...applicableCapsules.flatMap((item) =>
        item.capsule.experience.failedAttempts.map(
          (attempt) => attempt.description,
        ),
      ),
      ...activePatterns.flatMap(
        (item) => item.pattern.prevention.prohibitedShortcuts,
      ),
    ],
    maximum,
  );
  const verifyBeforeActing = limit(
    [
      ...activePatterns.flatMap((item) => [
        ...item.pattern.prevention.checks,
        ...item.pattern.prevention.questionsToResolve,
      ]),
      ...applicableCapsules.flatMap((item) =>
        item.capsule.applicability.unknownConditions.map(
          (condition) => `Resolve condition: ${condition.field}`,
        ),
      ),
    ],
    maximum,
  );
  const unresolvedUnknowns = limit(
    [
      ...(input.unresolvedUnknowns ?? []),
      ...applicableCapsules.flatMap((item) =>
        item.capsule.applicability.unknownConditions.map(
          (condition) => condition.field,
        ),
      ),
    ],
    maximum,
  );

  return {
    knowledgeState: classifyKnowledgeState(input),
    mustPreserve,
    knownFailureModes,
    prunedApproaches,
    verifyBeforeActing,
    unresolvedUnknowns,
    sourceCapsuleIds: Array.from(
      new Set(input.capsules.map((item) => item.capsule.id)),
    ),
    sourcePatternIds: Array.from(
      new Set(activePatterns.map((item) => item.pattern.id)),
    ),
  };
}
