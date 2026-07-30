import { describe, expect, it } from "vitest";
import {
  createEpistemicCore,
  createMemoryAttentionField,
  evaluateDynamicEquilibrium,
  generateAndTriageAttentionViews,
  type AttentionCandidate,
  type AttentionViewProposal,
  type ContextField,
  type EquilibriumObservation,
  type VisionBranchCandidate,
} from "../src/index.js";

const contextField: ContextField = {
  revision: 1,
  updatedAt: "2026-07-30T18:00:00.000Z",
  transitions: [],
  frames: [
    {
      id: "context-equilibrium",
      topic: "Dynamic memory equilibrium",
      intent: "maintain_equilibrium",
      summary: "Balance fidelity, diversity, depth, cost and plasticity.",
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
      protectedReasons: ["Preserve equilibrium."],
    },
  ],
};
const epistemicCore = createEpistemicCore([], [], "2026-07-30T18:00:00.000Z");

function attention(id: string, role: AttentionCandidate["role"]): AttentionCandidate {
  return {
    id,
    targetType:
      role === "goal"
        ? "goal"
        : role === "constraint"
          ? "constraint"
          : role === "challenge"
            ? "contradiction"
            : role === "uncertainty"
              ? "unknown"
              : "pattern",
    targetId: id,
    role,
    reason: `Observe ${id}.`,
    scope: { projectId: "project-atlas" },
    contextAnchorIds: ["context-equilibrium"],
    truthAnchorIds: [],
    goalDependency: role === "goal" ? 1 : 0.5,
    constraintImportance: role === "constraint" ? 1 : 0.5,
    uncertainty: role === "uncertainty" ? 1 : 0.4,
    novelty: 0.6,
    risk: role === "challenge" ? 0.85 : 0.5,
    expectedInformationGain: 0.7,
    predictiveValue: 0.65,
    persistence: 0.6,
    urgency: 0.6,
  };
}

const task = {
  intent: "maintain_equilibrium",
  target: "memory control loop",
  projectId: "project-atlas",
  expectedOutcome: "Keep memory search inside dynamic control bands.",
  operations: ["measure", "rebalance"],
  constraints: ["preserve_goal"],
  forbiddenEffects: ["global_memory_replay"],
};
const branches: VisionBranchCandidate[] = [
  {
    id: "branch-a",
    path: "/project-atlas/a",
    scope: { projectId: "project-atlas" },
    requiredConstraints: ["preserve_goal"],
    predictedEffects: ["local_resolution"],
    patternIds: [],
    priorUtility: 0.8,
    evidenceConfidence: 0.8,
  },
  {
    id: "branch-b",
    path: "/project-atlas/b",
    scope: { projectId: "project-atlas" },
    requiredConstraints: ["preserve_goal"],
    predictedEffects: ["alternative_resolution"],
    patternIds: [],
    priorUtility: 0.75,
    evidenceConfidence: 0.75,
  },
];

function proposal(id: string, branchId: string, attentionIds: string[]): AttentionViewProposal {
  return {
    id,
    hypothesis: `Hypothesis ${id}`,
    attentionIds,
    truthAnchorIds: [],
    assumptionIds: [],
    branchIds: [branchId],
    questionsCovered: ["Which branch is correct?"],
    conclusions: [{ key: "path", statement: branchId, confidence: 0.75 }],
    scope: { projectId: "project-atlas" },
    sharedAcrossProjects: false,
    priorUtility: 0.8,
    noveltyScore: 0.6,
    expectedCost: 0.2,
    riskIfWrong: 0.4,
  };
}

function buildSystem(candidates: AttentionCandidate[], proposals: AttentionViewProposal[]) {
  const attentionField = createMemoryAttentionField({
    contextField,
    epistemicCore,
    memoryRevision: 1,
    candidates,
    policy: { minimumRoleCoverage: [] },
  });
  const triage = generateAndTriageAttentionViews({
    task,
    scope: { projectId: "project-atlas" },
    attentionField,
    epistemicCore,
    branches,
    proposals,
  });
  return { attentionField, triage };
}

function observation(overrides: Partial<EquilibriumObservation> = {}): EquilibriumObservation {
  return {
    visitedMemoryItems: 20,
    injectedMemoryItems: 2,
    averageExplorationDepth: 3,
    dominantViewHistory: ["view-a"],
    changedContextIds: [],
    changedTruthAnchorIds: [],
    explorationDebt: [],
    ...overrides,
  };
}

describe("dynamic memory equilibrium", () => {
  it("pins the goal when fidelity falls below the protected band", () => {
    const { attentionField, triage } = buildSystem(
      [attention("focus-unknown", "uncertainty")],
      [proposal("view-a", "branch-a", ["focus-unknown"])],
    );
    const result = evaluateDynamicEquilibrium({
      attentionField,
      triage,
      observation: observation(),
    });

    expect(result.decisions.some((decision) => decision.action === "PIN_INVARIANT")).toBe(true);
  });

  it("spawns alternatives when the beam lacks challenge and diversity", () => {
    const { attentionField, triage } = buildSystem(
      [attention("focus-goal", "goal")],
      [proposal("view-a", "branch-a", ["focus-goal"])],
    );
    const result = evaluateDynamicEquilibrium({
      attentionField,
      triage,
      observation: observation(),
    });

    expect(result.decisions.some((decision) => decision.action === "SPAWN_ALTERNATIVE")).toBe(true);
  });

  it("freezes consolidation when a critical unknown is not covered", () => {
    const { attentionField, triage } = buildSystem(
      [
        attention("focus-goal", "goal"),
        attention("focus-constraint", "constraint"),
        attention("focus-unknown", "uncertainty"),
      ],
      [proposal("view-a", "branch-a", ["focus-goal", "focus-constraint"])],
    );
    const result = evaluateDynamicEquilibrium({
      attentionField,
      triage,
      observation: observation({
        explorationDebt: [
          {
            id: "debt-root-cause",
            question: "Is the inferred root cause actually verified?",
            criticality: 0.95,
            coverage: 0,
            riskIfIgnored: 0.9,
            assignedViewIds: [],
          },
        ],
      }),
    });

    expect(result.decisions.some((decision) => decision.action === "REQUEST_EVIDENCE")).toBe(true);
    expect(result.decisions.some((decision) => decision.action === "FREEZE_CONSOLIDATION")).toBe(true);
  });

  it("detects oscillation and applies hysteresis instead of view ping-pong", () => {
    const { attentionField, triage } = buildSystem(
      [
        attention("focus-goal", "goal"),
        attention("focus-challenge", "challenge"),
      ],
      [
        proposal("view-a", "branch-a", ["focus-goal"]),
        proposal("view-b", "branch-b", ["focus-challenge"]),
      ],
    );
    const result = evaluateDynamicEquilibrium({
      attentionField,
      triage,
      observation: observation({
        dominantViewHistory: ["view-a", "view-b", "view-a", "view-b", "view-a"],
      }),
      policy: { maximumDominanceSwitches: 2 },
    });

    expect(result.snapshot.oscillationDetected).toBe(true);
    expect(result.decisions.some((decision) => decision.action === "DEFER_VIEW")).toBe(true);
  });

  it("reduces injection without reducing the inspected-memory budget", () => {
    const { attentionField, triage } = buildSystem(
      [
        attention("focus-goal", "goal"),
        attention("focus-constraint", "constraint"),
        attention("focus-challenge", "challenge"),
      ],
      [
        proposal("view-a", "branch-a", ["focus-goal", "focus-constraint"]),
        proposal("view-b", "branch-b", ["focus-challenge"]),
      ],
    );
    const result = evaluateDynamicEquilibrium({
      attentionField,
      triage,
      observation: observation({ visitedMemoryItems: 10, injectedMemoryItems: 9 }),
    });

    expect(result.decisions.some((decision) => decision.action === "REDUCE_INJECTION")).toBe(true);
  });

  it("emits MAINTAIN when every monitored dimension stays inside custom bands", () => {
    const { attentionField, triage } = buildSystem(
      [
        attention("focus-goal", "goal"),
        attention("focus-constraint", "constraint"),
        attention("focus-unknown", "uncertainty"),
        attention("focus-challenge", "challenge"),
        attention("focus-experience", "experience"),
      ],
      [
        proposal("view-a", "branch-a", ["focus-goal", "focus-constraint"]),
        proposal("view-b", "branch-b", ["focus-unknown", "focus-challenge"]),
      ],
    );
    const permissiveBand = { minimum: 0, targetLow: 0, targetHigh: 1, maximum: 1 };
    const result = evaluateDynamicEquilibrium({
      attentionField,
      triage,
      observation: observation(),
      policy: {
        bands: {
          goal_fidelity: permissiveBand,
          constraint_coverage: permissiveBand,
          attention_diversity: permissiveBand,
          view_diversity: permissiveBand,
          challenge_coverage: permissiveBand,
          uncertainty_coverage: permissiveBand,
          exploration_depth: permissiveBand,
          exploration_breadth: permissiveBand,
          injection_efficiency: permissiveBand,
          stability: permissiveBand,
          plasticity: permissiveBand,
        },
        criticalDebtThreshold: 1,
        maximumDominanceSwitches: 10,
      },
    });

    expect(result.balanced).toBe(true);
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]?.action).toBe("MAINTAIN");
  });
});
