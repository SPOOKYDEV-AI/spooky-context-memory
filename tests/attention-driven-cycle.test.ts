import { describe, expect, it } from "vitest";
import {
  createEpistemicCore,
  createPlasticMemoryGraph,
  createRejectedViewLedger,
  generateAndTriageAttentionViews,
  measureAttentionRetroaction,
  recordRejectedView,
  runAttentionDrivenMemoryCycle,
  type AttentionCandidate,
  type AttentionViewProposal,
  type ContextField,
  type VisionBranchCandidate,
} from "../src/index.js";

const now = "2026-07-30T18:00:00.000Z";
const contextField: ContextField = {
  revision: 1,
  updatedAt: now,
  transitions: [],
  frames: [
    {
      id: "context-cycle",
      topic: "Complete attention cycle",
      intent: "run_attention_cycle",
      summary: "Generate, triage, act, and learn.",
      scope: { projectId: "project-atlas" },
      activation: 1,
      relevance: 1,
      inertia: 0.8,
      activationState: "dominant",
      retentionState: "pinned",
      introducedAt: now,
      lastReactivatedAt: now,
      parentFrameIds: [],
      sourceTurnIds: ["turn-1"],
      protectedReasons: ["Keep the cycle goal."],
    },
  ],
};
const epistemicCore = createEpistemicCore([], [], now);
const task = {
  intent: "run_attention_cycle",
  target: "attention-driven memory",
  projectId: "project-atlas",
  expectedOutcome: "Select a local memory path and preserve alternatives.",
  operations: ["focus", "view", "triage"],
  constraints: ["bounded"],
  forbiddenEffects: ["global_replay"],
};
const branches: VisionBranchCandidate[] = [
  {
    id: "branch-local",
    path: "/project-atlas/local",
    scope: { projectId: "project-atlas" },
    requiredConstraints: ["bounded"],
    predictedEffects: ["local_resolution"],
    patternIds: [],
    priorUtility: 0.82,
    evidenceConfidence: 0.8,
  },
];
const attentionCandidates: AttentionCandidate[] = [
  {
    id: "focus-goal",
    targetType: "goal",
    targetId: "local-resolution",
    role: "goal",
    reason: "Keep the expected outcome visible.",
    scope: { projectId: "project-atlas" },
    contextAnchorIds: ["context-cycle"],
    truthAnchorIds: [],
    goalDependency: 1,
    constraintImportance: 0.8,
    uncertainty: 0.2,
    novelty: 0.3,
    risk: 0.5,
    expectedInformationGain: 0.7,
    predictiveValue: 0.8,
    persistence: 0.9,
    urgency: 0.8,
    pinned: true,
  },
  {
    id: "focus-unknown",
    targetType: "unknown",
    targetId: "mechanism",
    role: "uncertainty",
    reason: "Verify the actual mechanism.",
    scope: { projectId: "project-atlas" },
    contextAnchorIds: ["context-cycle"],
    truthAnchorIds: [],
    goalDependency: 0.7,
    constraintImportance: 0.6,
    uncertainty: 1,
    novelty: 0.8,
    risk: 0.7,
    expectedInformationGain: 0.9,
    predictiveValue: 0.6,
    persistence: 0.5,
    urgency: 0.8,
  },
];
const proposal: AttentionViewProposal = {
  id: "view-local",
  hypothesis: "The local branch contains the applicable experience.",
  attentionIds: ["focus-goal", "focus-unknown"],
  truthAnchorIds: [],
  assumptionIds: [],
  branchIds: ["branch-local"],
  questionsCovered: ["Is the local branch applicable?"],
  conclusions: [
    { key: "path", statement: "Use the local branch.", confidence: 0.8 },
  ],
  scope: { projectId: "project-atlas" },
  sharedAcrossProjects: false,
  priorUtility: 0.82,
  noveltyScore: 0.6,
  expectedCost: 0.2,
  riskIfWrong: 0.4,
};

function run(overrides: Partial<Parameters<typeof runAttentionDrivenMemoryCycle>[0]> = {}) {
  return runAttentionDrivenMemoryCycle({
    task,
    scope: { projectId: "project-atlas" },
    contextField,
    epistemicCore,
    memoryRevision: 1,
    attentionCandidates,
    viewProposals: [proposal],
    branches,
    equilibriumObservation: {
      visitedMemoryItems: 8,
      injectedMemoryItems: 1,
      averageExplorationDepth: 2,
      dominantViewHistory: [],
      changedContextIds: ["context-cycle"],
      changedTruthAnchorIds: [],
      explorationDebt: [],
    },
    now,
    ...overrides,
  });
}

describe("attention-driven memory cycle", () => {
  it("runs attention allocation, View triage, and equilibrium as one deterministic cycle", () => {
    const result = run();
    expect(result.attentionField.activeFocusIds.length).toBeGreaterThan(0);
    expect(result.triage.generatedProgressiveVisionSeeds).toHaveLength(1);
    expect(result.equilibrium.decisions.length).toBeGreaterThan(0);
    expect(result.blockedProposalIds).toHaveLength(0);
  });

  it("blocks a previously rejected View in the unchanged semantic context", () => {
    const initial = run();
    const view = initial.triage.views.find((item) => item.id === "view-local")!;
    const ledger = recordRejectedView({
      ledger: createRejectedViewLedger(now),
      view,
      verdict: "context_mismatch",
      contextFingerprint: "fingerprint-1",
      revisitConditions: ["new_context_signal"],
      observedAt: now,
    });
    const result = run({
      rejectedViewLedger: ledger,
      contextFingerprint: "fingerprint-1",
    });

    expect(result.blockedProposalIds).toContain("view-local");
    expect(result.triage.views).toHaveLength(0);
  });

  it("reopens a rejected View when an explicit revisit condition becomes true", () => {
    const initial = run();
    const view = initial.triage.views.find((item) => item.id === "view-local")!;
    const ledger = recordRejectedView({
      ledger: createRejectedViewLedger(now),
      view,
      verdict: "context_mismatch",
      contextFingerprint: "fingerprint-1",
      revisitConditions: ["new_context_signal"],
      observedAt: now,
    });
    const result = run({
      rejectedViewLedger: ledger,
      contextFingerprint: "fingerprint-1",
      satisfiedRevisitConditions: ["new_context_signal"],
    });

    expect(result.blockedProposalIds).toHaveLength(0);
    expect(result.triage.views).toHaveLength(1);
  });

  it("reports attention, View, plasticity, and equilibrium metrics without conflating them", () => {
    const result = run();
    const metrics = measureAttentionRetroaction({
      attentionField: result.attentionField,
      triage: result.triage,
      rejectedViewLedger: createRejectedViewLedger(now),
      plasticMemoryGraph: createPlasticMemoryGraph(now),
      equilibrium: result.equilibrium,
    });

    expect(metrics.attentionDiversity).toBeGreaterThanOrEqual(0);
    expect(metrics.attentionDiversity).toBeLessThanOrEqual(1);
    expect(metrics.activeViewYield).toBeGreaterThan(0);
    expect(metrics.progressiveSeedYield).toBeGreaterThan(0);
  });
});
