import type {
  BuildPreflightInput,
  KnowledgeState,
} from "./types.js";

export function classifyKnowledgeState(
  input: Pick<BuildPreflightInput, "capsules" | "patterns" | "unresolvedUnknowns">,
): KnowledgeState {
  const applicableCapsules = input.capsules.filter(
    (item) =>
      item.usage === "applicable" &&
      item.applicabilityConfidence >= 0.7 &&
      item.capsule.lifecycle.status === "active",
  );
  const strongPatterns = input.patterns.filter(
    (item) =>
      item.confidence >= 0.75 && item.pattern.lifecycle.status === "active",
  );
  const hasUnknowns = (input.unresolvedUnknowns ?? []).length > 0;

  if ((applicableCapsules.length > 0 || strongPatterns.length > 0) && !hasUnknowns) {
    return "known";
  }

  if (
    input.capsules.length > 0 ||
    input.patterns.length > 0 ||
    hasUnknowns
  ) {
    return "partially_known";
  }

  return "unknown";
}
