import { describe, expect, it } from "vitest";
import {
  activateCapsule,
  assertPublicData,
  buildMemoryPreflight,
  compileCapsuleCandidate,
  compilePreflightContext,
  createPatternCandidate,
  type ExecutionTrace,
} from "../src/index.js";

function activeCapsule() {
  const trace: ExecutionTrace = {
    id: "trace-square",
    task: {
      intent: "render_square",
      target: "square",
      projectId: "project-atlas",
      workflowId: "shape-rendering",
      expectedOutcome: "Render a square.",
      operations: ["render_shape"],
      constraints: ["equal_dimensions"],
      forbiddenEffects: ["non_equal_dimensions"],
      observedSymptoms: ["A generic rectangle was produced."],
    },
    scope: { projectId: "project-atlas", workflowId: "shape-rendering" },
    startedAt: "2026-07-30T12:00:00.000Z",
    steps: [
      {
        id: "failed-rectangle",
        type: "failed_attempt",
        actor: "agent",
        description: "Render an arbitrary rectangle.",
        timestamp: "2026-07-30T12:01:00.000Z",
        outcome: "failure",
      },
    ],
    rootCause: "The requested subtype was generalized to its parent type.",
    resolution: {
      description: "Preserve equal dimensions.",
      rationale: "Equal dimensions distinguish the requested square.",
      preserves: ["equal width and height"],
      tradeoffs: [],
      risks: [],
    },
    applicability: {
      requiredConditions: [],
      exclusionConditions: [],
      unknownConditions: [
        { field: "requestedSideLength", operator: "exists" },
      ],
      compatibleEnvironments: [],
    },
    validationEvidence: [
      {
        id: "test-equal-dimensions",
        type: "manual_test",
        description: "The accepted shape has equal dimensions.",
        passed: true,
        observedAt: "2026-07-30T12:05:00.000Z",
      },
    ],
  };
  const candidate = compileCapsuleCandidate(trace, {
    createdBy: "maintainer",
    createdAt: "2026-07-30T12:06:00.000Z",
    confidence: 0.8,
  });

  return activateCapsule(candidate, {
    approval: {
      approved: true,
      approvedBy: "maintainer",
      approvedAt: "2026-07-30T12:07:00.000Z",
      scope: {
        outcomeAccepted: true,
        reusableAsMemory: true,
      },
    },
    activatedAt: "2026-07-30T12:08:00.000Z",
  });
}

describe("memory preflight", () => {
  it("injects a minimal preventive contract rather than full capsules", () => {
    const capsule = activeCapsule();
    const pattern = createPatternCandidate(
      {
        reasoningFailures: ["Generalize a subtype into its parent type."],
        triggeringSignals: ["specific subtype request"],
        lostOrRequiredConstraints: ["discriminating property"],
        predictedConsequences: ["valid parent, invalid subtype"],
        resolutionPrinciples: ["preserve discriminating property"],
        scopeKeys: [],
      },
      {
        name: "Subtype generalization",
        checks: ["Identify the discriminating property before acting."],
        mustPreserve: ["The subtype's discriminating property."],
        prohibitedShortcuts: ["Do not replace the subtype with its parent."],
      },
    );
    pattern.lifecycle.status = "active";

    const preflight = buildMemoryPreflight({
      task: {
        intent: "render_square",
        target: "square",
        expectedOutcome: "Render a square.",
        operations: ["render_shape"],
        constraints: ["equal_dimensions"],
        forbiddenEffects: ["non_equal_dimensions"],
      },
      capsules: [
        {
          capsule,
          usage: "applicable",
          applicabilityConfidence: 0.9,
        },
      ],
      patterns: [{ pattern, confidence: 0.85 }],
      maxItemsPerSection: 3,
    });
    const context = compilePreflightContext(preflight, {
      maxCharacters: 900,
    });

    expect(preflight.mustPreserve).toContain("equal width and height");
    expect(preflight.prunedApproaches).toContain(
      "Render an arbitrary rectangle.",
    );
    expect(context).toContain("Memory Preflight");
    expect(context.length).toBeLessThanOrEqual(900);
    expect(context).not.toContain(JSON.stringify(capsule));
  });
});

describe("public data boundary", () => {
  it("rejects fixtures containing caller-defined private markers", () => {
    expect(() =>
      assertPublicData(
        { projectId: "customer-internal-project" },
        {
          forbiddenIdentifiers: ["customer-internal"],
          forbiddenPathFragments: ["C:\\PrivateWorkspace"],
        },
      ),
    ).toThrow(/private markers/i);
  });
});
