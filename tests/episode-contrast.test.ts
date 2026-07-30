import { describe, expect, it } from "vitest";
import {
  analyzeEpisode,
  extractEpisodeContrast,
  type InteractionEpisode,
} from "../src/index.js";

function squareEpisode(): InteractionEpisode {
  return {
    id: "episode-shape-001",
    scope: { projectId: "project-atlas", workflowId: "shape-rendering" },
    initialRequest: {
      rawText: "Create a red square.",
      interpretedIntent: "render_square",
      target: "red square",
      expectedOutcome: "A red shape with equal width and height.",
      constraints: ["equal_dimensions", "red_fill"],
      forbiddenEffects: ["non_equal_dimensions"],
      environment: { renderer: "synthetic" },
    },
    attempts: [
      {
        id: "attempt-rectangle",
        interpretation: "Render a generic red rectangle.",
        actions: ["set width to 80", "set height to 50"],
        result: {
          summary: "A red 80 by 50 rectangle.",
          properties: { width: 80, height: 50, fill: "red" },
          artifactIds: ["artifact-rectangle"],
        },
        userVerdict: "rejected",
        technicalEvidence: [],
        createdAt: "2026-07-30T12:00:00.000Z",
      },
      {
        id: "attempt-square",
        interpretation: "Preserve the square subtype constraint.",
        actions: ["set width to 60", "set height to 60"],
        result: {
          summary: "A red 60 by 60 square.",
          properties: { width: 60, height: 60, fill: "red" },
          artifactIds: ["artifact-square"],
        },
        userVerdict: "accepted",
        technicalEvidence: [
          {
            id: "evidence-equal-dimensions",
            type: "manual_test",
            description: "Width and height are equal.",
            passed: true,
            observedAt: "2026-07-30T12:05:00.000Z",
          },
        ],
        createdAt: "2026-07-30T12:05:00.000Z",
      },
    ],
    startedAt: "2026-07-30T11:55:00.000Z",
    completedAt: "2026-07-30T12:06:00.000Z",
  };
}

describe("interaction episode analysis", () => {
  it("separates accepted and rejected user outcomes", () => {
    const analysis = analyzeEpisode(squareEpisode());

    expect(analysis.acceptedAttemptIds).toEqual(["attempt-square"]);
    expect(analysis.rejectedAttemptIds).toEqual(["attempt-rectangle"]);
    expect(analysis.hasOutcomeContrast).toBe(true);
    expect(analysis.totalPassingEvidence).toBe(1);
  });

  it("extracts discriminating properties without claiming a universal truth", () => {
    const contrast = extractEpisodeContrast(squareEpisode());

    expect(contrast.acceptedAttemptId).toBe("attempt-square");
    expect(contrast.differences.map((item) => item.propertyPath)).toContain(
      "width",
    );
    expect(contrast.differences.map((item) => item.propertyPath)).toContain(
      "height",
    );
    expect(
      contrast.inferredDiscriminators.every(
        (item) => item.status === "candidate" || item.status === "supported",
      ),
    ).toBe(true);
  });

  it("keeps the cause unresolved when no result was accepted", () => {
    const episode = squareEpisode();
    episode.attempts[1] = {
      ...episode.attempts[1]!,
      userVerdict: "rejected",
    };

    const contrast = extractEpisodeContrast(episode);

    expect(contrast.acceptedAttemptId).toBeNull();
    expect(contrast.inferredDiscriminators).toHaveLength(0);
    expect(contrast.unresolvedReasons[0]).toContain("No accepted user outcome");
  });
});
