import type { MemoryAttentionField } from "../attention/types.js";
import type { CrossViewTriageResult } from "../views/types.js";

export interface EquilibriumBand {
  minimum: number;
  targetLow: number;
  targetHigh: number;
  maximum: number;
}

export type EquilibriumDimension =
  | "goal_fidelity"
  | "constraint_coverage"
  | "attention_diversity"
  | "view_diversity"
  | "challenge_coverage"
  | "uncertainty_coverage"
  | "exploration_depth"
  | "exploration_breadth"
  | "injection_efficiency"
  | "stability"
  | "plasticity";

export interface ExplorationDebtItem {
  id: string;
  question: string;
  criticality: number;
  coverage: number;
  riskIfIgnored: number;
  assignedViewIds: string[];
}

export interface EquilibriumObservation {
  visitedMemoryItems: number;
  injectedMemoryItems: number;
  averageExplorationDepth: number;
  dominantViewHistory: string[];
  changedContextIds: string[];
  changedTruthAnchorIds: string[];
  explorationDebt: ExplorationDebtItem[];
}

export type EquilibriumAction =
  | "DEEPEN_VIEW"
  | "SPAWN_ALTERNATIVE"
  | "DEFER_VIEW"
  | "PRUNE_VIEW"
  | "BACKTRACK"
  | "REACTIVATE_ATTENTION"
  | "DECAY_ATTENTION"
  | "PIN_INVARIANT"
  | "REDUCE_INJECTION"
  | "EXPAND_EXPLORATION"
  | "REQUEST_EVIDENCE"
  | "FREEZE_CONSOLIDATION"
  | "MAINTAIN";

export interface RebalanceDecision {
  action: EquilibriumAction;
  targetIds: string[];
  reason: string;
  triggeringSignals: string[];
  expectedEffect: string;
  confidence: number;
  reversible: boolean;
}

export interface EquilibriumSnapshot {
  revision: number;
  dimensions: Record<EquilibriumDimension, number>;
  outOfBandDimensions: EquilibriumDimension[];
  criticalExplorationDebtIds: string[];
  oscillationDetected: boolean;
  dominantViewId: string | null;
  dominantAttentionId: string | null;
  createdAt: string;
}

export interface DynamicEquilibriumPolicy {
  bands: Record<EquilibriumDimension, EquilibriumBand>;
  dominanceHysteresis: number;
  maximumDominanceSwitches: number;
  criticalDebtThreshold: number;
  minimumCorrectionConfidence: number;
}

export type DynamicEquilibriumPolicyOverrides = Partial<
  Omit<DynamicEquilibriumPolicy, "bands">
> & {
  bands?: Partial<Record<EquilibriumDimension, Partial<EquilibriumBand>>>;
};

export interface EvaluateDynamicEquilibriumInput {
  attentionField: MemoryAttentionField;
  triage: CrossViewTriageResult;
  observation: EquilibriumObservation;
  previousSnapshot?: EquilibriumSnapshot;
  policy?: DynamicEquilibriumPolicyOverrides;
  evaluatedAt?: string;
}

export interface DynamicEquilibriumResult {
  snapshot: EquilibriumSnapshot;
  decisions: RebalanceDecision[];
  balanced: boolean;
}
