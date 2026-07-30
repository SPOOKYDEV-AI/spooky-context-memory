import { describe, expect, it } from "vitest";
import {
  applyRetroactiveLearning,
  canRevisitRejectedView,
  createEpistemicCore,
  createMemoryAttentionField,
  createPlasticMemoryGraph,
  createRejectedViewLedger,
  deriveCapsuleRefinementPlans,
  generateAndTriageAttentionViews,
  recordRejectedView,
  updatePlasticMemoryGraph,
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
      id: "context-retroaction",
      topic: "Retroactive learning",
      intent: "learn_from_view_outcome",
      summary: "Use View outcomes to change future retrieval.",
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
      protectedReasons: ["Preserve the learning objective."],
    },
  ],
};
const epistemicCore = createEpistemicCore([], [], "2026-07-30T18:00:00.000Z");

function focus(id: string, role: AttentionCandidate["role"]): AttentionCandidate {
  return {
    id,
    targetType: role === "goal" ? "goal" : role === "experience" ? "pattern" : "unknown",
    targetId: id,
    role,
    reason: `Observe ${id}.`,
    scope: { projectId: "project-atlas" },
    contextAnchorIds: ["context-retroaction"],
    truthAnchorIds: [],
    goalDependency: role === "goal" ? 1 : 0.5,
    constraintImportance: 0.6,
    uncertainty: role === "uncertainty" ? 1 : 0.4,
    novelty: 0.6,
    risk: 0.5,
    expectedInformationGain: 0.75,
    predictiveValue: 0.7,
    persistence: 0.6,
    urgency: 0.6,
  };
}

const attentionField = createMemoryAttentionField({
  contextField,
  epistemicCore,
  memoryRevision: 1,
  candidates: [
    focus("focus-goal", "goal"),
    focus("focus-experience", "experience"),
    focus("focus-unknown", "uncertainty"),
  ],
  policy: { minimumRoleCoverage: [] },
});
const task = {
  intent: "learn_from_view_outcome",
  target: "retroactive memory",
  projectId: "project-atlas",
  expectedOutcome: "Update attention and memory links from outcomes.",
  operations: ["evaluate_view", "apply_feedback"],
  constraints: ["preserve_learning_signal"],
  forbiddenEffects: ["global_memory_replay"],
};
const branches: VisionBranchCandidate[] = [
  {
    id: "branch-pattern",
    path: "/project-atlas/pattern",
    scope: { projectId: "project-atlas" },
    requiredConstraints: ["preserve_learning_signal"],
    predictedEffects: ["reuse_pattern"],
    patternIds: ["pattern-1"],
    priorUtility: 0.8,
    evidenceConfidence: 0.8,
  },
];
const proposal: AttentionViewProposal = {
  id: "view-pattern",
  hypothesis: "The historical pattern applies to the current situation.",
  attentionIds: ["focus-goal", "focus-experience"],
  truthAnchorIds: [],
  assumptionIds: ["assumption-same-mechanism"],
  branchIds: ["branch-pattern"],
  questionsCovered: ["Does the old pattern really apply?"],
  conclusions: [
    {
      key: "mechanism",
      statement: "Reuse the historical pattern.",
      confidence: 0.78,
    },
  ],
  scope: { projectId: "project-atlas" },
  sharedAcrossProjects: false,
  priorUtility: 0.82,
  noveltyScore: 0.55,
  expectedCost: 0.2,
  riskIfWrong: 0.55,
};
const triage = generateAndTriageAttentionViews({
  task,
  scope: { projectId: "project-atlas" },
  attentionField,
  epistemicCore,
  branches,
  proposals: [proposal],
});

describe("retroactive memory loop", () => {
  it("reinforces the attentions that produced a supported View", () => {
    const before = attentionField.focuses.find((item) => item.id === "focus-experience")!.weight;
    const result = applyRetroactiveLearning({
      attentionField,
      contextField,
      epistemicCore,
      memoryRevision: 2,
      triage,
      rejectedViewLedger: createRejectedViewLedger(),
      plasticMemoryGraph: createPlasticMemoryGraph(),
      outcome: {
        id: "outcome-supported",
        viewId: "view-pattern",
        verdict: "supported",
        expectedOutcome: "The pattern predicts the accepted fix.",
        actualOutcome: "The pattern predicted the accepted fix.",
        confidence: 0.9,
        independenceKey: "project-atlas-run-1",
        contextFingerprint: "context-fingerprint-1",
        discriminators: ["same_constraint"],
        revisitConditions: [],
        capsuleIds: ["capsule-pattern"],
        linkObservations: [
          {
            sourceId: "pattern-1",
            targetId: "view-pattern",
            relation: "enables_view",
            scope: { projectId: "project-atlas" },
            effect: "supports",
            weight: 0.9,
            independenceKey: "project-atlas-run-1",
            contextIds: ["context-retroaction"],
            observedAt: "2026-07-30T18:05:00.000Z",
          },
        ],
        observedAt: "2026-07-30T18:05:00.000Z",
      },
    });

    expect(result.attentionField.focuses.find((item) => item.id === "focus-experience")!.weight).toBeGreaterThan(
      before,
    );
    expect(result.rejectedViewLedger.traces).toHaveLength(0);
    expect(result.plasticity.createdLinkIds).toHaveLength(1);
  });

  it("turns a contradicted View into a compact rejection trace and a challenge attention", () => {
    const result = applyRetroactiveLearning({
      attentionField,
      contextField,
      epistemicCore,
      memoryRevision: 2,
      triage,
      rejectedViewLedger: createRejectedViewLedger(),
      plasticMemoryGraph: createPlasticMemoryGraph(),
      outcome: {
        id: "outcome-contradicted",
        viewId: "view-pattern",
        verdict: "contradicted",
        expectedOutcome: "The historical pattern applies.",
        actualOutcome: "A different constraint changed the mechanism.",
        confidence: 0.92,
        independenceKey: "project-atlas-run-2",
        contextFingerprint: "context-fingerprint-1",
        discriminators: ["different_constraint"],
        revisitConditions: ["same_constraint_is_present"],
        capsuleIds: ["capsule-pattern"],
        linkObservations: [],
        observedAt: "2026-07-30T18:06:00.000Z",
      },
    });

    expect(result.rejectedViewLedger.traces).toHaveLength(1);
    expect(result.signals.invalidatedViewIds).toContain("view-pattern");
    expect(result.signals.newAttentionCandidates[0]?.role).toBe("challenge");
    expect(
      result.attentionField.focuses.some((item) => item.role === "challenge"),
    ).toBe(true);
  });

  it("blocks a rejected View in the same context until a revisit condition changes", () => {
    const view = triage.views.find((item) => item.id === "view-pattern")!;
    const ledger = recordRejectedView({
      ledger: createRejectedViewLedger(),
      view,
      verdict: "context_mismatch",
      contextFingerprint: "same-context",
      reusableDiscriminators: ["different_goal"],
      revisitConditions: ["goal_matches_previous_episode"],
    });

    expect(
      canRevisitRejectedView({
        ledger,
        signature: ledger.traces[0]!.signature,
        contextFingerprint: "same-context",
        satisfiedConditions: [],
      }).allowed,
    ).toBe(false);
    expect(
      canRevisitRejectedView({
        ledger,
        signature: ledger.traces[0]!.signature,
        contextFingerprint: "same-context",
        satisfiedConditions: ["goal_matches_previous_episode"],
      }).allowed,
    ).toBe(true);
  });

  it("verifies a plastic link only after repeated independent support", () => {
    let graph = createPlasticMemoryGraph();
    for (let index = 1; index <= 3; index += 1) {
      graph = updatePlasticMemoryGraph(
        graph,
        [
          {
            sourceId: "pattern-1",
            targetId: "capsule-1",
            relation: "supports",
            scope: { projectId: "project-atlas" },
            effect: "supports",
            weight: 0.8,
            independenceKey: `independent-context-${index}`,
            contextIds: [`context-${index}`],
            observedAt: `2026-07-30T18:0${index}:00.000Z`,
          },
        ],
      ).graph;
    }

    expect(graph.links[0]?.status).toBe("verified");
    expect(graph.links[0]?.confidence).toBeGreaterThan(0.82);
  });

  it("narrows or splits capsules from mixed independent outcomes instead of only increasing confidence", () => {
    const plans = deriveCapsuleRefinementPlans([
      {
        capsuleId: "capsule-1",
        viewId: "view-a",
        verdict: "supported",
        independentContextKey: "context-a",
        discriminators: ["constraint_x_present"],
        confidence: 0.9,
      },
      {
        capsuleId: "capsule-1",
        viewId: "view-b",
        verdict: "supported",
        independentContextKey: "context-b",
        discriminators: ["constraint_x_present"],
        confidence: 0.85,
      },
      {
        capsuleId: "capsule-1",
        viewId: "view-c",
        verdict: "contradicted",
        independentContextKey: "context-c",
        discriminators: ["constraint_x_absent"],
        confidence: 0.9,
      },
      {
        capsuleId: "capsule-1",
        viewId: "view-d",
        verdict: "context_mismatch",
        independentContextKey: "context-d",
        discriminators: ["different_goal"],
        confidence: 0.82,
      },
    ]);

    expect(["narrow", "split"]).toContain(plans[0]?.action);
    expect(plans[0]?.discriminators).toContain("constraint_x_absent");
  });
});
