import { describe, expect, it } from "vitest";
import {
  createEpistemicCore,
  createMemoryAttentionField,
  generateAndTriageAttentionViews,
  type AttentionCandidate,
  type AttentionViewProposal,
  type ContextField,
  type VisionBranchCandidate,
} from "../src/index.js";

const contextField: ContextField = {
  revision: 1,
  updatedAt: "2026-07-30T18:00:00.000Z",
  transitions: [],
  frames: [
    {
      id: "context-routing",
      topic: "Attention-driven memory routing",
      intent: "route_views",
      summary: "Compare multiple memory interpretations.",
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
      protectedReasons: ["Preserve the current routing goal."],
    },
  ],
};

const source = {
  id: "source-spec",
  type: "documentation" as const,
  trust: 0.95,
  independenceKey: "spec-v1",
  observedAt: "2026-07-30T18:00:00.000Z",
};
const epistemicCore = createEpistemicCore(
  [
    {
      id: "truth-no-global-replay",
      statement: "Raw global transcript replay is forbidden.",
      state: "authoritative",
      scope: { projectId: "project-atlas" },
      sourceIds: [source.id],
      confidence: 0.99,
      validFrom: "2026-07-30T18:00:00.000Z",
    },
  ],
  [source],
  "2026-07-30T18:00:00.000Z",
);

function attention(
  id: string,
  role: AttentionCandidate["role"],
): AttentionCandidate {
  return {
    id,
    targetType:
      role === "goal"
        ? "goal"
        : role === "constraint"
          ? "constraint"
          : role === "uncertainty"
            ? "unknown"
            : role === "challenge"
              ? "contradiction"
              : "pattern",
    targetId: id,
    role,
    reason: `Observe ${id}.`,
    scope: { projectId: "project-atlas" },
    contextAnchorIds: ["context-routing"],
    truthAnchorIds:
      role === "constraint" ? ["truth-no-global-replay"] : [],
    goalDependency: role === "goal" ? 1 : 0.5,
    constraintImportance: role === "constraint" ? 1 : 0.5,
    uncertainty: role === "uncertainty" ? 1 : 0.4,
    novelty: 0.65,
    risk: role === "challenge" ? 0.8 : 0.5,
    expectedInformationGain: 0.75,
    predictiveValue: 0.65,
    persistence: 0.6,
    urgency: 0.6,
  };
}

const attentionField = createMemoryAttentionField({
  contextField,
  epistemicCore,
  memoryRevision: 4,
  candidates: [
    attention("focus-goal", "goal"),
    attention("focus-constraint", "constraint"),
    attention("focus-unknown", "uncertainty"),
    attention("focus-experience", "experience"),
    attention("focus-challenge", "challenge"),
  ],
});

const task = {
  intent: "route_views",
  target: "memory search",
  projectId: "project-atlas",
  expectedOutcome: "Select precise local memory paths.",
  operations: ["generate_views", "triage_views"],
  constraints: ["preserve_goal", "bounded_exploration"],
  forbiddenEffects: ["global_memory_replay"],
};

const branches: VisionBranchCandidate[] = [
  {
    id: "branch-context-loss",
    path: "/project-atlas/context-loss",
    scope: { projectId: "project-atlas" },
    requiredConstraints: ["preserve_goal"],
    predictedEffects: ["restore_context"],
    patternIds: ["pattern-context-loss"],
    priorUtility: 0.86,
    evidenceConfidence: 0.8,
  },
  {
    id: "branch-loop",
    path: "/project-atlas/loop",
    scope: { projectId: "project-atlas" },
    requiredConstraints: ["bounded_exploration"],
    predictedEffects: ["detect_loop"],
    patternIds: ["pattern-loop"],
    priorUtility: 0.8,
    evidenceConfidence: 0.78,
  },
  {
    id: "branch-global-replay",
    path: "/project-atlas/global-replay",
    scope: { projectId: "project-atlas" },
    requiredConstraints: [],
    predictedEffects: ["global_memory_replay"],
    patternIds: [],
    priorUtility: 0.99,
    evidenceConfidence: 0.99,
  },
  {
    id: "branch-other-project",
    path: "/project-aurora/context",
    scope: { projectId: "project-aurora" },
    requiredConstraints: ["preserve_goal"],
    predictedEffects: [],
    patternIds: [],
    priorUtility: 0.9,
    evidenceConfidence: 0.9,
  },
];

function proposal(
  id: string,
  hypothesis: string,
  branchIds: string[],
  attentionIds: string[],
  overrides: Partial<AttentionViewProposal> = {},
): AttentionViewProposal {
  return {
    id,
    hypothesis,
    attentionIds,
    truthAnchorIds: [],
    assumptionIds: [],
    branchIds,
    questionsCovered: ["Which mechanism explains the current failure?"],
    conclusions: [
      {
        key: "mechanism",
        statement: hypothesis,
        confidence: 0.75,
      },
    ],
    scope: { projectId: "project-atlas" },
    sharedAcrossProjects: false,
    priorUtility: 0.78,
    noveltyScore: 0.65,
    expectedCost: 0.2,
    riskIfWrong: 0.35,
    ...overrides,
  };
}

describe("attention View generation and triage", () => {
  it("hard-prunes a View whose only branch causes a forbidden effect", () => {
    const result = generateAndTriageAttentionViews({
      task,
      scope: { projectId: "project-atlas" },
      attentionField,
      epistemicCore,
      branches,
      proposals: [
        proposal(
          "view-global",
          "Replay the entire memory.",
          ["branch-global-replay"],
          ["focus-goal"],
        ),
      ],
    });

    expect(result.views[0]?.status).toBe("ineligible");
    expect(result.generatedProgressiveVisionSeeds).toHaveLength(0);
  });

  it("rejects a View that claims dependency on a missing truth anchor", () => {
    const result = generateAndTriageAttentionViews({
      task,
      scope: { projectId: "project-atlas" },
      attentionField,
      epistemicCore,
      branches,
      proposals: [
        proposal(
          "view-missing-truth",
          "Use an undocumented project fact.",
          ["branch-context-loss"],
          ["focus-constraint"],
          { truthAnchorIds: ["truth-that-does-not-exist"] },
        ),
      ],
    });

    expect(result.views[0]?.status).toBe("ineligible");
    expect(result.rejectedTraces[0]?.verdict).toBe("truth_conflict");
  });

  it("keeps several plausible Views while allowing only one defeasible dominant View", () => {
    const result = generateAndTriageAttentionViews({
      task,
      scope: { projectId: "project-atlas" },
      attentionField,
      epistemicCore,
      branches,
      proposals: [
        proposal(
          "view-context-loss",
          "The initial context was released too early.",
          ["branch-context-loss"],
          ["focus-goal", "focus-constraint", "focus-experience"],
          { priorUtility: 0.9 },
        ),
        proposal(
          "view-loop",
          "The search is circling around the same frontier.",
          ["branch-loop"],
          ["focus-unknown", "focus-challenge"],
          { priorUtility: 0.75 },
        ),
      ],
    });

    expect(result.activeViewIds.length).toBeGreaterThanOrEqual(2);
    expect(result.dominantViewId).not.toBeNull();
    expect(result.views.filter((view) => view.status === "dominant")).toHaveLength(1);
  });

  it("merges equivalent Views and preserves a compact rejected redundancy trace", () => {
    const result = generateAndTriageAttentionViews({
      task,
      scope: { projectId: "project-atlas" },
      attentionField,
      epistemicCore,
      branches,
      proposals: [
        proposal(
          "view-context-a",
          "The initial context was released too early.",
          ["branch-context-loss"],
          ["focus-goal", "focus-experience"],
        ),
        proposal(
          "view-context-b",
          "The initial context was released too early.",
          ["branch-context-loss"],
          ["focus-goal", "focus-experience"],
        ),
      ],
    });

    expect(result.views.filter((view) => view.status === "redundant")).toHaveLength(1);
    expect(result.rejectedTraces.some((trace) => trace.verdict === "redundant")).toBe(true);
    expect(result.generatedProgressiveVisionSeeds).toHaveLength(1);
  });

  it("extracts consensus and divergence instead of hiding uncertainty", () => {
    const result = generateAndTriageAttentionViews({
      task,
      scope: { projectId: "project-atlas" },
      attentionField,
      epistemicCore,
      branches,
      proposals: [
        proposal(
          "view-a",
          "Context loss is the primary mechanism.",
          ["branch-context-loss"],
          ["focus-goal", "focus-constraint"],
          {
            conclusions: [
              { key: "preserve", statement: "Preserve the initial need.", confidence: 0.9 },
              { key: "cause", statement: "Context was dropped early.", confidence: 0.75 },
            ],
          },
        ),
        proposal(
          "view-b",
          "A loop is the primary mechanism.",
          ["branch-loop"],
          ["focus-unknown", "focus-challenge"],
          {
            conclusions: [
              { key: "preserve", statement: "Preserve the initial need.", confidence: 0.85 },
              { key: "cause", statement: "Search revisited the same state.", confidence: 0.72 },
            ],
          },
        ),
      ],
      policy: { dominanceMargin: 0.5 },
    });

    expect(result.consensus.consensus.some((item) => item.key === "preserve")).toBe(true);
    expect(result.consensus.divergences.some((item) => item.key === "cause")).toBe(true);
  });

  it("allows many cheap candidate Views but only promotes bounded progressive seeds", () => {
    const proposals = Array.from({ length: 9 }, (_, index) =>
      proposal(
        `view-${index}`,
        `Hypothesis ${index}`,
        [index % 2 === 0 ? "branch-context-loss" : "branch-loop"],
        [index % 2 === 0 ? "focus-goal" : "focus-unknown"],
        { priorUtility: Math.max(0.2, 0.9 - index * 0.06) },
      ),
    );
    const result = generateAndTriageAttentionViews({
      task,
      scope: { projectId: "project-atlas" },
      attentionField,
      epistemicCore,
      branches,
      proposals,
      policy: { maxActiveViews: 3, maxDeferredViews: 2 },
    });

    expect(result.views).toHaveLength(9);
    expect(result.activeViewIds.length).toBeLessThanOrEqual(3);
    expect(result.deferredViewIds.length).toBeLessThanOrEqual(2);
    expect(result.generatedProgressiveVisionSeeds.length).toBeLessThanOrEqual(5);
  });
});
