import type { MemoryClaim } from "../claims/types.js";

export type CapsuleAccumulatorStatus =
  | "open"
  | "ready"
  | "blocked"
  | "sealed";

export interface CapsuleAccumulator {
  id: string;
  situationId: string;
  initialNeed: string | null;
  observations: string[];
  rejectedTrajectories: string[];
  acceptedDecisions: string[];
  unresolvedItems: string[];
  claims: MemoryClaim[];
  evidenceIds: string[];
  sourceContextIds: string[];
  sourceTransitionIds: string[];
  completeness: number;
  stability: number;
  reusableValue: number;
  status: CapsuleAccumulatorStatus;
  createdAt: string;
  updatedAt: string;
  sealedAt: string | null;
}

export type CapsuleDeposit =
  | {
      kind: "initial_need";
      value: string;
      observedAt: string;
    }
  | {
      kind:
        | "observation"
        | "rejected_trajectory"
        | "accepted_decision"
        | "unresolved_item";
      value: string;
      observedAt: string;
    }
  | {
      kind: "claim";
      claim: MemoryClaim;
      observedAt: string;
    }
  | {
      kind:
        | "evidence"
        | "source_context"
        | "source_transition";
      referenceId: string;
      observedAt: string;
    };

export interface CapsuleAccumulatorAssessment {
  completeness: number;
  stability: number;
  reusableValue: number;
  recommendedStatus: Exclude<CapsuleAccumulatorStatus, "sealed">;
  blockingReasons: string[];
}
