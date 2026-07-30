import { describe, expect, it } from "vitest";
import {
  createAdaptiveUnlearningState,
  createReflectiveMemoryState,
  measureAdaptiveMemory,
} from "../src/index.js";
import {
  makeGlobalState,
  makeHabit,
  makeTrajectory,
  now,
} from "./fixtures/adaptive-memory-fixtures.js";

describe("adaptive memory metrics", () => {
  it("reports global coherence and stability from the dominant model", () => {
    const metrics = measureAdaptiveMemory(
      makeGlobalState(),
      createReflectiveMemoryState(now),
      createAdaptiveUnlearningState([], now),
    );

    expect(metrics.globalCoherence).toBeGreaterThan(0.8);
    expect(metrics.globalStability).toBe(0.8);
  });

  it("measures mirror grounding coverage", () => {
    const reflection = createReflectiveMemoryState(now);
    reflection.trajectories = [
      makeTrajectory({ id: "grounded" }),
      makeTrajectory({ id: "ungrounded", externalGroundingKeys: [] }),
    ];
    const metrics = measureAdaptiveMemory(
      makeGlobalState(),
      reflection,
      createAdaptiveUnlearningState([], now),
    );

    expect(metrics.mirrorGroundingRate).toBeCloseTo(0.5);
  });

  it("exposes the gap between outcome success and causal proof", () => {
    const reflection = createReflectiveMemoryState(now);
    reflection.trajectories = [
      makeTrajectory({ verdict: "supported", causalValidation: "not_tested" }),
    ];
    const metrics = measureAdaptiveMemory(
      makeGlobalState(),
      reflection,
      createAdaptiveUnlearningState([], now),
    );

    expect(metrics.causalCalibrationGap).toBeGreaterThan(0.7);
  });

  it("measures habit rigidity from automaticity, adaptability, and applicability", () => {
    const metrics = measureAdaptiveMemory(
      makeGlobalState(),
      createReflectiveMemoryState(now),
      createAdaptiveUnlearningState([makeHabit()], now),
    );

    expect(metrics.habitRigidity).toBeGreaterThan(0.3);
    expect(metrics.habitRigidity).toBeLessThanOrEqual(1);
  });
});
