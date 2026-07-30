import { describe, expect, it } from "vitest";
import { detectSelfBias } from "../src/index.js";
import { makeTrajectory, now } from "./fixtures/adaptive-memory-fixtures.js";

describe("self-bias monitor", () => {
  it("detects experience overuse", () => {
    const signals = detectSelfBias([
      makeTrajectory({
        attentions: [
          { focusId: "experience", role: "experience", weight: 0.9, status: "dominant" },
          { focusId: "goal", role: "goal", weight: 0.1, status: "active" },
        ],
      }),
    ], undefined, now);

    expect(signals.map((item) => item.kind)).toContain("experience_overuse");
  });

  it("detects contradiction neglect", () => {
    const signals = detectSelfBias([
      makeTrajectory({
        attentions: [
          { focusId: "goal", role: "goal", weight: 0.6, status: "dominant" },
          { focusId: "experience", role: "experience", weight: 0.4, status: "active" },
        ],
      }),
    ], undefined, now);

    expect(signals.map((item) => item.kind)).toContain("contradiction_neglect");
  });

  it("detects dominant View inertia after a poor outcome", () => {
    const trajectories = Array.from({ length: 4 }, (_, index) =>
      makeTrajectory({
        id: `trajectory-${index}`,
        selectedViewId: "view-habitual",
        verdict: index === 3 ? "contradicted" : "supported",
      }),
    );
    const signals = detectSelfBias(trajectories, undefined, now);

    expect(signals.map((item) => item.kind)).toContain("dominant_view_inertia");
  });

  it("detects outcome-cause conflation", () => {
    const signals = detectSelfBias([
      makeTrajectory({
        causalClaimPromoted: true,
        causalValidation: "not_tested",
      }),
    ], undefined, now);

    expect(signals.map((item) => item.kind)).toContain("outcome_cause_conflation");
  });

  it("detects repeated memory over-injection", () => {
    const signals = detectSelfBias([
      makeTrajectory({ visitedMemoryItems: 10, injectedMemoryItems: 8 }),
    ], undefined, now);

    expect(signals.map((item) => item.kind)).toContain("memory_over_injection");
  });

  it("combines inertia and contradiction neglect into confirmation bias", () => {
    const trajectories = Array.from({ length: 4 }, (_, index) =>
      makeTrajectory({
        id: `trajectory-${index}`,
        selectedViewId: "view-habitual",
        verdict: index === 3 ? "contradicted" : "supported",
        attentions: [
          { focusId: "goal", role: "goal", weight: 0.6, status: "dominant" },
          { focusId: "experience", role: "experience", weight: 0.4, status: "active" },
        ],
      }),
    );
    const signals = detectSelfBias(trajectories, undefined, now);

    expect(signals.map((item) => item.kind)).toContain("confirmation_bias");
  });
});
