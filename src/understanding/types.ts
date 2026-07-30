import type { MemoryScope } from "../domain/types.js";

export type GlobalUnderstandingModelStatus =
  | "candidate"
  | "dominant"
  | "alternative"
  | "challenged"
  | "superseded"
  | "archived";

export type UnderstandingClaimStatus =
  | "accepted"
  | "alternative"
  | "disputed"
  | "retired";

export type SemanticBackboneRelation =
  | "depends_on"
  | "causes"
  | "constrains"
  | "explains"
  | "excludes"
  | "enables"
  | "preserves"
  | "supersedes";

export interface GlobalIdentity {
  subject: string;
  primaryGoal: string;
  currentSituation: string;
}

export interface UnderstandingClaim {
  id: string;
  key: string;
  statement: string;
  status: UnderstandingClaimStatus;
  confidence: number;
  truthAnchorIds: string[];
  patternIds: string[];
  viewIds: string[];
  independentSupportKeys: string[];
  independentChallengeKeys: string[];
}

export interface SemanticBackboneEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relation: SemanticBackboneRelation;
  confidence: number;
  status: "candidate" | "supported" | "verified" | "disputed" | "superseded";
  independentSupportKeys: string[];
  independentChallengeKeys: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GlobalUnderstandingModel {
  id: string;
  revision: number;
  status: GlobalUnderstandingModelStatus;
  identity: GlobalIdentity;
  scope: MemoryScope;
  contextFingerprint: string;
  invariantIds: string[];
  truthAnchorIds: string[];
  corePatternIds: string[];
  claims: UnderstandingClaim[];
  unresolvedQuestionIds: string[];
  semanticBackboneEdgeIds: string[];
  coherence: number;
  stability: number;
  plasticity: number;
  uncertainty: number;
  contextCoverage: number;
  contradictionPressure: number;
  revisionPressure: number;
  independentSupportKeys: string[];
  independentChallengeKeys: string[];
  derivedFromModelIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GlobalUnderstandingState {
  revision: number;
  dominantModelId: string;
  alternativeModelIds: string[];
  models: GlobalUnderstandingModel[];
  semanticBackbone: SemanticBackboneEdge[];
  localRevisionCount: number;
  globalRevisionCount: number;
  updatedAt: string;
}

export type UnderstandingObservationKind =
  | "view_outcome"
  | "truth_change"
  | "pattern_change"
  | "context_shift"
  | "reflective_signal"
  | "unlearning_signal";

export type UnderstandingObservationEffect =
  | "supports"
  | "challenges"
  | "expands"
  | "narrows"
  | "supersedes";

export interface UnderstandingObservation {
  id: string;
  kind: UnderstandingObservationKind;
  effect: UnderstandingObservationEffect;
  targetIds: string[];
  weight: number;
  independenceKey: string;
  contextFingerprint: string;
  scope: MemoryScope;
  reason: string;
  observedAt: string;
}

export interface GlobalUnderstandingPolicy {
  minimumCoherence: number;
  globalRevisionPressureThreshold: number;
  localRevisionPressureThreshold: number;
  minimumIndependentChallengesForGlobalRevision: number;
  alternativePromotionMargin: number;
  contextDriftWeight: number;
  truthChangeWeight: number;
  stabilityInertia: number;
}

export type GlobalUnderstandingPolicyOverrides = Partial<GlobalUnderstandingPolicy>;

export type GlobalRevisionAction =
  | "maintain"
  | "local_revision"
  | "challenge_dominant"
  | "promote_alternative"
  | "global_revision";

export interface GlobalRevisionDecision {
  action: GlobalRevisionAction;
  modelId: string;
  replacementModelId: string | null;
  confidence: number;
  reasons: string[];
  triggeringObservationIds: string[];
  reversible: boolean;
}

export interface CreateGlobalUnderstandingStateInput {
  dominantModel: GlobalUnderstandingModel;
  alternativeModels?: GlobalUnderstandingModel[];
  semanticBackbone?: SemanticBackboneEdge[];
  createdAt?: string;
}

export interface ApplyUnderstandingObservationsInput {
  state: GlobalUnderstandingState;
  observations: UnderstandingObservation[];
  replacementModel?: GlobalUnderstandingModel;
  policy?: GlobalUnderstandingPolicyOverrides;
  updatedAt?: string;
}

export interface ApplyUnderstandingObservationsResult {
  state: GlobalUnderstandingState;
  decision: GlobalRevisionDecision;
  affectedModelIds: string[];
  affectedClaimIds: string[];
  affectedBackboneEdgeIds: string[];
}
