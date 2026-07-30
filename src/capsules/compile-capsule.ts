import { clonePlainData } from "../utils/clone-plain-data.js";
import type {
  CapsuleAttemptRecord,
  CapsuleDecisionRecord,
  CapsuleErrorRecord,
  CompileCapsuleOptions,
  ExecutionStep,
  ExecutionTrace,
  ExperienceCapsule,
} from "./types.js";

export class CapsuleCompilationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CapsuleCompilationError";
  }
}

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new CapsuleCompilationError(`${field} must not be empty.`);
  }

  return normalized;
}

function clampConfidence(value: number | undefined): number {
  if (value === undefined) {
    return 0.5;
  }

  return Math.max(0, Math.min(1, value));
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "experience";
}

function buildCapsuleId(trace: ExecutionTrace): string {
  return `${slugify(trace.task.intent)}-${slugify(trace.id)}`;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLowerCase();

    if (normalized.length === 0 || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function toDecisionRecord(step: ExecutionStep): CapsuleDecisionRecord {
  return {
    stepId: step.id,
    actor: step.actor,
    description: step.description.trim(),
    timestamp: step.timestamp,
  };
}

function toAttemptRecord(step: ExecutionStep): CapsuleAttemptRecord {
  return {
    stepId: step.id,
    actor: step.actor,
    description: step.description.trim(),
    timestamp: step.timestamp,
  };
}

function toErrorRecord(step: ExecutionStep): CapsuleErrorRecord {
  const record: CapsuleErrorRecord = {
    stepId: step.id,
    actor: step.actor,
    description: step.description.trim(),
    timestamp: step.timestamp,
  };

  if (step.errorCode) {
    record.errorCode = step.errorCode;
  }

  return record;
}

function validateTrace(trace: ExecutionTrace): void {
  requireNonEmpty(trace.id, "trace.id");
  requireNonEmpty(trace.task.intent, "trace.task.intent");
  requireNonEmpty(trace.task.target, "trace.task.target");
  requireNonEmpty(trace.task.expectedOutcome, "trace.task.expectedOutcome");
  requireNonEmpty(trace.rootCause, "trace.rootCause");
  requireNonEmpty(trace.resolution.description, "trace.resolution.description");
  requireNonEmpty(trace.resolution.rationale, "trace.resolution.rationale");

  const stepIds = new Set<string>();

  for (const step of trace.steps) {
    requireNonEmpty(step.id, "trace.steps[].id");
    requireNonEmpty(step.description, `trace.steps[${step.id}].description`);

    if (stepIds.has(step.id)) {
      throw new CapsuleCompilationError(
        `Execution step id "${step.id}" is duplicated.`,
      );
    }

    stepIds.add(step.id);
  }
}

export function compileCapsuleCandidate(
  trace: ExecutionTrace,
  options: CompileCapsuleOptions,
): ExperienceCapsule {
  validateTrace(trace);
  requireNonEmpty(options.createdBy, "options.createdBy");

  const errors = trace.steps
    .filter((step) => step.type === "error")
    .map(toErrorRecord);

  const failedAttempts = trace.steps
    .filter(
      (step) =>
        step.type === "failed_attempt" ||
        (step.type === "action" && step.outcome === "failure"),
    )
    .map(toAttemptRecord);

  const rejectedHypotheses = trace.steps
    .filter(
      (step) => step.type === "hypothesis" && step.outcome === "failure",
    )
    .map(toAttemptRecord);

  const capsule: ExperienceCapsule = {
    id: options.id?.trim() || buildCapsuleId(trace),
    version: 1,
    origin: {
      traceId: trace.id,
      createdAt: options.createdAt ?? new Date().toISOString(),
      createdBy: options.createdBy.trim(),
    },
    initialNeed: {
      intent: trace.task.intent.trim(),
      target: trace.task.target.trim(),
      expectedOutcome: trace.task.expectedOutcome.trim(),
      operations: uniqueStrings(trace.task.operations),
      constraints: uniqueStrings(trace.task.constraints),
      forbiddenEffects: uniqueStrings(trace.task.forbiddenEffects),
      environment: clonePlainData(trace.task.environment ?? {}),
    },
    experience: {
      plans: trace.steps
        .filter((step) => step.type === "plan")
        .map(toDecisionRecord),
      decisions: trace.steps
        .filter((step) => step.type === "decision")
        .map(toDecisionRecord),
      errors,
      failedAttempts,
      observedSymptoms: uniqueStrings([
        ...(trace.task.observedSymptoms ?? []),
        ...errors.map((error) => error.description),
      ]),
      rejectedHypotheses,
      rootCause: trace.rootCause.trim(),
    },
    resolution: {
      description: trace.resolution.description.trim(),
      rationale: trace.resolution.rationale.trim(),
      preserves: uniqueStrings(trace.resolution.preserves),
      tradeoffs: uniqueStrings(trace.resolution.tradeoffs),
      risks: uniqueStrings(trace.resolution.risks),
    },
    applicability: clonePlainData(trace.applicability),
    validation: {
      userApproval: null,
      evidence: clonePlainData(trace.validationEvidence),
      confidence: clampConfidence(options.confidence),
      requirements: {
        userApprovalRequired: true,
        passingEvidenceRequired: true,
      },
    },
    lifecycle: {
      status: "candidate",
      activatedAt: null,
      supersededBy: null,
    },
  };

  if (trace.scope.projectId) {
    capsule.origin.projectId = trace.scope.projectId;
  } else if (trace.task.projectId) {
    capsule.origin.projectId = trace.task.projectId;
  }

  if (trace.scope.workflowId) {
    capsule.origin.workflowId = trace.scope.workflowId;
  } else if (trace.task.workflowId) {
    capsule.origin.workflowId = trace.task.workflowId;
  }

  if (trace.scope.taskId) {
    capsule.origin.taskId = trace.scope.taskId;
  }

  return capsule;
}
