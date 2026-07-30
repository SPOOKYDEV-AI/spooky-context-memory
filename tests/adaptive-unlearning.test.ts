import { describe, expect, it } from "vitest";
import {
  createAdaptiveUnlearningState,
  evaluateHabitForUnlearning,
} from "../src/index.js";
import {
  makeHabit,
  makeHabitObservation,
  now,
} from "./fixtures/adaptive-memory-fixtures.js";

describe("adaptive unlearning", () => {
  it("records one failure without erasing a mature habit", () => {
    const state = createAdaptiveUnlearningState([makeHabit()], now);
    const result = evaluateHabitForUnlearning({
      state,
      habitId: "habit-contextual-reuse",
      observations: [makeHabitObservation("failure-1", "failure", "run-a")],
      evaluatedAt: now,
    });

    expect(result.decision.action).toBe("challenge");
    expect(result.state.habits[0]?.status).toBe("challenged");
    expect(result.state.habits[0]?.confidence.historicalSupport).toBe(0.9);
  });

  it("inhibits a habit after independent failures and strong context drift", () => {
    const state = createAdaptiveUnlearningState([makeHabit()], now);
    const result = evaluateHabitForUnlearning({
      state,
      habitId: "habit-contextual-reuse",
      observations: [
        makeHabitObservation("failure-1", "failure", "run-a"),
        makeHabitObservation("failure-2", "failure", "run-b"),
      ],
      evaluatedAt: now,
    });

    expect(result.decision.action).toBe("contextually_inhibit");
    expect(result.state.habits[0]?.status).toBe("inhibited");
    expect(result.state.inhibitions).toHaveLength(1);
  });

  it("quarantines a habit after repeated independent failure", () => {
    const state = createAdaptiveUnlearningState([makeHabit()], now);
    const observations = Array.from({ length: 4 }, (_, index) =>
      makeHabitObservation(`failure-${index}`, "failure", `run-${index}`, {
        currentContextFingerprint: "atlas-context-v1",
        currentDiscriminators: ["bounded", "typescript", "local-scope"],
        weight: 0.9,
      }),
    );
    const result = evaluateHabitForUnlearning({
      state,
      habitId: "habit-contextual-reuse",
      observations,
      evaluatedAt: now,
    });

    expect(result.decision.action).toBe("quarantine");
    expect(result.state.habits[0]?.status).toBe("quarantined");
  });

  it("reopens knowledge as unknown when a supporting truth is superseded", () => {
    const state = createAdaptiveUnlearningState([makeHabit()], now);
    const result = evaluateHabitForUnlearning({
      state,
      habitId: "habit-contextual-reuse",
      observations: [
        makeHabitObservation("truth-change", "truth_supersession", "source-new", {
          weight: 0.95,
        }),
      ],
      evaluatedAt: now,
    });

    expect(result.decision.action).toBe("reopen_unknown");
    expect(result.state.habits[0]?.status).toBe("quarantined");
  });

  it("supersedes an old habit when a better strategy has strong evidence", () => {
    const state = createAdaptiveUnlearningState([makeHabit()], now);
    const result = evaluateHabitForUnlearning({
      state,
      habitId: "habit-contextual-reuse",
      replacementHabitId: "habit-adaptive-reuse-v2",
      observations: [
        makeHabitObservation("superior-1", "superior_strategy", "run-a", { weight: 0.95 }),
      ],
      evaluatedAt: now,
    });

    expect(result.decision.action).toBe("supersede");
    expect(result.state.habits[0]?.supersededByHabitId).toBe("habit-adaptive-reuse-v2");
    expect(result.state.habits[0]?.status).toBe("superseded");
  });

  it("narrows an over-general habit instead of deleting it", () => {
    const state = createAdaptiveUnlearningState([makeHabit()], now);
    const result = evaluateHabitForUnlearning({
      state,
      habitId: "habit-contextual-reuse",
      observations: [
        makeHabitObservation("failure-1", "failure", "run-a", {
          currentContextFingerprint: "atlas-context-v1",
          currentDiscriminators: ["bounded", "typescript"],
        }),
        makeHabitObservation("failure-2", "failure", "run-b", {
          currentContextFingerprint: "atlas-context-v1",
          currentDiscriminators: ["bounded", "typescript"],
        }),
      ],
      policy: { contextDriftThreshold: 0.9 },
      evaluatedAt: now,
    });

    expect(result.decision.action).toBe("narrow");
    expect(result.state.habits[0]?.contextDiscriminators).not.toContain("local-scope");
  });

  it("preserves historical support during unlearning", () => {
    const habit = makeHabit({
      confidence: {
        historicalSupport: 0.96,
        currentApplicability: 0.8,
        predictiveReliability: 0.75,
        contradictionPressure: 0.1,
        contextDrift: 0.05,
      },
    });
    const result = evaluateHabitForUnlearning({
      state: createAdaptiveUnlearningState([habit], now),
      habitId: habit.id,
      observations: [
        makeHabitObservation("failure-1", "failure", "run-a"),
        makeHabitObservation("failure-2", "failure", "run-b"),
      ],
      evaluatedAt: now,
    });

    expect(result.decision.preservedHistoricalSupport).toBe(0.96);
    expect(result.state.habits[0]?.confidence.historicalSupport).toBe(0.96);
  });
});
