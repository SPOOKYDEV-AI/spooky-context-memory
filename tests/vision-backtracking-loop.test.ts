import { describe, expect, it } from "vitest";
import {
  VisionCheckpointStore,
  VisionLoopGuard,
  advanceProgressiveVisionEnsemble,
  backtrackProgressiveVision,
  createProgressiveVisionEnsemble,
  type ContextField,
} from "../src/index.js";

const contextField: ContextField = {
  revision: 1,
  updatedAt: "2026-07-30T18:00:00.000Z",
  transitions: [],
  frames: [
    {
      id: "context-progressive",
      topic: "Progressive vision routing",
      intent: "route_progressive_memory",
      summary: "Keep local hypotheses and checkpoints.",
      scope: { projectId: "project-atlas" },
      activation: 1,
      relevance: 1,
      inertia: 0.8,
      activationState: "dominant",
      retentionState: "pinned",
      introducedAt: "2026-07-30T18:00:00.000Z",
      lastReactivatedAt: "2026-07-30T18:00:00.000Z",
      parentFrameIds: [],
      sourceTurnIds: ["turn-1"],
      protectedReasons: [],
    },
  ],
};

function ensemble() {
  return createProgressiveVisionEnsemble({
    task: {
      intent: "route_progressive_memory",
      target: "progressive visions",
      projectId: "project-atlas",
      expectedOutcome: "Backtrack without restarting from the graph root.",
      operations: ["explore", "checkpoint", "backtrack"],
      constraints: ["bounded_exploration"],
      forbiddenEffects: ["global_memory_replay"],
    },
    scope: { projectId: "project-atlas" },
    contextField,
    branches: [
      {
        id: "branch-progressive",
        path: "/project-atlas/vision/progressive",
        scope: { projectId: "project-atlas" },
        requiredConstraints: ["bounded_exploration"],
        predictedEffects: ["checkpointed_search"],
        patternIds: [],
        priorUtility: 0.9,
        evidenceConfidence: 0.88,
      },
    ],
    seeds: [
      {
        id: "seed-progressive",
        hypothesis: "A local memory branch can resolve the current unknown.",
        branchIds: ["branch-progressive"],
        contextAnchorIds: ["context-progressive"],
        unresolvedQuestions: ["Which node resolves the unknown?"],
        priorUtility: 0.9,
        noveltyScore: 0.7,
        scope: { projectId: "project-atlas" },
        sharedAcrossProjects: false,
      },
    ],
    memoryRevision: 3,
  });
}

describe("vision checkpoints and backtracking", () => {
  it("creates a checkpoint before applying deeper exploration", () => {
    const initial = ensemble();
    const vision = initial.visions[0]!;
    const advanced = advanceProgressiveVisionEnsemble({
      previous: initial,
      contextField: { ...contextField, revision: 2 },
      branches: [
        {
          id: "branch-progressive",
          path: "/project-atlas/vision/progressive",
          scope: { projectId: "project-atlas" },
          requiredConstraints: ["bounded_exploration"],
          predictedEffects: ["checkpointed_search"],
          patternIds: [],
          priorUtility: 0.9,
          evidenceConfidence: 0.88,
        },
      ],
      evidence: [],
      observations: [
        {
          visionId: vision.id,
          visitedNodeIds: ["node-a"],
          frontierNodeIds: ["node-b"],
          injectedItemIds: [],
          resolvedQuestions: [],
          depth: 2,
          utilityGain: 0.1,
          exhausted: false,
          createdAt: "2026-07-30T18:02:00.000Z",
        },
      ],
      newSeeds: [],
      memoryRevision: 4,
    });

    expect(advanced.checkpoints).toHaveLength(1);
    expect(advanced.checkpoints[0]?.visitedNodeIds).toEqual([]);
    expect(advanced.ensemble.visions[0]?.visitedNodeIds).toContain("node-a");
    expect(advanced.ensemble.visions[0]?.frontierNodeIds).toContain("node-b");
  });

  it("restores the previous frontier without replaying the whole search", () => {
    const initial = ensemble();
    const vision = initial.visions[0]!;
    const checkpoint = {
      id: "checkpoint-a",
      visionId: vision.id,
      contextRevision: 1,
      depth: 1,
      frontierNodeIds: ["node-alternative"],
      visitedNodeIds: ["node-root"],
      injectedItemIds: [],
      unresolvedQuestions: ["Which node resolves the unknown?"],
      score: vision.score,
      createdAt: "2026-07-30T18:01:00.000Z",
    };
    const restored = backtrackProgressiveVision(
      {
        ...vision,
        visitedNodeIds: ["node-root", "node-dead-end"],
        frontierNodeIds: [],
        status: "exhausted",
      },
      checkpoint,
      "2026-07-30T18:03:00.000Z",
    );

    expect(restored.visitedNodeIds).toEqual(["node-root"]);
    expect(restored.frontierNodeIds).toEqual(["node-alternative"]);
    expect(restored.status).toBe("exploring");
  });

  it("stores and retrieves the latest checkpoint per vision", () => {
    const store = new VisionCheckpointStore();
    const vision = ensemble().visions[0]!;
    const first = {
      id: "checkpoint-1",
      visionId: vision.id,
      contextRevision: 1,
      depth: 1,
      frontierNodeIds: ["node-a"],
      visitedNodeIds: [],
      injectedItemIds: [],
      unresolvedQuestions: [],
      score: 0.4,
      createdAt: "2026-07-30T18:01:00.000Z",
    };
    const second = {
      ...first,
      id: "checkpoint-2",
      depth: 2,
      createdAt: "2026-07-30T18:02:00.000Z",
    };

    store.save(first);
    store.save(second);

    expect(store.list(vision.id)).toHaveLength(2);
    expect(store.getLatest(vision.id)?.id).toBe("checkpoint-2");
    expect(store.deleteVision(vision.id)).toBe(2);
  });
});

describe("vision loop guard", () => {
  const state = {
    visionId: "vision-a",
    contextRevision: 2,
    contextFingerprint: "context-progressive",
    currentNodeId: "node-a",
    unresolvedQuestions: ["Why did the branch fail?"],
    constraints: ["bounded_exploration"],
    progressScore: 0.4,
    evidenceIds: ["evidence-a"],
  };

  it("allows one bounded revisit and then blocks a circular state", () => {
    const guard = new VisionLoopGuard({ maxRevisitsWithoutProgress: 1 });

    expect(guard.checkAndRecord(state).allowed).toBe(true);
    expect(guard.checkAndRecord(state).allowed).toBe(true);
    const blocked = guard.checkAndRecord(state);

    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain("without new evidence or progress");
  });

  it("allows revisiting the same state when new evidence appears", () => {
    const guard = new VisionLoopGuard({ maxRevisitsWithoutProgress: 0 });
    guard.checkAndRecord(state);
    const result = guard.checkAndRecord({
      ...state,
      evidenceIds: ["evidence-a", "evidence-b"],
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toContain("evidence changed");
  });

  it("treats a changed semantic context fingerprint as a new exploration state", () => {
    const guard = new VisionLoopGuard({ maxRevisitsWithoutProgress: 0 });
    guard.checkAndRecord(state);
    const result = guard.checkAndRecord({
      ...state,
      contextRevision: 3,
      contextFingerprint: "context-progressive-shifted",
    });

    expect(result.allowed).toBe(true);
    expect(result.repeatedWithoutProgress).toBe(0);
  });
});
