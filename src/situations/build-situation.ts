import { createContextContract } from "./context-contract.js";
import type { BuildSituationInput, Situation } from "./types.js";

export function buildSituation(input: BuildSituationInput): Situation {
  if (input.contextFrameIds.length === 0) {
    throw new Error("A situation requires at least one context frame.");
  }

  const currentGoal = input.currentGoal?.trim() || input.initialNeed.trim();
  const contract = createContextContract({
    situationId: input.id,
    initialNeed: input.initialNeed,
    currentGoal,
    invariants: input.invariants ?? [],
    discriminatingProperties: input.discriminatingProperties ?? [],
    forbiddenEffects: input.forbiddenEffects ?? [],
    acceptanceCriteria: input.acceptanceCriteria ?? [],
    unresolvedQuestions: input.unresolvedQuestions ?? [],
    sourceContextIds: input.contextFrameIds,
    createdAt: input.startedAt,
  });

  return {
    id: input.id,
    scope: input.scope,
    contextFrameIds: Array.from(new Set(input.contextFrameIds)),
    transitionIds: Array.from(new Set(input.transitionIds ?? [])),
    initialNeed: contract.initialNeed,
    currentGoal: contract.currentGoal,
    phase: "exploration",
    state: "forming",
    contract,
    outcome: null,
    accumulatorId: null,
    startedAt: input.startedAt,
    updatedAt: input.startedAt,
    closedAt: null,
  };
}
