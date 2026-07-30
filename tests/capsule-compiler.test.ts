import { describe, expect, it } from "vitest";
import {
  CapsuleActivationError,
  CapsuleCompilationError,
  activateCapsule,
  compileCapsuleCandidate,
  evaluateCapsuleActivation,
  type ExecutionTrace,
} from "../src/index.js";

function makeTrace(overrides: Partial<ExecutionTrace> = {}): ExecutionTrace {
  return {
    id: "trace-asr-uninstall-001",
    task: {
      intent: "uninstall_project_runtime",
      target: "ASR runtime",
      projectId: "asr",
      workflowId: "uninstall",
      expectedOutcome: "Remove zero, one, or many ASR runtimes safely.",
      operations: ["discover_runtime", "remove_runtime"],
      constraints: ["powershell_5_1_compatible"],
      forbiddenEffects: ["remove_unrelated_runtime"],
      environment: {
        shell: "PowerShell",
        shellVersion: "5.1",
      },
      observedSymptoms: ["Count property is missing"],
    },
    scope: {
      projectId: "asr",
      workflowId: "uninstall",
      taskId: "task-001",
    },
    startedAt: "2026-07-30T10:00:00.000Z",
    completedAt: "2026-07-30T10:30:00.000Z",
    steps: [
      {
        id: "step-plan",
        type: "plan",
        actor: "agent",
        description: "Discover runtimes and remove project-owned entries.",
        timestamp: "2026-07-30T10:01:00.000Z",
      },
      {
        id: "step-error",
        type: "error",
        actor: "tool",
        description: "Count property is missing",
        timestamp: "2026-07-30T10:05:00.000Z",
        outcome: "failure",
        errorCode: "PROPERTY_NOT_FOUND",
      },
      {
        id: "step-attempt",
        type: "failed_attempt",
        actor: "agent",
        description: "Assume every command result is already a collection.",
        timestamp: "2026-07-30T10:08:00.000Z",
        outcome: "failure",
      },
      {
        id: "step-hypothesis",
        type: "hypothesis",
        actor: "agent",
        description: "The runtime query always returns null.",
        timestamp: "2026-07-30T10:10:00.000Z",
        outcome: "failure",
      },
      {
        id: "step-decision",
        type: "decision",
        actor: "user",
        description: "Keep data deletion explicit and optional.",
        timestamp: "2026-07-30T10:15:00.000Z",
      },
    ],
    rootCause: "A single PowerShell result was returned as a scalar.",
    resolution: {
      description: "Normalize the runtime query result to an array.",
      rationale:
        "The consumer must handle zero, one, or many results uniformly.",
      preserves: ["explicit data deletion", "unrelated runtime isolation"],
      tradeoffs: ["one normalization allocation"],
      risks: ["redundant when the producer already guarantees arrays"],
    },
    applicability: {
      requiredConditions: [
        {
          field: "workflowId",
          operator: "equals",
          value: "uninstall",
        },
      ],
      exclusionConditions: [
        {
          field: "constraints",
          operator: "contains",
          value: "already_normalized_to_array",
        },
      ],
      unknownConditions: [],
      compatibleEnvironments: [
        {
          shell: "PowerShell",
          shellVersion: "5.1",
        },
      ],
    },
    validationEvidence: [
      {
        id: "test-zero-one-many",
        type: "unit_test",
        description: "Zero, one, and many runtime results are supported.",
        passed: true,
        observedAt: "2026-07-30T10:25:00.000Z",
      },
    ],
    ...overrides,
  };
}

describe("compileCapsuleCandidate", () => {
  it("always compiles an execution trace as a candidate capsule", () => {
    const capsule = compileCapsuleCandidate(makeTrace(), {
      createdBy: "SPOOKYDEV-AI",
      createdAt: "2026-07-30T10:31:00.000Z",
      confidence: 0.9,
    });

    expect(capsule.lifecycle.status).toBe("candidate");
    expect(capsule.lifecycle.activatedAt).toBeNull();
    expect(capsule.validation.userApproval).toBeNull();
    expect(capsule.validation.requirements).toEqual({
      userApprovalRequired: true,
      passingEvidenceRequired: true,
    });
  });

  it("preserves the initial need, errors, failed attempts and rationale", () => {
    const capsule = compileCapsuleCandidate(makeTrace(), {
      createdBy: "SPOOKYDEV-AI",
    });

    expect(capsule.initialNeed.expectedOutcome).toContain("zero, one, or many");
    expect(capsule.experience.errors[0]?.errorCode).toBe("PROPERTY_NOT_FOUND");
    expect(capsule.experience.failedAttempts).toHaveLength(1);
    expect(capsule.experience.rejectedHypotheses).toHaveLength(1);
    expect(capsule.experience.rootCause).toContain("scalar");
    expect(capsule.resolution.rationale).toContain("uniformly");
    expect(capsule.applicability.exclusionConditions).toHaveLength(1);
    expect(capsule.origin.projectId).toBe("asr");
    expect(capsule.origin.workflowId).toBe("uninstall");
  });

  it("rejects an incomplete trace instead of inventing knowledge", () => {
    expect(() =>
      compileCapsuleCandidate(
        makeTrace({
          rootCause: "",
        }),
        { createdBy: "SPOOKYDEV-AI" },
      ),
    ).toThrow(CapsuleCompilationError);
  });
});

describe("capsule activation", () => {
  it("rejects activation without explicit user approval", () => {
    const capsule = compileCapsuleCandidate(makeTrace(), {
      createdBy: "SPOOKYDEV-AI",
    });

    const decision = evaluateCapsuleActivation(capsule, {
      approval: {
        approved: false,
        approvedBy: "François",
        approvedAt: "2026-07-30T10:32:00.000Z",
      },
    });

    expect(decision.allowed).toBe(false);
    expect(decision.failureCodes).toContain("USER_APPROVAL_REQUIRED");
  });

  it("rejects activation without passing validation evidence", () => {
    const capsule = compileCapsuleCandidate(
      makeTrace({ validationEvidence: [] }),
      { createdBy: "SPOOKYDEV-AI" },
    );

    expect(() =>
      activateCapsule(capsule, {
        approval: {
          approved: true,
          approvedBy: "François",
          approvedAt: "2026-07-30T10:32:00.000Z",
        },
      }),
    ).toThrow(CapsuleActivationError);
  });

  it("activates only after user approval and passing evidence", () => {
    const candidate = compileCapsuleCandidate(makeTrace(), {
      createdBy: "SPOOKYDEV-AI",
    });

    const active = activateCapsule(candidate, {
      approval: {
        approved: true,
        approvedBy: "François",
        approvedAt: "2026-07-30T10:32:00.000Z",
        comment: "The correction matches the initial need.",
      },
      activatedAt: "2026-07-30T10:33:00.000Z",
    });

    expect(active.lifecycle.status).toBe("active");
    expect(active.lifecycle.activatedAt).toBe("2026-07-30T10:33:00.000Z");
    expect(active.validation.userApproval?.approvedBy).toBe("François");
    expect(candidate.lifecycle.status).toBe("candidate");
  });
});
