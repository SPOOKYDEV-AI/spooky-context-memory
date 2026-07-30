import { reconstructTransitionPath } from "../contexts/reconstruct-transition-path.js";
import { uniqueNormalizedStrings } from "../utils/normalized-set.js";
import type {
  ReconstructMemoryInput,
  ReconstructedMemoryContext,
} from "./types.js";

function limit(values: readonly string[], maximum: number): string[] {
  return uniqueNormalizedStrings(values).slice(0, maximum);
}

function lines(title: string, values: readonly string[]): string[] {
  if (values.length === 0) {
    return [];
  }
  return [title, ...values.map((value) => `- ${value}`)];
}

function compile(
  result: Omit<ReconstructedMemoryContext, "compiledText">,
  maximum: number,
): string {
  const sections = [
    "Reconstructed Memory",
    `Current need: ${result.currentNeed}`,
    ...lines("Must preserve:", result.mustPreserve),
    ...lines("Historical warnings:", result.historicalWarnings),
    ...lines("Do not repeat:", result.priorRejectedTrajectories),
    ...lines("Relevant decisions:", result.relevantDecisions),
    ...lines("Transition path:", result.transitionPath),
    ...lines("Unknowns:", result.unresolvedUnknowns),
  ];
  const text = sections.join("\n");
  return text.length <= maximum ? text : `${text.slice(0, Math.max(0, maximum - 1))}…`;
}

export function reconstructMemoryContext(
  input: ReconstructMemoryInput,
): ReconstructedMemoryContext {
  const maximumItems = Math.max(1, input.maxItemsPerSection ?? 5);
  const activeCapsules = input.capsuleInputs.filter(
    (item) =>
      item.capsule.lifecycle.status === "active" &&
      item.applicabilityConfidence >= 0.6,
  );
  const activePatterns = input.patternInputs.filter(
    (item) =>
      item.confidence >= 0.55 &&
      item.pattern.lifecycle.status !== "superseded",
  );
  const relevantContexts = input.contexts
    .filter(
      (context) =>
        context.retentionState !== "archived" &&
        context.retentionState !== "eligible_for_deletion" &&
        (context.activationState !== "dormant" || context.relevance >= 0.6),
    )
    .sort(
      (left, right) =>
        right.activation * right.relevance - left.activation * left.relevance,
    )
    .slice(0, maximumItems);

  const path =
    input.fromContextId !== undefined && input.toContextId !== undefined
      ? reconstructTransitionPath(
          input.transitions,
          input.fromContextId,
          input.toContextId,
        )
      : [];

  const mustPreserve = limit(
    [
      ...input.task.constraints,
      ...activeCapsules.flatMap((item) => item.capsule.resolution.preserves),
      ...activePatterns.flatMap((item) => item.pattern.prevention.mustPreserve),
    ],
    maximumItems,
  );
  const historicalWarnings = limit(
    [
      ...activePatterns.flatMap(
        (item) => item.pattern.prototype.reasoningFailures,
      ),
      ...activeCapsules.flatMap((item) =>
        item.capsule.experience.errors.map((error) => error.description),
      ),
    ],
    maximumItems,
  );
  const priorRejectedTrajectories = limit(
    activeCapsules.flatMap((item) => [
      ...item.capsule.experience.failedAttempts.map(
        (attempt) => attempt.description,
      ),
      ...item.capsule.experience.rejectedHypotheses.map(
        (attempt) => attempt.description,
      ),
    ]),
    maximumItems,
  );
  const relevantDecisions = limit(
    activeCapsules.flatMap((item) => [
      item.capsule.resolution.description,
      ...item.capsule.experience.decisions.map(
        (decision) => decision.description,
      ),
    ]),
    maximumItems,
  );
  const unresolvedUnknowns = limit(
    activeCapsules.flatMap((item) =>
      item.capsule.applicability.unknownConditions.map(
        (condition) => condition.field,
      ),
    ),
    maximumItems,
  );
  const transitionPath = path.map(
    (transition) => `${transition.trigger}: ${transition.bridge}`,
  );
  const base = {
    currentNeed: `${input.task.intent}: ${input.task.expectedOutcome}`,
    reactivatedContextIds: relevantContexts.map((context) => context.id),
    mustPreserve,
    historicalWarnings,
    priorRejectedTrajectories,
    relevantDecisions,
    transitionPath,
    unresolvedUnknowns,
    provenance: {
      capsuleIds: activeCapsules.map((item) => item.capsule.id),
      patternIds: activePatterns.map((item) => item.pattern.id),
      contextIds: relevantContexts.map((context) => context.id),
      transitionIds: path.map((transition) => transition.id),
    },
  };

  return {
    ...base,
    compiledText: compile(base, Math.max(300, input.maxCharacters ?? 1600)),
  };
}
