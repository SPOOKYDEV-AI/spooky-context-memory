import { describe, expect, it } from "vitest";
import {
  calculateProgressiveVisionMetrics,
  calculateProgressiveVisionQualityRates,
} from "../src/index.js";

describe("progressive vision evaluation", () => {
  it("measures beam use, elimination, loops, injection efficiency, and coverage", () => {
    const metrics = calculateProgressiveVisionMetrics({
      totalVisionCount: 8,
      activeVisionCount: 3,
      deferredVisionCount: 1,
      prunedVisionCount: 2,
      exhaustedVisionCount: 1,
      supersededVisionCount: 1,
      loopBlockedCount: 2,
      backtrackCount: 1,
      visitedStateCount: 10,
      uniqueVisitedStateCount: 7,
      visitedNodeCount: 18,
      injectedItemCount: 4,
      resolvedQuestionCount: 3,
      initialQuestionCount: 4,
    });

    expect(metrics.beamUtilization).toBeCloseTo(3 / 8);
    expect(metrics.eliminationRate).toBeCloseTo(4 / 8);
    expect(metrics.loopRate).toBeCloseTo(2 / 10);
    expect(metrics.injectionEfficiency).toBeCloseTo(3 / 4);
    expect(metrics.questionCoverage).toBeCloseTo(3 / 4);
  });

  it("calculates false-pruning, contamination, transition-loss, and wrong-fix rates", () => {
    const rates = calculateProgressiveVisionQualityRates([
      {
        visionId: "vision-a",
        selected: true,
        applicable: true,
        causedContextBleed: false,
        lostTransition: false,
        reusedWrongFix: false,
        falselyPruned: false,
      },
      {
        visionId: "vision-b",
        selected: true,
        applicable: false,
        causedContextBleed: true,
        lostTransition: true,
        reusedWrongFix: true,
        falselyPruned: false,
      },
      {
        visionId: "vision-c",
        selected: false,
        applicable: true,
        causedContextBleed: false,
        lostTransition: false,
        reusedWrongFix: false,
        falselyPruned: true,
      },
    ]);

    expect(rates.selectionPrecision).toBeCloseTo(0.5);
    expect(rates.selectionRecall).toBeCloseTo(0.5);
    expect(rates.falsePruningRate).toBeCloseTo(0.5);
    expect(rates.contextBleedRate).toBeCloseTo(0.5);
    expect(rates.wrongFixReuseRate).toBeCloseTo(1 / 3);
    expect(rates.transitionLossRate).toBeCloseTo(1 / 3);
  });
});
