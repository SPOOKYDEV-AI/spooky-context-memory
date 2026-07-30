import type { MemoryScope, SourceType } from "../domain/types.js";

export type EpistemicState =
  | "authoritative"
  | "verified"
  | "supported"
  | "observed"
  | "inferred"
  | "hypothetical"
  | "disputed"
  | "refuted"
  | "unknown";

export type TruthAnchorStatus =
  | "active"
  | "superseded"
  | "stale"
  | "revoked";

export interface TruthAnchorSource {
  id: string;
  type: SourceType;
  trust: number;
  independenceKey: string;
  observedAt: string;
}

export interface TruthAnchor {
  id: string;
  statement: string;
  state: EpistemicState;
  status: TruthAnchorStatus;
  scope: MemoryScope;
  sourceIds: string[];
  confidence: number;
  revision: number;
  validFrom: string;
  validUntil: string | null;
  supersededById: string | null;
  contradictionIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EpistemicCore {
  revision: number;
  anchors: TruthAnchor[];
  sources: TruthAnchorSource[];
  updatedAt: string;
}

export interface TruthAnchorInput {
  id?: string;
  statement: string;
  state: EpistemicState;
  scope: MemoryScope;
  sourceIds: string[];
  confidence: number;
  validFrom: string;
  validUntil?: string | null;
}

export type TruthChallengeKind =
  | "supports"
  | "contradicts"
  | "supersedes"
  | "marks_stale";

export interface TruthChallenge {
  id: string;
  anchorId: string;
  kind: TruthChallengeKind;
  sourceIds: string[];
  weight: number;
  independenceKey: string;
  reason: string;
  observedAt: string;
  replacement?: TruthAnchorInput;
}

export interface TruthChallengeDecision {
  accepted: boolean;
  anchorId: string;
  resultingState: EpistemicState;
  resultingStatus: TruthAnchorStatus;
  confidence: number;
  createdAnchorId: string | null;
  reasons: string[];
}
