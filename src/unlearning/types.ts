import type { AttentionRole } from "../attention/types.js";
import type { MemoryScope } from "../domain/types.js";

export type CognitiveHabitStatus =
  | "candidate"
  | "useful"
  | "entrenched"
  | "challenged"
  | "inhibited"
  | "quarantined"
  | "relearning"
  | "superseded";

export interface AdaptiveConfidence {
  historicalSupport: number;
  currentApplicability: number;
  predictiveReliability: number;
  contradictionPressure: number;
  contextDrift: number;
}

export interface CognitiveHabit {
  id: string;
  scope: MemoryScope;
  contextFingerprint: string;
  contextDiscriminators: string[];
  preferredAttentionRoles: AttentionRole[];
  preferredViewPatternIds: string[];
  preferredActionPatternIds: string[];
  independentSuccessKeys: string[];
  independentFailureKeys: string[];
  automaticity: number;
  adaptability: number;
  confidence: AdaptiveConfidence;
  status: CognitiveHabitStatus;
  reactivationConditions: string[];
  supersededByHabitId: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export type HabitObservationKind =
  | "success"
  | "failure"
  | "context_shift"
  | "truth_supersession"
  | "superior_strategy"
  | "overactivation";

export interface HabitObservation {
  id: string;
  habitId: string;
  kind: HabitObservationKind;
  weight: number;
  independenceKey: string;
  currentContextFingerprint: string;
  currentDiscriminators: string[];
  reason: string;
  observedAt: string;
}

export interface ContextDriftReport {
  habitId: string;
  fingerprintChanged: boolean;
  discriminatorSimilarity: number;
  changedDiscriminators: string[];
  missingRequiredDiscriminators: string[];
  severity: number;
}

export type UnlearningAction =
  | "retain"
  | "challenge"
  | "contextually_inhibit"
  | "narrow"
  | "weaken"
  | "quarantine"
  | "supersede"
  | "reopen_unknown"
  | "relearn";

export interface UnlearningDecision {
  id: string;
  habitId: string;
  action: UnlearningAction;
  confidence: number;
  reasons: string[];
  triggeringObservationIds: string[];
  affectedDiscriminators: string[];
  reactivationConditions: string[];
  preservedHistoricalSupport: number;
  reversible: boolean;
  decidedAt: string;
}

export interface HabitInhibitionRecord {
  id: string;
  habitId: string;
  contextFingerprint: string;
  reason: string;
  triggeringObservationIds: string[];
  reactivationConditions: string[];
  active: boolean;
  createdAt: string;
  releasedAt: string | null;
}

export interface HabitRecoveryEntry {
  id: string;
  habitId: string;
  requiredConditions: string[];
  satisfiedConditions: string[];
  ready: boolean;
  updatedAt: string;
}

export interface CounterfactualViewPlan {
  id: string;
  habitId: string;
  strategy:
    | "habit_control"
    | "without_habit"
    | "inverted_assumption"
    | "fresh_from_truths";
  excludedPatternIds: string[];
  requiredAttentionRoles: AttentionRole[];
  requiredChecks: string[];
  maximumCost: number;
  reason: string;
}

export interface RelearningPlan {
  id: string;
  habitId: string;
  preserve: string[];
  suspend: string[];
  explore: string[];
  validationRequirements: string[];
  counterfactualViewPlanIds: string[];
  status: "planned" | "active" | "validated" | "abandoned";
  createdAt: string;
}

export interface AdaptiveUnlearningState {
  revision: number;
  habits: CognitiveHabit[];
  inhibitions: HabitInhibitionRecord[];
  recoveryRegistry: HabitRecoveryEntry[];
  relearningPlans: RelearningPlan[];
  decisions: UnlearningDecision[];
  updatedAt: string;
}

export interface AdaptiveUnlearningPolicy {
  minimumIndependentFailuresForInhibition: number;
  minimumIndependentFailuresForQuarantine: number;
  contextDriftThreshold: number;
  contradictionPressureThreshold: number;
  overactivationThreshold: number;
  superiorStrategyThreshold: number;
  automaticityReduction: number;
  applicabilityReduction: number;
}

export type AdaptiveUnlearningPolicyOverrides = Partial<AdaptiveUnlearningPolicy>;

export interface EvaluateHabitInput {
  state: AdaptiveUnlearningState;
  habitId: string;
  observations: HabitObservation[];
  replacementHabitId?: string;
  policy?: AdaptiveUnlearningPolicyOverrides;
  evaluatedAt?: string;
}

export interface EvaluateHabitResult {
  state: AdaptiveUnlearningState;
  decision: UnlearningDecision;
  drift: ContextDriftReport;
  counterfactualViewPlans: CounterfactualViewPlan[];
  relearningPlan: RelearningPlan | null;
}

export interface ReactivateHabitInput {
  state: AdaptiveUnlearningState;
  habitId: string;
  satisfiedConditions: string[];
  reactivatedAt?: string;
}

export interface ReactivateHabitResult {
  state: AdaptiveUnlearningState;
  reactivated: boolean;
  reason: string;
}
