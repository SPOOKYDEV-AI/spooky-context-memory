import {
  activateCapsule,
  compileCapsuleCandidate,
  type ExecutionTrace,
} from "../src/index.js";

const trace: ExecutionTrace = {
  id: "trace-runtime-uninstall",
  task: {
    intent: "uninstall_project_runtime",
    target: "Atlas runtime",
    projectId: "atlas",
    workflowId: "uninstall",
    expectedOutcome: "Remove zero, one, or many Atlas runtimes safely.",
    operations: ["discover_runtime", "remove_runtime"],
    constraints: ["powershell_5_1_compatible"],
    forbiddenEffects: ["remove_unrelated_runtime"],
    observedSymptoms: ["Count property is missing"],
  },
  scope: {
    projectId: "atlas",
    workflowId: "uninstall",
  },
  startedAt: "2026-07-30T10:00:00.000Z",
  steps: [
    {
      id: "error-1",
      type: "error",
      actor: "tool",
      description: "Count property is missing",
      timestamp: "2026-07-30T10:05:00.000Z",
      outcome: "failure",
    },
    {
      id: "failed-attempt-1",
      type: "failed_attempt",
      actor: "agent",
      description: "Assume the query result is always a collection.",
      timestamp: "2026-07-30T10:08:00.000Z",
      outcome: "failure",
    },
  ],
  rootCause: "PowerShell returns a scalar when only one object is found.",
  resolution: {
    description: "Normalize the result before collection operations.",
    rationale: "The workflow must support zero, one, or many results.",
    preserves: ["explicit data deletion", "runtime isolation"],
    tradeoffs: ["small normalization allocation"],
    risks: ["redundant if the producer already guarantees an array"],
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
      id: "regression-zero-one-many",
      type: "unit_test",
      description: "Regression suite covers zero, one, and many results.",
      passed: true,
      observedAt: "2026-07-30T10:25:00.000Z",
    },
  ],
};

const candidate = compileCapsuleCandidate(trace, {
  createdBy: "SPOOKYDEV-AI",
  confidence: 0.9,
});

console.log(candidate.lifecycle.status); // candidate

const active = activateCapsule(candidate, {
  approval: {
    approved: true,
    approvedBy: "maintainer",
    approvedAt: "2026-07-30T10:30:00.000Z",
    comment: "The final result matches the requested outcome.",
    scope: {
      outcomeAccepted: true,
      reusableAsMemory: true,
    },
  },
});

console.log(active.lifecycle.status); // active
