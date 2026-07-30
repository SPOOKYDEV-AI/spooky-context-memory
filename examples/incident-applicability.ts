import {
  matchIncident,
  type IncidentMemory,
  type TaskSignature,
} from "../src/index.js";

const incident: IncidentMemory = {
  id: "powershell-scalar-count",
  originalTask: {
    intent: "uninstall_project_runtime",
    target: "Atlas runtime",
    projectId: "atlas",
    workflowId: "uninstall",
    expectedOutcome: "Remove zero, one, or many project runtimes safely.",
    operations: ["discover_runtime", "remove_runtime"],
    constraints: ["powershell_5_1_compatible"],
    forbiddenEffects: ["remove_unrelated_runtime"],
    environment: {
      shell: "PowerShell",
      shellVersion: "5.1",
    },
  },
  triggerConditions: {
    required: [
      {
        field: "environment.returnShape",
        operator: "equals",
        value: "scalar",
      },
      {
        field: "constraints",
        operator: "contains",
        value: "uniform_collection_handling",
      },
    ],
    optional: [],
    absent: [
      {
        field: "constraints",
        operator: "contains",
        value: "already_normalized_to_array",
      },
    ],
  },
  symptoms: ["Count property is missing"],
  rootCause: "A single PowerShell result was returned as a scalar.",
  failedAttempts: ["Assumed every command result was already a collection."],
  resolution: {
    description: "Normalize the result to an array before reading Count.",
    preserves: ["zero-one-many behavior", "explicit data deletion"],
    introduces: ["uniform collection shape"],
    risks: ["may be redundant when the producer already guarantees arrays"],
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
  validationEvidence: [
    "Verified for zero, one, and multiple runtime results.",
  ],
  status: "resolved",
};

const currentTask: TaskSignature = {
  intent: "uninstall_project_runtime",
  target: "Atlas runtime",
  projectId: "atlas",
  workflowId: "uninstall",
  expectedOutcome: "Remove every Atlas runtime found.",
  operations: ["discover_runtime", "remove_runtime"],
  constraints: [
    "powershell_5_1_compatible",
    "uniform_collection_handling",
  ],
  forbiddenEffects: ["remove_unrelated_runtime"],
  environment: {
    shell: "PowerShell",
    shellVersion: "5.1",
    returnShape: "scalar",
  },
  observedSymptoms: ["Count property is missing"],
};

console.log(matchIncident(incident, currentTask));
