import type { MemoryScope } from "../domain/types.js";
import type { OutcomeVerdict } from "../episodes/types.js";

export type SituationPhase =
  | "exploration"
  | "convergence"
  | "implementation"
  | "validation"
  | "closed";

export type SituationState =
  | "forming"
  | "active"
  | "resolved"
  | "abandoned"
  | "superseded"
  | "unresolved";

export interface ContextContract {
  id: string;
  version: number;
  situationId: string;
  initialNeed: string;
  currentGoal: string;
  invariants: string[];
  discriminatingProperties: string[];
  forbiddenEffects: string[];
  acceptanceCriteria: string[];
  acceptedDecisions: string[];
  rejectedTrajectories: string[];
  unresolvedQuestions: string[];
  sourceContextIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Situation {
  id: string;
  scope: MemoryScope;
  contextFrameIds: string[];
  transitionIds: string[];
  initialNeed: string;
  currentGoal: string;
  phase: SituationPhase;
  state: SituationState;
  contract: ContextContract;
  outcome: OutcomeVerdict | null;
  accumulatorId: string | null;
  startedAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface BuildSituationInput {
  id: string;
  scope: MemoryScope;
  initialNeed: string;
  currentGoal?: string;
  contextFrameIds: string[];
  transitionIds?: string[];
  invariants?: string[];
  discriminatingProperties?: string[];
  forbiddenEffects?: string[];
  acceptanceCriteria?: string[];
  unresolvedQuestions?: string[];
  startedAt: string;
}

export interface PhaseHandoff {
  id: string;
  situationId: string;
  from: SituationPhase;
  to: SituationPhase;
  contractVersion: number;
  retainedContextIds: string[];
  compactedContextIds: string[];
  dormantContextIds: string[];
  openRisks: string[];
  requiredNextChecks: string[];
  createdAt: string;
}

export interface TransitionPhaseInput {
  situation: Situation;
  to: Exclude<SituationPhase, "exploration">;
  retainedContextIds: string[];
  compactedContextIds?: string[];
  dormantContextIds?: string[];
  openRisks?: string[];
  requiredNextChecks?: string[];
  acceptedDecisions?: string[];
  rejectedTrajectories?: string[];
  unresolvedQuestions?: string[];
  currentGoal?: string;
  createdAt: string;
}

export interface SituationPhaseTransition {
  situation: Situation;
  handoff: PhaseHandoff;
}
