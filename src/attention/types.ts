import type { ContextField } from "../contexts/types.js";
import type { MemoryScope } from "../domain/types.js";
import type { EpistemicCore } from "../epistemic/types.js";

export type AttentionTargetType =
  | "goal"
  | "context"
  | "constraint"
  | "truth_anchor"
  | "claim"
  | "capsule"
  | "pattern"
  | "unknown"
  | "contradiction"
  | "risk"
  | "transition"
  | "memory_node"
  | "global_understanding"
  | "reflective_capsule"
  | "cognitive_habit";

export type AttentionRole =
  | "goal"
  | "constraint"
  | "uncertainty"
  | "experience"
  | "challenge"
  | "transition"
  | "risk"
  | "exploration"
  | "reflection"
  | "dehabituation";

export type AttentionStatus =
  | "pinned"
  | "dominant"
  | "active"
  | "background"
  | "dormant"
  | "released";

export interface AttentionBudget {
  maxVisitedNodes: number;
  maxDepth: number;
  maxGeneratedViews: number;
  maxDurationMs: number;
}

export interface AttentionCandidate {
  id: string;
  targetType: AttentionTargetType;
  targetId: string;
  role: AttentionRole;
  reason: string;
  scope: MemoryScope;
  contextAnchorIds: string[];
  truthAnchorIds: string[];
  goalDependency: number;
  constraintImportance: number;
  uncertainty: number;
  novelty: number;
  risk: number;
  expectedInformationGain: number;
  predictiveValue: number;
  persistence: number;
  urgency: number;
  pinned?: boolean;
}

export interface AttentionFocus extends AttentionCandidate {
  weight: number;
  score: number;
  status: AttentionStatus;
  budget: AttentionBudget;
  independentSupportKeys: string[];
  independentChallengeKeys: string[];
  staleContextRevisions: number;
  createdAt: string;
  updatedAt: string;
}

export interface AttentionFeedback {
  id: string;
  focusId: string;
  effect: "reinforce" | "challenge" | "resolve" | "reactivate";
  magnitude: number;
  independenceKey: string;
  reason: string;
  contextRevision: number;
  observedAt: string;
}

export interface AttentionPortfolioPolicy {
  maxActiveFocuses: number;
  maxBackgroundFocuses: number;
  minimumWeight: number;
  dominantMinimumMargin: number;
  decayPerContextRevision: number;
  maxStaleContextRevisions: number;
  redundancyThreshold: number;
  minimumRoleCoverage: AttentionRole[];
  defaultBudget: AttentionBudget;
}

export type AttentionPortfolioPolicyOverrides = Partial<
  Omit<AttentionPortfolioPolicy, "defaultBudget" | "minimumRoleCoverage">
> & {
  defaultBudget?: Partial<AttentionBudget>;
  minimumRoleCoverage?: AttentionRole[];
};

export interface MemoryAttentionField {
  id: string;
  contextRevision: number;
  memoryRevision: number;
  truthRevision: number;
  cycle: number;
  dominantFocusId: string | null;
  activeFocusIds: string[];
  backgroundFocusIds: string[];
  focuses: AttentionFocus[];
  policy: AttentionPortfolioPolicy;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMemoryAttentionFieldInput {
  contextField: ContextField;
  epistemicCore: EpistemicCore;
  memoryRevision: number;
  candidates: AttentionCandidate[];
  policy?: AttentionPortfolioPolicyOverrides;
  createdAt?: string;
}

export interface AdvanceMemoryAttentionFieldInput {
  previous: MemoryAttentionField;
  contextField: ContextField;
  epistemicCore: EpistemicCore;
  memoryRevision: number;
  candidates: AttentionCandidate[];
  feedback: AttentionFeedback[];
  updatedAt?: string;
}

export interface AdvanceMemoryAttentionFieldResult {
  field: MemoryAttentionField;
  createdFocusIds: string[];
  mergedFocusIds: string[];
  releasedFocusIds: string[];
  reactivatedFocusIds: string[];
  roleCoverageGaps: AttentionRole[];
}
