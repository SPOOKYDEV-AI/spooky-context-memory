import type { MemoryScope, TaskSignature } from "../domain/types.js";

export type VisionExclusionReason =
  | "scope_mismatch"
  | "forbidden_effect"
  | "known_failure"
  | "contradicted"
  | "already_exhausted"
  | "insufficient_evidence";

export interface VisionBranchCandidate {
  id: string;
  path: string;
  scope: MemoryScope;
  requiredConstraints: string[];
  predictedEffects: string[];
  patternIds: string[];
  priorUtility: number;
  evidenceConfidence: number;
  sharedAcrossProjects?: boolean;
  contradicted?: boolean;
}

export interface ExcludedVisionBranch {
  branchId: string;
  reason: VisionExclusionReason;
  explanation: string;
  reconsiderWhen: string[];
}

export type VisionFrontierState =
  | "queued"
  | "visited"
  | "pruned"
  | "deferred"
  | "exhausted";

export interface VisionFrontier {
  branchId: string;
  estimatedUtility: number;
  estimatedCost: number;
  uncertainty: number;
  state: VisionFrontierState;
}

export interface TraversalBudget {
  maxVisitedNodes: number;
  maxCandidateCapsules: number;
  maxInjectedCapsules: number;
  maxScopeDistance: number;
  maxUnknownConditions: number;
  maxDurationMs: number;
}

export interface MemoryVision {
  id: string;
  taskSignatureHash: string;
  memoryRevision: number;
  scope: MemoryScope;
  task: TaskSignature;
  anchors: string[];
  allowedBranchIds: string[];
  excludedBranches: ExcludedVisionBranch[];
  likelyPatternIds: string[];
  frontiers: VisionFrontier[];
  traversalBudget: TraversalBudget;
  confidence: number;
  createdAt: string;
}

export interface ResolveVisionInput {
  task: TaskSignature;
  scope: MemoryScope;
  branches: VisionBranchCandidate[];
  memoryRevision: number;
  budget?: Partial<TraversalBudget>;
  createdAt?: string;
}
