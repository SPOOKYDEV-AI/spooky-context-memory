import { describe, expect, it } from "vitest";
import { completeAdaptiveMemoryEvolution } from "../src/index.js";
import {
  makeAttentionCycle,
  makeHabitObservation,
  makeTrajectory,
  now,
} from "./fixtures/adaptive-memory-fixtures.js";

function run(overrides: Partial<Parameters<typeof completeAdaptiveMemoryEvolution>[0]> = {}) {
  const fixture = makeAttentionCycle();
  return completeAdaptiveMemoryEvolution({
    attentionField: fixture.cycle.attentionField,
    contextField: fixture.contextField,
    epistemicCore: fixture.epistemicCore,
    memoryRevision: 2,
    triage: fixture.cycle.triage,
    rejectedViewLedger: fixture.rejectedViewLedger,
    plasticMemoryGraph: fixture.plasticMemoryGraph,
    outcome: {
      id: "outcome-adaptive-1",
      viewId: "view-local",
      verdict: "supported",
      expectedOutcome: "Preserve coherence while adapting.",
      actualOutcome: "Preserve coherence while adapting.",
      confidence: 0.92,
      independenceKey: "run-adaptive-1",
      contextFingerprint: "atlas-context-v1",
      discriminators: ["bounded", "contextual"],
      revisitConditions: [],
      capsuleIds: ["capsule-contextual-recall"],
      linkObservations: [
        {
          sourceId: "capsule-contextual-recall",
          targetId: "view-local",
          relation: "enables_view",
          scope: { projectId: "project-atlas" },
          effect: "supports",
          weight: 0.9,
          independenceKey: "run-adaptive-1",
          contextIds: ["context-adaptive-cycle"],
          observedAt: now,
        },
      ],
      observedAt: now,
    },
    trajectory: makeTrajectory(),
    reflectiveMemory: fixture.reflectiveMemory,
    adaptiveUnlearning: fixture.adaptiveUnlearning,
    globalUnderstanding: fixture.globalUnderstanding,
    completedAt: now,
    ...overrides,
  });
}

describe("adaptive memory evolution cycle", () => {
  it("combines world learning, mirror learning, and global coherence", () => {
    const result = run();

    expect(result.retroactive.plasticity.graph.links).toHaveLength(1);
    expect(result.reflectiveMemory.trajectories).toHaveLength(1);
    expect(result.globalUnderstanding.revision).toBeGreaterThan(1);
    expect(result.nextCycleGuidance.mirrorLearningAccepted).toBe(true);
  });

  it("keeps outcome fit separate from causal validation in next-cycle warnings", () => {
    const result = run({
      trajectory: makeTrajectory({
        causalClaimPromoted: true,
        causalValidation: "not_tested",
      }),
    });

    expect(result.nextCycleGuidance.warnings.length).toBeGreaterThan(0);
    expect(result.nextCycleGuidance.mirrorLearningAccepted).toBe(true);
  });

  it("adds counterfactual guidance when a habit must be inhibited", () => {
    const result = run({
      habitId: "habit-contextual-reuse",
      habitObservations: [
        makeHabitObservation("failure-1", "failure", "run-a"),
        makeHabitObservation("failure-2", "failure", "run-b"),
      ],
      outcome: {
        id: "outcome-adaptive-failure",
        viewId: "view-local",
        verdict: "context_mismatch",
        expectedOutcome: "Preserve coherence while adapting.",
        actualOutcome: "The habitual path did not fit the changed context.",
        confidence: 0.9,
        independenceKey: "run-adaptive-failure",
        contextFingerprint: "atlas-context-v2",
        discriminators: ["postgresql", "distributed-scope"],
        revisitConditions: ["context-restores:local-scope"],
        capsuleIds: ["capsule-contextual-recall"],
        linkObservations: [],
        observedAt: now,
      },
      trajectory: makeTrajectory({
        contextFingerprint: "atlas-context-v2",
        contextDiscriminators: ["bounded", "postgresql", "distributed-scope"],
        verdict: "context_mismatch",
        actualOutcome: "The habitual path did not fit the changed context.",
        independentOutcomeKey: "run-adaptive-failure",
      }),
    });

    expect(result.unlearningDecision?.action).toBe("contextually_inhibit");
    expect(result.counterfactualViewPlans).toHaveLength(4);
    expect(result.nextCycleGuidance.requiredAttentionRoles).toContain("dehabituation");
    expect(result.nextCycleGuidance.blockedHabitIds).toContain("habit-contextual-reuse");
  });

  it("does not delete the old habit during contextual unlearning", () => {
    const result = run({
      habitId: "habit-contextual-reuse",
      habitObservations: [
        makeHabitObservation("failure-1", "failure", "run-a"),
        makeHabitObservation("failure-2", "failure", "run-b"),
      ],
    });

    expect(result.adaptiveUnlearning.habits).toHaveLength(1);
    expect(result.adaptiveUnlearning.habits[0]?.confidence.historicalSupport).toBe(0.9);
  });

  it("returns bounded guidance for the next context cycle", () => {
    const result = run();

    expect(result.nextCycleGuidance.minimumAlternativeViews).toBeGreaterThanOrEqual(1);
    expect(result.nextCycleGuidance.contradictionBudget).toBeGreaterThanOrEqual(0);
    expect(result.nextCycleGuidance.maximumVisitedMemoryItems).not.toBeNull();
    expect(result.nextCycleGuidance.maximumInjectedMemoryItems).not.toBeNull();
  });
});
