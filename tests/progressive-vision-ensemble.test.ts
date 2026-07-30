import { describe, expect, it } from "vitest";
import {
  advanceProgressiveVisionEnsemble,
  createProgressiveVisionEnsemble,
  type ContextField,
  type ProgressiveVisionSeed,
  type VisionBranchCandidate,
} from "../src/index.js";

const task = {
  intent: "route_progressive_memory",
  target: "progressive vision ensemble",
  projectId: "project-atlas",
  workflowId: "memory-routing",
  expectedOutcome: "Explore several local hypotheses without circular retrieval.",
  operations: ["spawn_visions", "prune_visions", "backtrack"],
  constraints: ["preserve_initial_need", "bounded_exploration"],
  forbiddenEffects: ["cross_project_contamination", "global_memory_replay"],
};

const branches: VisionBranchCandidate[] = [
  {
    id: "branch-retention",
    path: "/project-atlas/context/retention",
    scope: { projectId: "project-atlas" },
    requiredConstraints: ["preserve_initial_need"],
    predictedEffects: ["safe_context_release"],
    patternIds: ["pattern-premature-drop"],
    priorUtility: 0.88,
    evidenceConfidence: 0.84,
  },
  {
    id: "branch-loop",
    path: "/project-atlas/vision/loop",
    scope: { projectId: "project-atlas" },
    requiredConstraints: ["bounded_exploration"],
    predictedEffects: ["loop_detection"],
    patternIds: ["pattern-circular-search"],
    priorUtility: 0.82,
    evidenceConfidence: 0.8,
  },
  {
    id: "branch-transition",
    path: "/project-atlas/context/transition",
    scope: { projectId: "project-atlas" },
    requiredConstraints: ["preserve_initial_need"],
    predictedEffects: ["transition_reconstruction"],
    patternIds: ["pattern-transition-loss"],
    priorUtility: 0.76,
    evidenceConfidence: 0.76,
  },
  {
    id: "branch-forbidden",
    path: "/project-atlas/global-replay",
    scope: { projectId: "project-atlas" },
    requiredConstraints: [],
    predictedEffects: ["global_memory_replay"],
    patternIds: [],
    priorUtility: 0.95,
    evidenceConfidence: 0.95,
  },
  {
    id: "branch-other-project",
    path: "/project-aurora/context",
    scope: { projectId: "project-aurora" },
    requiredConstraints: ["preserve_initial_need"],
    predictedEffects: [],
    patternIds: [],
    priorUtility: 0.92,
    evidenceConfidence: 0.9,
  },
];

function field(revision = 1): ContextField {
  return {
    revision,
    updatedAt: `2026-07-30T18:0${revision}:00.000Z`,
    transitions: [],
    frames: [
      {
        id: "context-memory-routing",
        topic: "Progressive memory routing",
        intent: "route_progressive_memory",
        summary: "Explore local memory hypotheses progressively.",
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
        protectedReasons: ["Preserve the initial routing need."],
      },
    ],
  };
}

function seed(
  id: string,
  hypothesis: string,
  branchIds: string[],
  priorUtility = 0.8,
): ProgressiveVisionSeed {
  return {
    id,
    hypothesis,
    branchIds,
    contextAnchorIds: ["context-memory-routing"],
    unresolvedQuestions: ["Which branch explains the current failure?"],
    priorUtility,
    noveltyScore: 0.65,
    scope: { projectId: "project-atlas" },
    sharedAcrossProjects: false,
  };
}

describe("progressive vision ensemble", () => {
  it("creates several local visions and selects exactly one dominant vision", () => {
    const ensemble = createProgressiveVisionEnsemble({
      task,
      scope: { projectId: "project-atlas" },
      contextField: field(),
      branches,
      seeds: [
        seed("seed-retention", "The initial context was released too early.", [
          "branch-retention",
        ]),
        seed("seed-loop", "The search is revisiting the same memory state.", [
          "branch-loop",
        ]),
      ],
      memoryRevision: 5,
      createdAt: "2026-07-30T18:00:00.000Z",
    });

    expect(ensemble.visions).toHaveLength(2);
    expect(ensemble.dominantVisionId).not.toBeNull();
    expect(
      ensemble.visions.filter((vision) => vision.status === "dominant"),
    ).toHaveLength(1);
    expect(ensemble.activeVisionIds.length).toBeGreaterThan(1);
  });

  it("hard-prunes forbidden and cross-project hypotheses before beam ranking", () => {
    const ensemble = createProgressiveVisionEnsemble({
      task,
      scope: { projectId: "project-atlas" },
      contextField: field(),
      branches,
      seeds: [
        seed("seed-forbidden", "Replay the complete memory globally.", [
          "branch-forbidden",
        ]),
        seed("seed-other", "Reuse the Aurora context directly.", [
          "branch-other-project",
        ]),
      ],
      memoryRevision: 5,
    });

    expect(ensemble.visions.every((vision) => vision.status === "pruned")).toBe(
      true,
    );
    expect(ensemble.dominantVisionId).toBeNull();
  });

  it("splits a broad vision into bounded micro-visions", () => {
    const ensemble = createProgressiveVisionEnsemble({
      task,
      scope: { projectId: "project-atlas" },
      contextField: field(),
      branches,
      seeds: [
        seed("seed-broad", "A broad context-management failure occurred.", [
          "branch-retention",
          "branch-loop",
          "branch-transition",
        ]),
      ],
      memoryRevision: 5,
      policy: { maxBranchesPerVision: 1 },
    });

    expect(ensemble.visions).toHaveLength(3);
    expect(ensemble.visions.every((vision) => vision.branchIds.length === 1)).toBe(
      true,
    );
    expect(
      ensemble.visions.every((vision) => vision.parentVisionId !== null),
    ).toBe(true);
  });

  it("prunes a vision after its context anchor remains stale beyond policy", () => {
    const initial = createProgressiveVisionEnsemble({
      task,
      scope: { projectId: "project-atlas" },
      contextField: field(),
      branches,
      seeds: [
        seed("seed-retention", "The initial context was released too early.", [
          "branch-retention",
        ]),
      ],
      memoryRevision: 5,
      policy: { maxStaleContextRevisions: 0 },
    });
    const shifted: ContextField = {
      revision: 2,
      updatedAt: "2026-07-30T18:02:00.000Z",
      transitions: [],
      frames: [
        {
          ...field().frames[0]!,
          activation: 0,
          relevance: 0,
          activationState: "dormant",
          retentionState: "dormant",
        },
        {
          ...field().frames[0]!,
          id: "context-new-phase",
          topic: "A different phase",
          activationState: "dominant",
          retentionState: "active",
        },
      ],
    };
    const advanced = advanceProgressiveVisionEnsemble({
      previous: initial,
      contextField: shifted,
      branches,
      evidence: [],
      observations: [],
      newSeeds: [],
      memoryRevision: 6,
    });

    expect(advanced.prunedVisionIds).toContain(initial.visions[0]!.id);
    expect(advanced.ensemble.visions[0]?.status).toBe("pruned");
  });

  it("merges equivalent micro-visions instead of exploring duplicates", () => {
    const initial = createProgressiveVisionEnsemble({
      task,
      scope: { projectId: "project-atlas" },
      contextField: field(),
      branches,
      seeds: [
        seed("seed-retention-a", "The initial context was released too early.", [
          "branch-retention",
        ]),
      ],
      memoryRevision: 5,
    });
    const advanced = advanceProgressiveVisionEnsemble({
      previous: initial,
      contextField: field(2),
      branches,
      evidence: [],
      observations: [],
      newSeeds: [
        seed("seed-retention-b", "The initial context was released too early.", [
          "branch-retention",
        ]),
      ],
      memoryRevision: 6,
    });

    expect(advanced.ensemble.visions).toHaveLength(1);
    expect(advanced.mergedVisionIds).toHaveLength(1);
    expect(advanced.ensemble.visions[0]?.mergedFromVisionIds).toHaveLength(1);
  });

  it("changes the dominant vision when new evidence contradicts the old leader", () => {
    const initial = createProgressiveVisionEnsemble({
      task,
      scope: { projectId: "project-atlas" },
      contextField: field(),
      branches,
      seeds: [
        seed(
          "seed-retention",
          "The initial context was released too early.",
          ["branch-retention"],
          0.86,
        ),
        seed(
          "seed-loop",
          "The search is revisiting the same memory state.",
          ["branch-loop"],
          0.84,
        ),
      ],
      memoryRevision: 5,
    });
    const oldDominant = initial.dominantVisionId!;
    const alternative = initial.visions.find((vision) => vision.id !== oldDominant)!;
    const advanced = advanceProgressiveVisionEnsemble({
      previous: initial,
      contextField: field(2),
      branches,
      evidence: [
        {
          id: "evidence-contradiction",
          visionId: oldDominant,
          kind: "contradiction",
          weight: 0.72,
          independenceKey: "validation-a",
          contextRevision: 2,
        },
        {
          id: "evidence-support",
          visionId: alternative.id,
          kind: "support",
          weight: 0.88,
          independenceKey: "validation-b",
          contextRevision: 2,
        },
      ],
      observations: [],
      newSeeds: [],
      memoryRevision: 6,
    });

    expect(advanced.ensemble.dominantVisionId).toBe(alternative.id);
  });
});
