import { describe, expect, it } from "vitest";
import {
  createEmptyContextField,
  reconstructMemoryContext,
  resolveMemoryVision,
  updateContextField,
  updateMemoryVision,
  type VisionBranchCandidate,
} from "../src/index.js";

const task = {
  intent: "retain_initial_context",
  target: "context controller",
  projectId: "project-atlas",
  workflowId: "context-flow",
  expectedOutcome: "Release context only after safe transfer.",
  operations: ["track_context", "compact_context", "release_context"],
  constraints: ["preserve_initial_need"],
  forbiddenEffects: ["silent_context_loss"],
};

const branches: VisionBranchCandidate[] = [
  {
    id: "branch-retention",
    path: "/project-atlas/context/retention",
    scope: { projectId: "project-atlas" },
    requiredConstraints: ["preserve_initial_need"],
    predictedEffects: ["safe_compaction"],
    patternIds: ["pattern-premature-drop"],
    priorUtility: 0.9,
    evidenceConfidence: 0.85,
  },
  {
    id: "branch-unrelated",
    path: "/project-aurora/deployment",
    scope: { projectId: "project-aurora" },
    requiredConstraints: [],
    predictedEffects: [],
    patternIds: [],
    priorUtility: 0.8,
    evidenceConfidence: 0.8,
  },
];

describe("selective reconstruction", () => {
  it("reconstructs a compact current memory without raw transcript injection", () => {
    const first = updateContextField(
      createEmptyContextField("2026-07-30T17:00:00.000Z"),
      {
        topic: "Context retention",
        intent: "retain_initial_context",
        summary: "Keep the initial need across all phases.",
        scope: { projectId: "project-atlas" },
        turnId: "turn-1",
        observedAt: "2026-07-30T17:00:00.000Z",
      },
    ).field;
    const second = updateContextField(first, {
      topic: "Capsule transfer",
      intent: "compact_context",
      scope: { projectId: "project-atlas" },
      turnId: "turn-2",
      observedAt: "2026-07-30T17:01:00.000Z",
      explicitShift: true,
      bridge: "Retention rules led to capsule transfer.",
    }).field;
    const transition = second.transitions[0]!;
    const result = reconstructMemoryContext({
      task,
      contexts: second.frames,
      transitions: second.transitions,
      capsuleInputs: [],
      patternInputs: [],
      fromContextId: transition.fromContextId,
      toContextId: transition.toContextId,
      maxCharacters: 700,
    });

    expect(result.mustPreserve).toContain("preserve_initial_need");
    expect(result.transitionPath[0]).toContain("capsule transfer");
    expect(result.compiledText.length).toBeLessThanOrEqual(700);
    expect(result.compiledText).not.toContain(JSON.stringify(second));
  });
});

describe("incremental Vision update", () => {
  it("reevaluates only affected branches and preserves the rest", () => {
    const vision = resolveMemoryVision({
      task,
      scope: { projectId: "project-atlas" },
      branches,
      memoryRevision: 3,
      createdAt: "2026-07-30T17:00:00.000Z",
    });
    const contextField = updateContextField(
      createEmptyContextField("2026-07-30T17:00:00.000Z"),
      {
        topic: "Context retention",
        intent: "retain_initial_context",
        scope: { projectId: "project-atlas" },
        turnId: "turn-1",
        observedAt: "2026-07-30T17:00:00.000Z",
      },
    ).field;
    const updatedBranches = branches.map((branch) =>
      branch.id === "branch-retention"
        ? { ...branch, priorUtility: 0.96 }
        : branch,
    );
    const updated = updateMemoryVision({
      previous: vision,
      contextField,
      branches: updatedBranches,
      affectedBranchIds: ["branch-retention"],
      memoryRevision: 4,
      createdAt: "2026-07-30T17:02:00.000Z",
    });

    expect(updated.reevaluatedBranchIds).toEqual(["branch-retention"]);
    expect(updated.preservedBranchIds).toContain("branch-unrelated");
    expect(updated.vision.memoryRevision).toBe(4);
    expect(updated.vision.anchors).toContain(contextField.frames[0]!.id);
  });

  it("keeps hard-excluded branches excluded without global rescoring", () => {
    const vision = resolveMemoryVision({
      task,
      scope: { projectId: "project-atlas" },
      branches,
      memoryRevision: 3,
    });
    expect(vision.excludedBranches.map((item) => item.branchId)).toContain(
      "branch-unrelated",
    );
  });
});
