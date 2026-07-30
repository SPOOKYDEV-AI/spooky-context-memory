import { clonePlainData } from "../utils/clone-plain-data.js";
import { stableHash } from "../utils/stable-hash.js";
import { updateContextContract } from "./context-contract.js";
import type {
  PhaseHandoff,
  SituationPhase,
  SituationPhaseTransition,
  TransitionPhaseInput,
} from "./types.js";

const ALLOWED_TRANSITIONS: Readonly<Record<SituationPhase, SituationPhase[]>> = {
  exploration: ["convergence", "closed"],
  convergence: ["implementation", "exploration", "closed"],
  implementation: ["validation", "convergence", "closed"],
  validation: ["implementation", "closed"],
  closed: [],
};

function validateTransition(from: SituationPhase, to: SituationPhase): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new Error(`Invalid situation phase transition: ${from} -> ${to}.`);
  }
}

export function transitionSituationPhase(
  input: TransitionPhaseInput,
): SituationPhaseTransition {
  validateTransition(input.situation.phase, input.to);

  if (input.retainedContextIds.length === 0 && input.to !== "closed") {
    throw new Error("A non-closed phase must retain at least one context frame.");
  }

  const situation = clonePlainData(input.situation);
  const previousPhase = situation.phase;
  situation.contract = updateContextContract(situation.contract, {
    ...(input.currentGoal === undefined
      ? {}
      : { currentGoal: input.currentGoal }),
    acceptedDecisions: input.acceptedDecisions ?? [],
    rejectedTrajectories: input.rejectedTrajectories ?? [],
    unresolvedQuestions: input.unresolvedQuestions ?? [],
    sourceContextIds: input.retainedContextIds,
    updatedAt: input.createdAt,
  });
  situation.currentGoal = situation.contract.currentGoal;
  situation.contextFrameIds = Array.from(
    new Set([
      ...input.retainedContextIds,
      ...(input.compactedContextIds ?? []),
      ...(input.dormantContextIds ?? []),
    ]),
  );
  situation.phase = input.to;
  situation.state = input.to === "closed" ? situation.state : "active";
  situation.updatedAt = input.createdAt;

  const handoff: PhaseHandoff = {
    id: `handoff-${stableHash({
      situationId: situation.id,
      from: previousPhase,
      to: input.to,
      createdAt: input.createdAt,
    })}`,
    situationId: situation.id,
    from: previousPhase,
    to: input.to,
    contractVersion: situation.contract.version,
    retainedContextIds: Array.from(new Set(input.retainedContextIds)),
    compactedContextIds: Array.from(
      new Set(input.compactedContextIds ?? []),
    ),
    dormantContextIds: Array.from(new Set(input.dormantContextIds ?? [])),
    openRisks: Array.from(new Set(input.openRisks ?? [])),
    requiredNextChecks: Array.from(
      new Set(input.requiredNextChecks ?? []),
    ),
    createdAt: input.createdAt,
  };

  return { situation, handoff };
}
