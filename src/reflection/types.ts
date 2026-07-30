import type { AttentionRole, AttentionStatus } from "../attention/types.js";
import type { MemoryScope } from "../domain/types.js";
import type { AttentionViewVerdict } from "../views/types.js";

export type CausalValidationState =
  | "not_tested"
  | "unsupported"
  | "supported"
  | "verified"
  | "refuted";

export interface TrajectoryAttentionSnapshot {
  focusId: string;
  role: AttentionRole;
  weight: number;
  status: AttentionStatus;
}

export interface CognitiveTrajectory {
  id: string;
  contextFingerprint: string;
  contextDiscriminators: string[];
  scope: MemoryScope;
  contextRevision: number;
  memoryRevision: number;
  truthRevision: number;
  attentions: TrajectoryAttentionSnapshot[];
  generatedViewIds: string[];
  activeViewIds: string[];
  selectedViewId: string | null;
  rejectedViewIds: string[];
  verificationSteps: string[];
  actionSummary: string;
  expectedOutcome: string;
  actualOutcome: string;
  verdict: AttentionViewVerdict;
  outcomeConfidence: number;
  predictionScore: number;
  causalValidation: CausalValidationState;
  causalClaimPromoted: boolean;
  externalGroundingKeys: string[];
  visitedMemoryItems: number;
  injectedMemoryItems: number;
  durationMs: number;
  independentOutcomeKey: string;
  startedAt: string;
  completedAt: string;
}

export interface ViewSuccessAnalysis {
  trajectoryId: string;
  outcomeFit: number;
  predictionFit: number;
  causalFit: number;
  strategyEfficiency: number;
  attentionDiversity: number;
  contradictionCoverage: number;
  mirrorLearningAllowed: boolean;
  outcomeValidated: boolean;
  causalExplanationValidated: boolean;
  warnings: string[];
}

export type ReflectiveCapsuleStatus =
  | "candidate"
  | "supported"
  | "validated"
  | "disputed"
  | "narrowed"
  | "superseded";

export interface ReflectiveAttentionPattern {
  roleWeights: Record<AttentionRole, number>;
  sequencing: AttentionRole[];
}

export interface ReflectiveViewPattern {
  minimumAlternativeViews: number;
  requiresChallengeView: boolean;
  usefulViewSignatures: string[];
  rejectedViewSignatures: string[];
}

export interface ReflectiveExplorationProfile {
  preferredBreadth: number;
  preferredDepth: number;
  contradictionBudget: number;
  maximumVisitedMemoryItems: number;
  maximumInjectedMemoryItems: number;
}

export interface ReflectiveCapsule {
  id: string;
  contextFingerprint: string;
  contextDiscriminators: string[];
  scope: MemoryScope;
  attentionPattern: ReflectiveAttentionPattern;
  viewPattern: ReflectiveViewPattern;
  explorationProfile: ReflectiveExplorationProfile;
  validationRequirements: string[];
  independentSuccessKeys: string[];
  independentFailureKeys: string[];
  confidence: number;
  currentApplicability: number;
  status: ReflectiveCapsuleStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface CognitivePolicyProfile {
  id: string;
  contextFingerprint: string;
  contextDiscriminators: string[];
  roleWeights: Record<AttentionRole, number>;
  preferredBreadth: number;
  preferredDepth: number;
  contradictionBudget: number;
  minimumAlternativeViews: number;
  maximumVisitedMemoryItems: number;
  maximumInjectedMemoryItems: number;
  confidence: number;
  sourceReflectiveCapsuleIds: string[];
  revision: number;
  updatedAt: string;
}

export type SelfBiasKind =
  | "confirmation_bias"
  | "experience_overuse"
  | "dominant_view_inertia"
  | "contradiction_neglect"
  | "novelty_neglect"
  | "outcome_cause_conflation"
  | "memory_over_injection";

export interface SelfBiasSignal {
  id: string;
  kind: SelfBiasKind;
  severity: number;
  trajectoryIds: string[];
  reasons: string[];
  suggestedCorrections: string[];
  detectedAt: string;
}

export interface ReflectiveMemoryState {
  revision: number;
  trajectories: CognitiveTrajectory[];
  capsules: ReflectiveCapsule[];
  cognitivePolicies: CognitivePolicyProfile[];
  biasSignals: SelfBiasSignal[];
  updatedAt: string;
}

export interface ReflectiveLearningPolicy {
  maximumStoredTrajectories: number;
  minimumIndependentSuccessesForSupport: number;
  minimumIndependentSuccessesForValidation: number;
  minimumExternalGroundingKeys: number;
  biasWindowSize: number;
  experienceOveruseThreshold: number;
  contradictionNeglectThreshold: number;
  dominantViewInertiaThreshold: number;
  injectionRatioThreshold: number;
}

export type ReflectiveLearningPolicyOverrides = Partial<ReflectiveLearningPolicy>;

export interface ApplyReflectiveLearningInput {
  state: ReflectiveMemoryState;
  trajectory: CognitiveTrajectory;
  existingPolicyId?: string;
  policy?: ReflectiveLearningPolicyOverrides;
  updatedAt?: string;
}

export interface ApplyReflectiveLearningResult {
  state: ReflectiveMemoryState;
  analysis: ViewSuccessAnalysis;
  reflectiveCapsule: ReflectiveCapsule | null;
  cognitivePolicy: CognitivePolicyProfile | null;
  newBiasSignals: SelfBiasSignal[];
  mirrorLearningAccepted: boolean;
}
