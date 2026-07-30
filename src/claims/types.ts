export type MemoryClaimKind =
  | "observation"
  | "outcome_fit"
  | "hypothesis"
  | "root_cause"
  | "resolution"
  | "applicability"
  | "user_preference";

export type MemoryClaimStatus =
  | "unverified"
  | "supported"
  | "verified"
  | "disputed"
  | "refuted"
  | "stale";

export type ClaimEvidenceEffect = "supports" | "contradicts";

export interface ClaimEvidenceLink {
  evidenceId: string;
  effect: ClaimEvidenceEffect;
  weight: number;
  independenceKey: string;
}

export interface MemoryClaim {
  id: string;
  kind: MemoryClaimKind;
  statement: string;
  status: MemoryClaimStatus;
  confidence: number;
  assertedBy: string;
  assertedAt: string;
  derivedFromAttemptIds: string[];
  evidence: ClaimEvidenceLink[];
}

export interface ClaimEvaluation {
  claimId: string;
  status: MemoryClaimStatus;
  confidence: number;
  supportScore: number;
  contradictionScore: number;
  independentSupportCount: number;
  independentContradictionCount: number;
  reasons: string[];
}
