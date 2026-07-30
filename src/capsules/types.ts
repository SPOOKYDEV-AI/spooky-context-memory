import type {
  Condition,
  MemoryScope,
  TaskSignature,
} from "../domain/types.js";
import type { MemoryClaim } from "../claims/types.js";

export type ExecutionActor = "user" | "agent" | "tool" | "test";

export type ExecutionStepType =
  | "plan"
  | "decision"
  | "action"
  | "error"
  | "hypothesis"
  | "failed_attempt"
  | "diagnosis"
  | "resolution"
  | "validation";

export type ExecutionOutcome = "success" | "failure" | "unknown";

export interface ExecutionStep {
  id: string;
  type: ExecutionStepType;
  actor: ExecutionActor;
  description: string;
  timestamp: string;
  outcome?: ExecutionOutcome;
  errorCode?: string;
  relatedStepIds?: string[];
}

export type ValidationEvidenceType =
  | "unit_test"
  | "integration_test"
  | "build"
  | "static_analysis"
  | "security_check"
  | "manual_test"
  | "user_acceptance";

export interface ValidationEvidence {
  id: string;
  type: ValidationEvidenceType;
  description: string;
  passed: boolean;
  observedAt: string;
  sourceId?: string;
  environment?: Record<string, string>;
}

export interface CapsuleResolution {
  description: string;
  rationale: string;
  preserves: string[];
  tradeoffs: string[];
  risks: string[];
}

export interface CapsuleApplicability {
  requiredConditions: Condition[];
  exclusionConditions: Condition[];
  unknownConditions: Condition[];
  compatibleEnvironments: Record<string, string>[];
}

export interface ExecutionTrace {
  id: string;
  task: TaskSignature;
  scope: MemoryScope;
  startedAt: string;
  completedAt?: string;
  steps: ExecutionStep[];
  rootCause: string | null;
  resolution: CapsuleResolution;
  applicability: CapsuleApplicability;
  validationEvidence: ValidationEvidence[];
}

export interface CapsuleErrorRecord {
  stepId: string;
  actor: ExecutionActor;
  description: string;
  timestamp: string;
  errorCode?: string;
}

export interface CapsuleAttemptRecord {
  stepId: string;
  actor: ExecutionActor;
  description: string;
  timestamp: string;
}

export interface CapsuleDecisionRecord {
  stepId: string;
  actor: ExecutionActor;
  description: string;
  timestamp: string;
}

export interface CapsuleUserApprovalScope {
  outcomeAccepted: boolean;
  reusableAsMemory: boolean;
  rootCauseAccepted?: boolean;
  applicabilityAccepted?: boolean;
}

export interface CapsuleUserApproval {
  approved: boolean;
  approvedBy: string;
  approvedAt: string;
  comment?: string;
  scope?: CapsuleUserApprovalScope;
}

export type CapsuleStatus =
  | "candidate"
  | "active"
  | "stale"
  | "superseded"
  | "contradicted"
  | "quarantined";

export interface ExperienceCapsule {
  id: string;
  version: number;

  origin: {
    traceId: string;
    projectId?: string;
    workflowId?: string;
    taskId?: string;
    createdAt: string;
    createdBy: string;
  };

  initialNeed: {
    intent: string;
    target: string;
    expectedOutcome: string;
    operations: string[];
    constraints: string[];
    forbiddenEffects: string[];
    environment: Record<string, string>;
  };

  experience: {
    plans: CapsuleDecisionRecord[];
    decisions: CapsuleDecisionRecord[];
    errors: CapsuleErrorRecord[];
    failedAttempts: CapsuleAttemptRecord[];
    observedSymptoms: string[];
    rejectedHypotheses: CapsuleAttemptRecord[];
    rootCause: string | null;
  };

  resolution: CapsuleResolution;
  applicability: CapsuleApplicability;
  claims: MemoryClaim[];

  validation: {
    userApproval: CapsuleUserApproval | null;
    evidence: ValidationEvidence[];
    confidence: number;
    requirements: {
      userApprovalRequired: true;
      passingEvidenceRequired: true;
    };
  };

  lifecycle: {
    status: CapsuleStatus;
    activatedAt: string | null;
    supersededBy: string | null;
  };
}

export interface CompileCapsuleOptions {
  id?: string;
  createdAt?: string;
  createdBy: string;
  confidence?: number;
}

export interface CapsuleActivationPolicy {
  minimumPassingEvidence?: number;
  requireAllEvidenceToPass?: boolean;
}

export interface CapsuleActivationRequest {
  approval: CapsuleUserApproval;
  activatedAt?: string;
  policy?: CapsuleActivationPolicy;
}

export type CapsuleActivationFailureCode =
  | "CAPSULE_NOT_CANDIDATE"
  | "USER_APPROVAL_REQUIRED"
  | "USER_APPROVAL_METADATA_REQUIRED"
  | "USER_OUTCOME_ACCEPTANCE_REQUIRED"
  | "PASSING_EVIDENCE_REQUIRED"
  | "FAILED_EVIDENCE_PRESENT";

export interface CapsuleActivationDecision {
  allowed: boolean;
  failureCodes: CapsuleActivationFailureCode[];
  reasons: string[];
}
