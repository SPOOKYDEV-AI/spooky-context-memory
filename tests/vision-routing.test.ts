import { describe, expect, it } from "vitest";
import {
  resolveMemoryVision,
  routeMemoryWithVision,
  updateBeliefs,
  type ResolveVisionInput,
} from "../src/index.js";

function visionInput(): ResolveVisionInput {
  return {
    task: {
      intent: "render_square",
      target: "square",
      projectId: "project-atlas",
      workflowId: "shape-rendering",
      expectedOutcome: "Render a shape with equal dimensions.",
      operations: ["render_shape"],
      constraints: ["equal_dimensions"],
      forbiddenEffects: ["non_equal_dimensions"],
      environment: { runtime: "browser" },
    },
    scope: {
      projectId: "project-atlas",
      workflowId: "shape-rendering",
    },
    branches: [
      {
        id: "branch-square",
        path: "/project-atlas/shape/square",
        scope: { projectId: "project-atlas" },
        requiredConstraints: ["equal_dimensions"],
        predictedEffects: [],
        patternIds: ["pattern-subtype-loss"],
        priorUtility: 0.95,
        evidenceConfidence: 0.9,
      },
      {
        id: "branch-generic-rectangle",
        path: "/project-atlas/shape/rectangle",
        scope: { projectId: "project-atlas" },
        requiredConstraints: [],
        predictedEffects: ["non_equal_dimensions"],
        patternIds: [],
        priorUtility: 0.8,
        evidenceConfidence: 0.8,
      },
      {
        id: "branch-other-project",
        path: "/project-aurora/shape",
        scope: { projectId: "project-aurora" },
        requiredConstraints: ["equal_dimensions"],
        predictedEffects: [],
        patternIds: [],
        priorUtility: 0.9,
        evidenceConfidence: 0.9,
      },
    ],
    memoryRevision: 4,
    createdAt: "2026-07-30T12:00:00.000Z",
  };
}

describe("memory visions", () => {
  it("prunes impossible branches before heuristic routing", () => {
    const vision = resolveMemoryVision(visionInput());

    expect(vision.allowedBranchIds).toContain("branch-square");
    expect(vision.excludedBranches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          branchId: "branch-generic-rectangle",
          reason: "forbidden_effect",
        }),
        expect.objectContaining({
          branchId: "branch-other-project",
          reason: "scope_mismatch",
        }),
      ]),
    );
  });

  it("uses A-star routing only inside the resolved vision", () => {
    const vision = resolveMemoryVision(visionInput());
    const result = routeMemoryWithVision({
      vision,
      startNodeIds: ["node-square", "node-rectangle"],
      nodes: [
        {
          id: "node-square",
          branchId: "branch-square",
          estimatedRelevance: 0.95,
          applicabilityConfidence: 0.9,
          contaminationRisk: 0.05,
          contradictionRisk: 0,
          unknownConditionCount: 0,
          evidenceStrength: 0.9,
        },
        {
          id: "node-rectangle",
          branchId: "branch-generic-rectangle",
          estimatedRelevance: 0.99,
          applicabilityConfidence: 0.95,
          contaminationRisk: 0.05,
          contradictionRisk: 0,
          unknownConditionCount: 0,
          evidenceStrength: 0.9,
        },
      ],
      edges: [],
    });

    expect(result.candidates.map((item) => item.nodeId)).toEqual([
      "node-square",
    ]);
    expect(result.prunedNodeIds).toContain("node-rectangle");
  });
});

describe("belief updates", () => {
  it("recalculates probabilities without double counting dependent evidence", () => {
    const [belief] = updateBeliefs(
      [{ id: "hypothesis-a", priorProbability: 0.4 }],
      [
        {
          hypothesisId: "hypothesis-a",
          independenceKey: "same-run",
          likelihoodRatio: 2,
          evidenceId: "evidence-weak",
        },
        {
          hypothesisId: "hypothesis-a",
          independenceKey: "same-run",
          likelihoodRatio: 4,
          evidenceId: "evidence-strong",
        },
        {
          hypothesisId: "hypothesis-a",
          independenceKey: "independent-run",
          likelihoodRatio: 3,
          evidenceId: "evidence-independent",
        },
      ],
    );

    expect(belief?.appliedEvidenceIds).toEqual(
      expect.arrayContaining(["evidence-strong", "evidence-independent"]),
    );
    expect(belief?.appliedEvidenceIds).not.toContain("evidence-weak");
    expect(belief?.posteriorProbability).toBeGreaterThan(0.8);
  });
});
