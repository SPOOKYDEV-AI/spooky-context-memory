import { describe, expect, it } from "vitest";
import {
  assessContextRetention,
  calculateContextEfficiency,
} from "../src/index.js";

describe("context retention and phase intensity", () => {
  it("keeps old but goal-critical context active regardless of age", () => {
    const assessment = assessContextRetention({
      goalDependency: 1,
      constraintImportance: 0.95,
      unresolvedDependency: 0.8,
      discriminatingPower: 0.9,
      validationImportance: 1,
      reuseValue: 0.8,
      redundancy: 0.2,
      resolutionCompleteness: 0.1,
    });
    expect(["pinned", "active"]).toContain(assessment.recommendedState);
  });

  it("recommends compaction when context is resolved and redundant", () => {
    const assessment = assessContextRetention({
      goalDependency: 0.1,
      constraintImportance: 0.3,
      unresolvedDependency: 0,
      discriminatingPower: 0.3,
      validationImportance: 0.2,
      reuseValue: 0.5,
      redundancy: 0.95,
      resolutionCompleteness: 0.95,
    });
    expect(["compacted", "dormant", "archived"]).toContain(
      assessment.recommendedState,
    );
  });

  it("measures stable phase intensity even after context compaction", () => {
    const metrics = calculateContextEfficiency(
      {
        phase: "validation",
        estimatedCharacters: 900,
        preservedInvariantCount: 6,
        missingInvariantCount: 0,
        activeFrameCount: 2,
        compactedFrameCount: 5,
        dormantFrameCount: 8,
        usefulItemCount: 7,
      },
      7200,
    );
    expect(metrics.fidelity).toBe(1);
    expect(metrics.compactionRatio).toBeGreaterThan(0.8);
    expect(metrics.phaseIntensity).toBeGreaterThan(0.75);
  });
});
