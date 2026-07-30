import { describe, expect, it } from "vitest";
import {
  analyzeCognitiveTrajectory,
  applyReflectiveLearning,
  createReflectiveMemoryState,
} from "../src/index.js";
import { makeTrajectory, now } from "./fixtures/adaptive-memory-fixtures.js";

describe("reflective memory", () => {
  it("separates successful outcomes from unverified causes", () => {
    const analysis = analyzeCognitiveTrajectory(
      makeTrajectory({ causalValidation: "not_tested", causalClaimPromoted: true }),
    );

    expect(analysis.outcomeFit).toBe(1);
    expect(analysis.causalFit).toBeLessThan(0.4);
    expect(analysis.causalExplanationValidated).toBe(false);
    expect(analysis.warnings.length).toBeGreaterThan(0);
  });

  it("blocks mirror learning without external grounding", () => {
    const result = applyReflectiveLearning({
      state: createReflectiveMemoryState(now),
      trajectory: makeTrajectory({ externalGroundingKeys: [] }),
      updatedAt: now,
    });

    expect(result.mirrorLearningAccepted).toBe(false);
    expect(result.reflectiveCapsule).toBeNull();
    expect(result.state.trajectories).toHaveLength(1);
  });

  it("creates a contextual reflective capsule from a grounded success", () => {
    const result = applyReflectiveLearning({
      state: createReflectiveMemoryState(now),
      trajectory: makeTrajectory(),
      updatedAt: now,
    });

    expect(result.mirrorLearningAccepted).toBe(true);
    expect(result.reflectiveCapsule?.contextFingerprint).toBe("atlas-context-v1");
    expect(result.cognitivePolicy?.roleWeights.challenge).toBeGreaterThan(0);
  });

  it("validates a reflective capsule only after independent repeated success", () => {
    let state = createReflectiveMemoryState(now);
    for (let index = 1; index <= 4; index += 1) {
      state = applyReflectiveLearning({
        state,
        trajectory: makeTrajectory({
          id: `trajectory-${index}`,
          independentOutcomeKey: `run-${index}`,
          externalGroundingKeys: [`test-${index}`],
        }),
        updatedAt: now,
      }).state;
    }

    expect(state.capsules[0]?.status).toBe("validated");
    expect(state.capsules[0]?.independentSuccessKeys).toHaveLength(4);
  });

  it("keeps repeated correlated success as one independent support", () => {
    let state = createReflectiveMemoryState(now);
    for (let index = 1; index <= 4; index += 1) {
      state = applyReflectiveLearning({
        state,
        trajectory: makeTrajectory({
          id: `trajectory-${index}`,
          independentOutcomeKey: "same-run",
          externalGroundingKeys: [`test-${index}`],
        }),
        updatedAt: now,
      }).state;
    }

    expect(state.capsules[0]?.independentSuccessKeys).toHaveLength(1);
    expect(state.capsules[0]?.status).toBe("candidate");
  });

  it("bounds stored cognitive trajectories", () => {
    let state = createReflectiveMemoryState(now);
    for (let index = 1; index <= 5; index += 1) {
      state = applyReflectiveLearning({
        state,
        trajectory: makeTrajectory({
          id: `trajectory-${index}`,
          independentOutcomeKey: `run-${index}`,
        }),
        policy: { maximumStoredTrajectories: 3 },
        updatedAt: now,
      }).state;
    }

    expect(state.trajectories).toHaveLength(3);
    expect(state.trajectories.map((item) => item.id)).toContain("trajectory-5");
  });
});
