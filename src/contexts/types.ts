import type { MemoryScope } from "../domain/types.js";

export type ContextActivationState =
  | "dominant"
  | "overlapping"
  | "background"
  | "dormant";

export type ContextRetentionState =
  | "pinned"
  | "active"
  | "background"
  | "compacted"
  | "dormant"
  | "archived"
  | "eligible_for_deletion";

export type ContextTransitionTrigger =
  | "continuation"
  | "explicit_topic_change"
  | "association"
  | "clarification"
  | "digression"
  | "return_to_previous"
  | "new_event"
  | "unknown";

export type ContextFailurePattern =
  | "context_bleed"
  | "premature_context_drop"
  | "false_continuity"
  | "stale_reactivation"
  | "transition_loss";

export interface ContextFrame {
  id: string;
  topic: string;
  intent: string | null;
  summary: string;
  scope: MemoryScope;
  activation: number;
  relevance: number;
  inertia: number;
  activationState: ContextActivationState;
  retentionState: ContextRetentionState;
  introducedAt: string;
  lastReactivatedAt: string;
  parentFrameIds: string[];
  sourceTurnIds: string[];
  protectedReasons: string[];
}

export interface ContextTransition {
  id: string;
  fromContextId: string;
  toContextId: string;
  trigger: ContextTransitionTrigger;
  bridge: string;
  confidence: number;
  createdAt: string;
}

export interface ContextField {
  frames: ContextFrame[];
  transitions: ContextTransition[];
  revision: number;
  updatedAt: string;
}

export interface ContextSignal {
  topic: string;
  intent?: string;
  summary?: string;
  scope: MemoryScope;
  turnId: string;
  observedAt: string;
  explicitShift?: boolean;
  returnToContextId?: string;
  relatedContextIds?: string[];
  relevance?: number;
  transitionTrigger?: ContextTransitionTrigger;
  bridge?: string;
}

export interface ContextFlowPolicy {
  continuationThreshold: number;
  overlapThreshold: number;
  activationBoost: number;
  explicitShiftBoost: number;
  decayRate: number;
  backgroundThreshold: number;
  dormantThreshold: number;
  minimumPinnedActivation: number;
  maxNonDormantFrames: number;
}

export type ContextShiftKind =
  | "continuation"
  | "overlap"
  | "new_context"
  | "return_to_previous";

export interface ContextShiftAssessment {
  kind: ContextShiftKind;
  matchedContextId: string | null;
  similarity: number;
  reasons: string[];
}

export interface ContextFlowUpdate {
  field: ContextField;
  dominantContextId: string | null;
  changedFrameIds: string[];
  deactivatedFrameIds: string[];
  createdContextId: string | null;
  shift: ContextShiftAssessment;
}

export interface ContextRetentionSignals {
  goalDependency: number;
  constraintImportance: number;
  unresolvedDependency: number;
  discriminatingPower: number;
  validationImportance: number;
  reuseValue: number;
  redundancy: number;
  resolutionCompleteness: number;
}

export interface ContextRetentionAssessment {
  score: number;
  recommendedState: ContextRetentionState;
  reasons: string[];
}
