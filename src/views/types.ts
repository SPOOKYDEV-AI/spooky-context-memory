import type { MemoryAttentionField } from "../attention/types.js";
import type { MemoryScope, TaskSignature } from "../domain/types.js";
import type { EpistemicCore } from "../epistemic/types.js";
import type { ProgressiveVisionSeed } from "../visions/progressive-types.js";
import type { VisionBranchCandidate } from "../visions/types.js";

export type AttentionViewStatus =
  | "candidate"
  | "ineligible"
  | "promising"
  | "dominant"
  | "deferred"
  | "contradicted"
  | "redundant"
  | "exhausted"
  | "superseded";

export type AttentionViewVerdict =
  | "supported"
  | "partially_supported"
  | "contradicted"
  | "context_mismatch"
  | "scope_mismatch"
  | "truth_conflict"
  | "missing_evidence"
  | "superseded"
  | "redundant"
  | "unresolved";

export interface ViewAssertion {
  key: string;
  statement: string;
  confidence: number;
}

export interface AttentionViewProposal {
  id: string;
  hypothesis: string;
  attentionIds: string[];
  truthAnchorIds: string[];
  assumptionIds: string[];
  branchIds: string[];
  questionsCovered: string[];
  conclusions: ViewAssertion[];
  scope: MemoryScope;
  sharedAcrossProjects: boolean;
  priorUtility: number;
  noveltyScore: number;
  expectedCost: number;
  riskIfWrong: number;
}

export interface AttentionViewEvidence {
  id: string;
  viewId: string;
  effect: "supports" | "contradicts";
  weight: number;
  independenceKey: string;
  observedAt: string;
}

export interface AttentionView extends AttentionViewProposal {
  contextRevision: number;
  memoryRevision: number;
  truthRevision: number;
  eligibleBranchIds: string[];
  supportScore: number;
  contradictionScore: number;
  attentionCoverageScore: number;
  questionCoverageScore: number;
  truthConsistencyScore: number;
  costPenalty: number;
  score: number;
  status: AttentionViewStatus;
  rejectionReasons: string[];
  progressiveVisionSeed: ProgressiveVisionSeed | null;
  createdAt: string;
  updatedAt: string;
}

export interface RejectedViewTrace {
  id: string;
  signature: string;
  viewId: string;
  attentionAnchorIds: string[];
  contextFingerprint: string;
  verdict: AttentionViewVerdict;
  rejectionReasons: string[];
  violatedConstraintIds: string[];
  contradictionIds: string[];
  reusableDiscriminators: string[];
  revisitConditions: string[];
  occurrences: number;
  firstObservedAt: string;
  lastObservedAt: string;
}

export interface RejectedViewLedger {
  traces: RejectedViewTrace[];
  revision: number;
  updatedAt: string;
}

export interface ViewTriagePolicy {
  maxActiveViews: number;
  maxDeferredViews: number;
  minimumPromisingScore: number;
  contradictionThreshold: number;
  truthConflictThreshold: number;
  redundancyThreshold: number;
  dominanceMargin: number;
  minimumAttentionCoverage: number;
}

export type ViewTriagePolicyOverrides = Partial<ViewTriagePolicy>;

export interface CrossViewConsensus {
  consensus: ViewAssertion[];
  divergences: Array<{
    key: string;
    alternatives: ViewAssertion[];
    viewIds: string[];
  }>;
  coverageGaps: string[];
  commonAttentionIds: string[];
  commonBranchIds: string[];
}

export interface CrossViewTriageResult {
  views: AttentionView[];
  dominantViewId: string | null;
  activeViewIds: string[];
  deferredViewIds: string[];
  rejectedTraces: RejectedViewTrace[];
  consensus: CrossViewConsensus;
  generatedProgressiveVisionSeeds: ProgressiveVisionSeed[];
}

export interface GenerateAttentionViewsInput {
  task: TaskSignature;
  scope: MemoryScope;
  attentionField: MemoryAttentionField;
  epistemicCore: EpistemicCore;
  branches: VisionBranchCandidate[];
  proposals: AttentionViewProposal[];
  evidence?: AttentionViewEvidence[];
  policy?: ViewTriagePolicyOverrides;
  generatedAt?: string;
}

export interface RecordRejectedViewInput {
  ledger: RejectedViewLedger;
  view: AttentionView;
  verdict: AttentionViewVerdict;
  contextFingerprint: string;
  violatedConstraintIds?: string[];
  contradictionIds?: string[];
  reusableDiscriminators?: string[];
  revisitConditions?: string[];
  observedAt?: string;
}

export interface RevisitRejectedViewInput {
  ledger: RejectedViewLedger;
  signature: string;
  contextFingerprint: string;
  satisfiedConditions: string[];
}

export interface RevisitRejectedViewDecision {
  allowed: boolean;
  traceId: string | null;
  reason: string;
}
