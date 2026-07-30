import { describe, expect, it } from "vitest";
import { evaluateRetrievalSamples } from "../src/index.js";

describe("retrieval evaluation metrics", () => {
  it("measures precision, recall, false pruning and context cost", () => {
    const metrics = evaluateRetrievalSamples([
      {
        expectedCapsuleIds: ["capsule-a", "capsule-b"],
        injectedCapsuleIds: ["capsule-a"],
        prunedRelevantCapsuleIds: ["capsule-b"],
        repeatedKnownError: false,
        visitedNodeCount: 12,
        injectedTokenEstimate: 90,
      },
      {
        expectedCapsuleIds: ["capsule-c"],
        injectedCapsuleIds: ["capsule-c", "capsule-noise"],
        prunedRelevantCapsuleIds: [],
        repeatedKnownError: true,
        visitedNodeCount: 8,
        injectedTokenEstimate: 120,
      },
    ]);

    expect(metrics.precision).toBeCloseTo(2 / 3);
    expect(metrics.recall).toBeCloseTo(2 / 3);
    expect(metrics.falsePruningRate).toBeCloseTo(1 / 3);
    expect(metrics.knownErrorRepetitionRate).toBe(0.5);
    expect(metrics.averageVisitedNodes).toBe(10);
    expect(metrics.averageInjectedTokenEstimate).toBe(105);
  });
});
