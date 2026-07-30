import { describe, expect, it } from "vitest";
import { applyUnderstandingObservations, type UnderstandingObservation } from "../src/index.js";
import { makeGlobalState, now } from "./fixtures/adaptive-memory-fixtures.js";

function edgeObservation(
  id: string,
  effect: UnderstandingObservation["effect"],
  key: string,
  weight: number,
): UnderstandingObservation {
  return {
    id,
    kind: "pattern_change",
    effect,
    targetIds: ["edge-goal-context"],
    weight,
    independenceKey: key,
    contextFingerprint: "atlas-context-v1",
    scope: { projectId: "project-atlas" },
    reason: "Synthetic backbone evidence.",
    observedAt: now,
  };
}

describe("semantic backbone", () => {
  it("strengthens a structural edge from independent support", () => {
    const result = applyUnderstandingObservations({
      state: makeGlobalState(),
      observations: [
        edgeObservation("support-1", "supports", "run-a", 0.9),
        edgeObservation("support-2", "supports", "run-b", 0.9),
      ],
      updatedAt: now,
    });
    const edge = result.state.semanticBackbone[0]!;

    expect(edge.confidence).toBeGreaterThan(0.8);
    expect(edge.status).toBe("verified");
  });

  it("does not multiply duplicated support from the same evidence group", () => {
    const one = applyUnderstandingObservations({
      state: makeGlobalState(),
      observations: [edgeObservation("support-1", "supports", "same-run", 0.8)],
      updatedAt: now,
    }).state.semanticBackbone[0]!.confidence;
    const duplicate = applyUnderstandingObservations({
      state: makeGlobalState(),
      observations: [
        edgeObservation("support-1", "supports", "same-run", 0.8),
        edgeObservation("support-2", "supports", "same-run", 0.8),
      ],
      updatedAt: now,
    }).state.semanticBackbone[0]!.confidence;

    expect(duplicate).toBeCloseTo(one);
  });

  it("disputes a backbone edge without deleting its history", () => {
    const result = applyUnderstandingObservations({
      state: makeGlobalState(),
      observations: [edgeObservation("challenge-1", "challenges", "run-a", 0.95)],
      updatedAt: now,
    });
    const edge = result.state.semanticBackbone[0]!;

    expect(edge.status).toBe("disputed");
    expect(edge.independentChallengeKeys).toContain("run-a");
    expect(result.state.semanticBackbone).toHaveLength(1);
  });

  it("marks an obsolete structural relation as superseded", () => {
    const result = applyUnderstandingObservations({
      state: makeGlobalState(),
      observations: [edgeObservation("supersede-1", "supersedes", "source-new", 0.9)],
      updatedAt: now,
    });

    expect(result.state.semanticBackbone[0]?.status).toBe("superseded");
  });
});
