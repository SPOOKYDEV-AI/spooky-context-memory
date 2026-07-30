import type { MemoryScope } from "../domain/types.js";
import type { AttentionViewVerdict } from "../views/types.js";

export type PlasticMemoryRelation =
  | "supports"
  | "contradicts"
  | "extends"
  | "narrows"
  | "instance_of"
  | "caused_by"
  | "applicable_when"
  | "excluded_when"
  | "supersedes"
  | "enables_view"
  | "challenges_view";

export type PlasticMemoryLinkStatus =
  | "candidate"
  | "supported"
  | "verified"
  | "disputed"
  | "stale"
  | "superseded";

export interface PlasticMemoryLinkEvidence {
  id: string;
  effect: "supports" | "contradicts";
  weight: number;
  independenceKey: string;
  contextIds: string[];
  observedAt: string;
}

export interface PlasticMemoryLink {
  id: string;
  sourceId: string;
  targetId: string;
  relation: PlasticMemoryRelation;
  scope: MemoryScope;
  confidence: number;
  status: PlasticMemoryLinkStatus;
  supportEvidenceIds: string[];
  contradictionEvidenceIds: string[];
  contextAnchorIds: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlasticMemoryGraph {
  revision: number;
  links: PlasticMemoryLink[];
  evidence: PlasticMemoryLinkEvidence[];
  updatedAt: string;
}

export interface MemoryLinkObservation {
  sourceId: string;
  targetId: string;
  relation: PlasticMemoryRelation;
  scope: MemoryScope;
  effect: "supports" | "contradicts";
  weight: number;
  independenceKey: string;
  contextIds: string[];
  observedAt: string;
}

export type CapsuleRefinementAction =
  | "reinforce"
  | "narrow"
  | "split"
  | "extend"
  | "dispute"
  | "supersede"
  | "retain_raw_trace";

export interface CapsuleRefinementPlan {
  capsuleId: string;
  action: CapsuleRefinementAction;
  reason: string;
  supportingViewIds: string[];
  rejectedViewIds: string[];
  discriminators: string[];
  confidence: number;
}

export interface CapsuleOutcomeObservation {
  capsuleId: string;
  viewId: string;
  verdict: AttentionViewVerdict;
  independentContextKey: string;
  discriminators: string[];
  confidence: number;
}

export interface PlasticityUpdateResult {
  graph: PlasticMemoryGraph;
  createdLinkIds: string[];
  changedLinkIds: string[];
  disputedLinkIds: string[];
}
