import { describe, expect, it } from "vitest";
import {
  activeTruthAnchors,
  applyTruthChallenges,
  createEpistemicCore,
  upsertTruthAnchor,
} from "../src/index.js";

const source = {
  id: "source-project-spec",
  type: "documentation" as const,
  trust: 0.95,
  independenceKey: "project-spec-v1",
  observedAt: "2026-07-30T18:00:00.000Z",
};

function core() {
  return createEpistemicCore(
    [
      {
        id: "truth-node-version",
        statement: "The runtime requires Node.js 20 or later.",
        state: "authoritative",
        scope: { projectId: "project-atlas" },
        sourceIds: [source.id],
        confidence: 0.98,
        validFrom: "2026-07-30T18:00:00.000Z",
      },
    ],
    [source],
    "2026-07-30T18:00:00.000Z",
  );
}

describe("epistemic core", () => {
  it("rejects truth anchors that reference unknown sources", () => {
    expect(() =>
      createEpistemicCore(
        [
          {
            statement: "Unknown source statement.",
            state: "observed",
            scope: {},
            sourceIds: ["missing-source"],
            confidence: 0.7,
            validFrom: "2026-07-30T18:00:00.000Z",
          },
        ],
        [],
      ),
    ).toThrow(/unknown source ids/i);
  });

  it("records a weak contradiction without displacing an authoritative truth", () => {
    const result = applyTruthChallenges(
      core(),
      "truth-node-version",
      [
        {
          id: "challenge-weak",
          anchorId: "truth-node-version",
          kind: "contradicts",
          sourceIds: [source.id],
          weight: 0.2,
          independenceKey: "single-unverified-report",
          reason: "A weak report mentions Node.js 18.",
          observedAt: "2026-07-30T18:05:00.000Z",
        },
      ],
      "2026-07-30T18:05:00.000Z",
    );

    expect(result.decision.resultingState).toBe("authoritative");
    expect(result.core.anchors[0]?.contradictionIds).toContain("challenge-weak");
  });

  it("disputes a truth only when independent contradiction is proportional to its authority", () => {
    const result = applyTruthChallenges(
      core(),
      "truth-node-version",
      [
        {
          id: "challenge-a",
          anchorId: "truth-node-version",
          kind: "contradicts",
          sourceIds: [source.id],
          weight: 0.8,
          independenceKey: "official-runtime-check",
          reason: "The current runtime manifest contradicts the old requirement.",
          observedAt: "2026-07-30T18:05:00.000Z",
        },
        {
          id: "challenge-b",
          anchorId: "truth-node-version",
          kind: "contradicts",
          sourceIds: [source.id],
          weight: 0.75,
          independenceKey: "independent-build-matrix",
          reason: "The build matrix confirms the contradiction.",
          observedAt: "2026-07-30T18:06:00.000Z",
        },
      ],
      "2026-07-30T18:06:00.000Z",
    );

    expect(result.decision.resultingState).toBe("disputed");
    expect(result.decision.confidence).toBeLessThan(0.98);
  });

  it("supersedes a scoped truth with a sufficiently authoritative replacement", () => {
    const result = applyTruthChallenges(
      core(),
      "truth-node-version",
      [
        {
          id: "supersession",
          anchorId: "truth-node-version",
          kind: "supersedes",
          sourceIds: [source.id],
          weight: 0.95,
          independenceKey: "new-project-spec",
          reason: "A new official specification raises the minimum runtime.",
          observedAt: "2026-07-31T08:00:00.000Z",
          replacement: {
            id: "truth-node-version-v2",
            statement: "The runtime requires Node.js 22 or later.",
            state: "authoritative",
            scope: { projectId: "project-atlas" },
            sourceIds: [source.id],
            confidence: 0.99,
            validFrom: "2026-07-31T08:00:00.000Z",
          },
        },
      ],
      "2026-07-31T08:00:00.000Z",
    );

    expect(result.core.anchors.find((anchor) => anchor.id === "truth-node-version")?.status).toBe(
      "superseded",
    );
    expect(result.core.anchors.find((anchor) => anchor.id === "truth-node-version-v2")?.status).toBe(
      "active",
    );
    expect(result.decision.createdAnchorId).toBe("truth-node-version-v2");
  });

  it("keeps validity scoped in time and supports deterministic upserts", () => {
    const updated = upsertTruthAnchor(
      core(),
      {
        id: "truth-node-version",
        statement: "The runtime requires Node.js 20 or later.",
        state: "verified",
        scope: { projectId: "project-atlas" },
        sourceIds: [source.id],
        confidence: 0.96,
        validFrom: "2026-07-30T18:00:00.000Z",
        validUntil: "2026-08-01T00:00:00.000Z",
      },
      "2026-07-30T19:00:00.000Z",
    );

    expect(updated.anchors).toHaveLength(1);
    expect(updated.anchors[0]?.revision).toBe(2);
    expect(activeTruthAnchors(updated, "2026-07-31T00:00:00.000Z")).toHaveLength(1);
    expect(activeTruthAnchors(updated, "2026-08-02T00:00:00.000Z")).toHaveLength(0);
  });
});
