import { describe, expect, it } from "vitest";
import {
  assessCapsuleAdmission,
  evaluateMemoryClaim,
  type EpisodeAnalysis,
  type EpisodeContrast,
  type MemoryClaim,
} from "../src/index.js";

function claim(overrides: Partial<MemoryClaim> = {}): MemoryClaim {
  return {
    id: "claim-1",
    kind: "root_cause",
    statement: "A subtype constraint was lost during generalization.",
    status: "unverified",
    confidence: 0.6,
    assertedBy: "agent",
    assertedAt: "2026-07-30T12:00:00.000Z",
    derivedFromAttemptIds: ["attempt-1", "attempt-2"],
    evidence: [],
    ...overrides,
  };
}

const contrastedAnalysis: EpisodeAnalysis = {
  episodeId: "episode-1",
  acceptedAttemptIds: ["accepted"],
  rejectedAttemptIds: ["rejected"],
  partiallyAcceptedAttemptIds: [],
  unknownAttemptIds: [],
  latestAcceptedAttemptId: "accepted",
  hasOutcomeContrast: true,
  totalPassingEvidence: 1,
  totalFailingEvidence: 0,
};

const contrast: EpisodeContrast = {
  episodeId: "episode-1",
  acceptedAttemptId: "accepted",
  rejectedAttemptIds: ["rejected"],
  differences: [],
  inferredDiscriminators: [
    {
      propertyPath: "shape.equalDimensions",
      acceptedValue: true,
      confidence: 0.9,
      supportingAttemptIds: ["rejected", "accepted"],
      contradictingAttemptIds: [],
      status: "supported",
    },
  ],
  unresolvedReasons: [],
};

describe("claim evaluation", () => {
  it("does not double count evidence from the same independence group", () => {
    const evaluation = evaluateMemoryClaim(
      claim({
        evidence: [
          {
            evidenceId: "test-1",
            effect: "supports",
            weight: 0.7,
            independenceKey: "same-test-run",
          },
          {
            evidenceId: "test-2",
            effect: "supports",
            weight: 0.9,
            independenceKey: "same-test-run",
          },
        ],
      }),
    );

    expect(evaluation.independentSupportCount).toBe(1);
    expect(evaluation.supportScore).toBe(0.9);
    expect(evaluation.status).toBe("supported");
  });

  it("marks a claim as disputed when independent evidence conflicts", () => {
    const evaluation = evaluateMemoryClaim(
      claim({
        evidence: [
          {
            evidenceId: "support",
            effect: "supports",
            weight: 0.8,
            independenceKey: "run-a",
          },
          {
            evidenceId: "counterexample",
            effect: "contradicts",
            weight: 0.9,
            independenceKey: "run-b",
          },
        ],
      }),
    );

    expect(evaluation.status).toBe("disputed");
  });
});

describe("capsule admission", () => {
  it("creates a candidate for a useful accepted/rejected contrast", () => {
    const assessment = assessCapsuleAdmission({
      analysis: contrastedAnalysis,
      contrast,
      claims: [claim({ status: "supported" })],
    });

    expect(assessment.decision).toBe("create_candidate");
    expect(assessment.scores.contaminationRisk).toBeLessThan(0.5);
  });

  it("extends a matching pattern rather than proposing a duplicate", () => {
    const assessment = assessCapsuleAdmission({
      analysis: contrastedAnalysis,
      contrast,
      claims: [claim({ status: "supported" })],
      matchingPatternId: "pattern-over-generalization",
    });

    expect(assessment.decision).toBe("extend_existing");
    expect(assessment.matchingPatternId).toBe("pattern-over-generalization");
  });

  it("requests more evidence when every attempt was rejected", () => {
    const assessment = assessCapsuleAdmission({
      analysis: {
        ...contrastedAnalysis,
        acceptedAttemptIds: [],
        latestAcceptedAttemptId: null,
        hasOutcomeContrast: false,
      },
      contrast: {
        ...contrast,
        acceptedAttemptId: null,
        inferredDiscriminators: [],
        unresolvedReasons: ["No accepted result."],
      },
      claims: [],
    });

    expect(assessment.decision).toBe("request_more_evidence");
  });
});
