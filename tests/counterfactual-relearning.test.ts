import { describe, expect, it } from "vitest";
import {
  buildCounterfactualViewPlans,
  createAdaptiveUnlearningState,
  evaluateHabitForUnlearning,
  reactivateHabit,
  type UnlearningDecision,
} from "../src/index.js";
import {
  makeHabit,
  makeHabitObservation,
  now,
} from "./fixtures/adaptive-memory-fixtures.js";

function decision(action: UnlearningDecision["action"]): UnlearningDecision {
  return {
    id: `decision-${action}`,
    habitId: "habit-contextual-reuse",
    action,
    confidence: 0.8,
    reasons: ["Synthetic decision."],
    triggeringObservationIds: ["observation-1"],
    affectedDiscriminators: ["local-scope"],
    reactivationConditions: ["new-independent-success", "contradiction-resolved"],
    preservedHistoricalSupport: 0.9,
    reversible: action !== "supersede",
    decidedAt: now,
  };
}

describe("counterfactual relearning", () => {
  it("generates control, habit-free, inverted, and truth-first Views", () => {
    const plans = buildCounterfactualViewPlans(
      makeHabit(),
      decision("contextually_inhibit"),
    );

    expect(plans).toHaveLength(4);
    expect(plans.map((item) => item.strategy)).toContain("without_habit");
    expect(plans.map((item) => item.strategy)).toContain("fresh_from_truths");
  });

  it("does not generate counterfactual work when the habit is retained", () => {
    expect(buildCounterfactualViewPlans(makeHabit(), decision("retain"))).toHaveLength(0);
  });

  it("creates a relearning plan after contextual inhibition", () => {
    const result = evaluateHabitForUnlearning({
      state: createAdaptiveUnlearningState([makeHabit()], now),
      habitId: "habit-contextual-reuse",
      observations: [
        makeHabitObservation("failure-1", "failure", "run-a"),
        makeHabitObservation("failure-2", "failure", "run-b"),
      ],
      evaluatedAt: now,
    });

    expect(result.relearningPlan?.status).toBe("planned");
    expect(result.relearningPlan?.counterfactualViewPlanIds).toHaveLength(4);
  });

  it("registers explicit recovery conditions", () => {
    const result = evaluateHabitForUnlearning({
      state: createAdaptiveUnlearningState([makeHabit()], now),
      habitId: "habit-contextual-reuse",
      observations: [
        makeHabitObservation("failure-1", "failure", "run-a"),
        makeHabitObservation("failure-2", "failure", "run-b"),
      ],
      evaluatedAt: now,
    });

    expect(result.state.recoveryRegistry).toHaveLength(1);
    expect(result.state.recoveryRegistry[0]?.requiredConditions).toContain("new-independent-success");
  });

  it("reactivates an inhibited habit only after all recovery conditions are satisfied", () => {
    const inhibited = evaluateHabitForUnlearning({
      state: createAdaptiveUnlearningState([makeHabit()], now),
      habitId: "habit-contextual-reuse",
      observations: [
        makeHabitObservation("failure-1", "failure", "run-a"),
        makeHabitObservation("failure-2", "failure", "run-b"),
      ],
      evaluatedAt: now,
    });
    const required = inhibited.state.recoveryRegistry[0]!.requiredConditions;
    const blocked = reactivateHabit({
      state: inhibited.state,
      habitId: "habit-contextual-reuse",
      satisfiedConditions: [required[0]!],
      reactivatedAt: now,
    });
    const restored = reactivateHabit({
      state: inhibited.state,
      habitId: "habit-contextual-reuse",
      satisfiedConditions: required,
      reactivatedAt: now,
    });

    expect(blocked.reactivated).toBe(false);
    expect(restored.reactivated).toBe(true);
    expect(restored.state.habits[0]?.status).toBe("challenged");
  });
});
