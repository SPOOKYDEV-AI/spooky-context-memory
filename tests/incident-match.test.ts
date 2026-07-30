import { describe, expect, it } from "vitest";
import {
  matchIncident,
  type IncidentMemory,
  type TaskSignature,
} from "../src/index.js";

const incident: IncidentMemory = {
  id: "scalar-result",
  originalTask: {
    intent: "uninstall_runtime",
    target: "runtime",
    projectId: "atlas",
    workflowId: "uninstall",
    expectedOutcome: "Remove zero, one, or many runtimes.",
    operations: ["discover", "remove"],
    constraints: ["uniform_collection_handling"],
    forbiddenEffects: ["remove_unrelated_runtime"],
  },
  triggerConditions: {
    required: [
      {
        field: "constraints",
        operator: "contains",
        value: "uniform_collection_handling",
      },
    ],
    optional: [],
    absent: [],
  },
  symptoms: ["Count property is missing"],
  rootCause: "Scalar result.",
  failedAttempts: [],
  resolution: {
    description: "Normalize to array.",
    preserves: [],
    introduces: [],
    risks: [],
  },
  applicability: {
    appliesWhen: [
      {
        field: "workflowId",
        operator: "equals",
        value: "uninstall",
      },
    ],
    doesNotApplyWhen: [
      {
        field: "constraints",
        operator: "contains",
        value: "single_item_only",
      },
    ],
    unknownWhen: [],
  },
  validationEvidence: ["Regression test"],
  status: "resolved",
};

function makeTask(
  overrides: Partial<TaskSignature> = {},
): TaskSignature {
  return {
    intent: "uninstall_runtime",
    target: "runtime",
    projectId: "atlas",
    workflowId: "uninstall",
    expectedOutcome: "Remove every runtime.",
    operations: ["discover", "remove"],
    constraints: ["uniform_collection_handling"],
    forbiddenEffects: ["remove_unrelated_runtime"],
    observedSymptoms: ["Count property is missing"],
    ...overrides,
  };
}

describe("matchIncident", () => {
  it("marks an incident applicable when scope and conditions match", () => {
    const result = matchIncident(incident, makeTask());

    expect(result.usage).toBe("applicable");
    expect(result.activeExclusions).toEqual([]);
  });

  it("does not apply the fix when an exclusion is active", () => {
    const result = matchIncident(
      incident,
      makeTask({
        constraints: [
          "uniform_collection_handling",
          "single_item_only",
        ],
      }),
    );

    expect(result.usage).toBe("out_of_scope");
    expect(result.activeExclusions).toContain("constraints");
  });

  it("uses a similar incident only as a diagnostic reference", () => {
    const result = matchIncident(
      incident,
      makeTask({
        intent: "display_runtime",
        expectedOutcome: "Display one runtime.",
        operations: ["discover", "display"],
      }),
    );

    expect(result.usage).toBe("diagnostic_reference");
  });
});
