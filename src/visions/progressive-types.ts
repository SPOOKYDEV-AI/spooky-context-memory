import type { ContextField } from "../contexts/types.js";
import type { MemoryScope, TaskSignature } from "../domain/types.js";
import type { MemoryVision, TraversalBudget, VisionBranchCandidate } from "./types.js";

export type ProgressiveVisionStatus =
  | "candidate"
  | "exploring"
  | "dominant"
  | "deferred"
  | "pruned"
  | "exhausted"
  | "superseded";

export type ProgressiveVisionEvidenceKind =
  | "support"
  | "contradiction"
  | "novelty";

export interface ProgressiveVisionSeed {
  id: string;
  hypothesis: string;
  branchIds: string[];
  contextAnchorIds: string[];
  unresolvedQuestions: string[];
  priorUtility: number;
  noveltyScore: number;
  scope: MemoryScope;
  sharedAcrossProjects: boolean;
}

export interface ProgressiveVisionEvidence {
  id: string;
  visionId: string;
  kind: ProgressiveVisionEvidenceKind;
  weight: number;
  independenceKey: string;
  contextRevision: number;
}

export interface VisionExplorationObservation {
  visionId: string;
  visitedNodeIds: string[];
  frontierNodeIds: string[];
  injectedItemIds: string[];
  resolvedQuestions: string[];
  depth: number;
  utilityGain: number;
  exhausted: boolean;
  createdAt: string;
}

export interface ProgressiveVisionBudget {
  maxVisitedNodes: number;
  maxDepth: number;
  maxInjectedItems: number;
  maxDurationMs: number;
}

export interface ProgressiveVision {
  id: string;
  seedId: string;
  hypothesis: string;
  parentVisionId: string | null;
  mergedFromVisionIds: string[];
  contextRevision: number;
  memoryRevision: number;
  scope: MemoryScope;
  sharedAcrossProjects: boolean;
  contextAnchorIds: string[];
  branchIds: string[];
  unresolvedQuestions: string[];
  visitedNodeIds: string[];
  frontierNodeIds: string[];
  injectedItemIds: string[];
  checkpointIds: string[];
  supportingEvidenceIds: string[];
  contradictionIds: string[];
  priorUtility: number;
  supportScore: number;
  contradictionScore: number;
  noveltyScore: number;
  coverageScore: number;
  costPenalty: number;
  score: number;
  staleContextRevisions: number;
  status: ProgressiveVisionStatus;
  budget: ProgressiveVisionBudget;
  memoryVision: MemoryVision;
  createdAt: string;
  updatedAt: string;
}

export interface VisionCheckpoint {
  id: string;
  visionId: string;
  contextRevision: number;
  depth: number;
  frontierNodeIds: string[];
  visitedNodeIds: string[];
  injectedItemIds: string[];
  unresolvedQuestions: string[];
  score: number;
  createdAt: string;
}

export interface ProgressiveVisionEnsemblePolicy {
  maxActiveVisions: number;
  maxDeferredVisions: number;
  maxBranchesPerVision: number;
  maxStaleContextRevisions: number;
  contradictionPruneThreshold: number;
  minimumActiveScore: number;
  dominanceMargin: number;
  minimumLoopProgress: number;
  maxRevisitsWithoutProgress: number;
  defaultVisionBudget: ProgressiveVisionBudget;
  baseTraversalBudget: TraversalBudget;
}

export type ProgressiveVisionEnsemblePolicyOverrides = Partial<
  Omit<
    ProgressiveVisionEnsemblePolicy,
    "defaultVisionBudget" | "baseTraversalBudget"
  >
> & {
  defaultVisionBudget?: Partial<ProgressiveVisionBudget>;
  baseTraversalBudget?: Partial<TraversalBudget>;
};

export interface ProgressiveVisionEnsemble {
  id: string;
  task: TaskSignature;
  scope: MemoryScope;
  contextRevision: number;
  memoryRevision: number;
  cycle: number;
  dominantVisionId: string | null;
  activeVisionIds: string[];
  deferredVisionIds: string[];
  visions: ProgressiveVision[];
  policy: ProgressiveVisionEnsemblePolicy;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProgressiveVisionEnsembleInput {
  task: TaskSignature;
  scope: MemoryScope;
  contextField: ContextField;
  branches: VisionBranchCandidate[];
  seeds: ProgressiveVisionSeed[];
  memoryRevision: number;
  policy?: ProgressiveVisionEnsemblePolicyOverrides;
  createdAt?: string;
}

export interface AdvanceProgressiveVisionEnsembleInput {
  previous: ProgressiveVisionEnsemble;
  contextField: ContextField;
  branches: VisionBranchCandidate[];
  evidence: ProgressiveVisionEvidence[];
  observations: VisionExplorationObservation[];
  newSeeds: ProgressiveVisionSeed[];
  memoryRevision: number;
  task?: TaskSignature;
  updatedAt?: string;
}

export interface AdvanceProgressiveVisionEnsembleResult {
  ensemble: ProgressiveVisionEnsemble;
  checkpoints: VisionCheckpoint[];
  spawnedVisionIds: string[];
  splitVisionIds: string[];
  mergedVisionIds: string[];
  supersededVisionIds: string[];
  prunedVisionIds: string[];
  backtrackEligibleVisionIds: string[];
}

export interface VisionLoopCheckInput {
  visionId: string;
  contextRevision: number;
  contextFingerprint: string | null;
  currentNodeId: string | null;
  unresolvedQuestions: string[];
  constraints: string[];
  progressScore: number;
  evidenceIds: string[];
}

export interface VisionLoopCheckResult {
  allowed: boolean;
  signature: string;
  repeatedWithoutProgress: number;
  reason: string;
}
