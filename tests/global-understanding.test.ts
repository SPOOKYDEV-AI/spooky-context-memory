import { describe, expect, it } from "vitest";
import {
  applyUnderstandingObservations,
  createGlobalUnderstandingState,
  globalUnderstandingSimilarity,
  type GlobalUnderstandingModel,
  type UnderstandingObservation,
} from "../src/index.js";
import {
  makeBackboneEdge,
  makeGlobalModel,
  makeGlobalState,
  now,
} from "./fixtures/adaptive-memory-fixtures.js";

function observation(
  id: string,
  effect: UnderstandingObservation["effect"],
  key: string,
  weight = 0.82,
): UnderstandingObservation {
  return {
    id,
    kind: "view_outcome",
    effect,
    targetIds: ["understanding-atlas", "claim-context-is-key"],
    weight,
    independenceKey: key,
    contextFingerprint: "atlas-context-v1",
    scope: { projectId: "project-atlas" },
    reason: `Synthetic ${effect} observation.`,
    observedAt: now,
  };
}

describe("global understanding", () => {
  it("creates one dominant understanding with optional alternatives", () => {
    const alternative = makeGlobalModel({
      id: "understanding-alternative",
      status: "alternative",
      coherence: 0.7,
    });
    const state = createGlobalUnderstandingState({
      dominantModel: makeGlobalModel(),
      alternativeModels: [alternative],
      semanticBackbone: [makeBackboneEdge()],
      createdAt: now,
    });

    expect(state.dominantModelId).toBe("understanding-atlas");
    expect(state.alternativeModelIds).toContain("understanding-alternative");
    expect(state.models).toHaveLength(2);
  });

  it("keeps the global model stable when local support is compatible", () => {
    const result = applyUnderstandingObservations({
      state: makeGlobalState(),
      observations: [observation("support-1", "supports", "run-a")],
      updatedAt: now,
    });
    const dominant = result.state.models.find(
      (model) => model.id === result.state.dominantModelId,
    )!;

    expect(result.decision.action).toBe("maintain");
    expect(dominant.coherence).toBeGreaterThan(0.7);
    expect(result.state.globalRevisionCount).toBe(0);
  });

  it("counts correlated challenges once", () => {
    const result = applyUnderstandingObservations({
      state: makeGlobalState(),
      observations: [
        observation("challenge-1", "challenges", "same-run", 0.9),
        observation("challenge-2", "challenges", "same-run", 0.9),
      ],
      policy: {
        globalRevisionPressureThreshold: 0.4,
        minimumIndependentChallengesForGlobalRevision: 2,
      },
      updatedAt: now,
    });

    expect(result.decision.action).not.toBe("global_revision");
  });

  it("opens a controlled global revision after independent contradictions", () => {
    const result = applyUnderstandingObservations({
      state: makeGlobalState(),
      observations: [
        observation("challenge-1", "challenges", "run-a", 1),
        observation("challenge-2", "challenges", "run-b", 1),
      ],
      policy: {
        globalRevisionPressureThreshold: 0.35,
        minimumIndependentChallengesForGlobalRevision: 2,
      },
      updatedAt: now,
    });

    expect(result.decision.action).toBe("global_revision");
    expect(result.decision.replacementModelId).toBeNull();
    expect(result.state.models[0]?.status).toBe("challenged");
  });

  it("promotes a supplied replacement instead of rewriting the old model", () => {
    const replacement = makeGlobalModel({
      id: "understanding-atlas-v2",
      status: "candidate",
      contextFingerprint: "atlas-context-v2",
      coherence: 0.88,
      stability: 0.76,
      derivedFromModelIds: [],
    });
    const result = applyUnderstandingObservations({
      state: makeGlobalState(),
      observations: [
        observation("challenge-1", "challenges", "run-a", 1),
        observation("challenge-2", "challenges", "run-b", 1),
      ],
      replacementModel: replacement,
      policy: {
        globalRevisionPressureThreshold: 0.35,
        minimumIndependentChallengesForGlobalRevision: 2,
      },
      updatedAt: now,
    });

    expect(result.state.dominantModelId).toBe("understanding-atlas-v2");
    expect(result.state.alternativeModelIds).toContain("understanding-atlas");
    expect(result.state.globalRevisionCount).toBe(1);
  });

  it("measures similarity from goals, invariants, truths, and patterns", () => {
    const left = makeGlobalModel();
    const right: GlobalUnderstandingModel = makeGlobalModel({
      id: "understanding-copy",
      contextFingerprint: "atlas-context-v2",
    });
    const distant = makeGlobalModel({
      id: "understanding-distant",
      identity: {
        subject: "Different system",
        primaryGoal: "Optimize an unrelated renderer.",
        currentSituation: "Rendering.",
      },
      invariantIds: ["renderer-speed"],
      truthAnchorIds: ["truth-gpu"],
      corePatternIds: ["pattern-render"],
    });

    expect(globalUnderstandingSimilarity(left, right)).toBeGreaterThan(0.8);
    expect(globalUnderstandingSimilarity(left, distant)).toBeLessThan(0.3);
  });
});
