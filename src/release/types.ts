import type {
  ContextFrame,
  ContextRetentionState,
} from "../contexts/types.js";
import type { SituationState } from "../situations/types.js";

export interface ContextTransferRecord {
  contractId: string | null;
  accumulatorId: string | null;
  capsuleId: string | null;
  transitionIds: string[];
  evidenceIds: string[];
  initialNeedPreserved: boolean;
  constraintsPreserved: boolean;
  decisionsPreserved: boolean;
  rejectedTrajectoriesPreserved: boolean;
  provenancePreserved: boolean;
  uncertaintyPreserved: boolean;
}

export interface ContextReleaseInput {
  frame: ContextFrame;
  targetState: Extract<
    ContextRetentionState,
    | "background"
    | "compacted"
    | "dormant"
    | "archived"
    | "eligible_for_deletion"
  >;
  situationState: SituationState;
  activeDependentIds: string[];
  transfer: ContextTransferRecord;
}

export interface ContextReleaseDecision {
  releasable: boolean;
  targetState: ContextReleaseInput["targetState"];
  reasons: string[];
  blockingConditions: string[];
  preservedIn: {
    contractId: string | null;
    accumulatorId: string | null;
    capsuleId: string | null;
    transitionIds: string[];
    evidenceIds: string[];
  };
}
