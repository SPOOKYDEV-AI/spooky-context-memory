import { describe, expect, it } from "vitest";
import {
  advanceMemoryAttentionField,
  createEpistemicCore,
  createMemoryAttentionField,
  getAttentionRoleCoverage,
  type AttentionCandidate,
  type ContextField,
} from "../src/index.js";

const epistemicCore = createEpistemicCore([], [], "2026-07-30T18:00:00.000Z");

function contextField(revision = 1, dormant = false): ContextField {
  return {
    revision,
    updatedAt: `2026-07-30T18:0${revision}:00.000Z`,
    transitions: [],
    frames: [
      {
        id: "context-memory",
        topic: "Attention-driven memory",
        intent: "allocate_attention",
        summary: "Keep multiple perspectives active.",
        scope: { projectId: "project-atlas" },
        activation: dormant ? 0 : 1,
        relevance: dormant ? 0 : 1,
        inertia: 0.8,
        activationState: dormant ? "dormant" : "dominant",
        retentionState: dormant ? "dormant" : "pinned",
        introducedAt: "2026-07-30T18:00:00.000Z",
        lastReactivatedAt: "2026-07-30T18:00:00.000Z",
        parentFrameIds: [],
        sourceTurnIds: ["turn-1"],
        protectedReasons: ["Preserve the initial need."],
      },
    ],
  };
}

function candidate(
  id: string,
  role: AttentionCandidate["role"],
  targetId = id,
  overrides: Partial<AttentionCandidate> = {},
): AttentionCandidate {
  return {
    id,
    targetType:
      role === "goal"
        ? "goal"
        : role === "constraint"
          ? "constraint"
          : role === "uncertainty"
            ? "unknown"
            : role === "challenge"
              ? "contradiction"
              : "pattern",
    targetId,
    role,
    reason: `Observe ${targetId}.`,
    scope: { projectId: "project-atlas" },
    contextAnchorIds: ["context-memory"],
    truthAnchorIds: [],
    goalDependency: role === "goal" ? 1 : 0.5,
    constraintImportance: role === "constraint" ? 1 : 0.5,
    uncertainty: role === "uncertainty" ? 1 : 0.4,
    novelty: 0.6,
    risk: role === "challenge" ? 0.8 : 0.5,
    expectedInformationGain: 0.7,
    predictiveValue: 0.6,
    persistence: 0.6,
    urgency: 0.5,
    ...overrides,
  };
}

describe("memory attention field", () => {
  it("keeps a bounded, diverse active portfolio", () => {
    const field = createMemoryAttentionField({
      contextField: contextField(),
      epistemicCore,
      memoryRevision: 1,
      candidates: [
        candidate("focus-goal", "goal"),
        candidate("focus-constraint", "constraint"),
        candidate("focus-unknown", "uncertainty"),
        candidate("focus-experience", "experience"),
        candidate("focus-challenge", "challenge"),
      ],
      policy: { maxActiveFocuses: 4 },
    });

    const coverage = getAttentionRoleCoverage(field);
    expect(field.activeFocusIds).toHaveLength(4);
    expect(coverage.goal).toBeGreaterThan(0);
    expect(coverage.constraint).toBeGreaterThan(0);
    expect(coverage.uncertainty).toBeGreaterThan(0);
    expect(coverage.experience).toBeGreaterThan(0);
  });

  it("merges redundant attentions instead of spending duplicate budgets", () => {
    const field = createMemoryAttentionField({
      contextField: contextField(),
      epistemicCore,
      memoryRevision: 1,
      candidates: [
        candidate("focus-a", "goal", "initial-need"),
        candidate("focus-b", "goal", "initial-need", { urgency: 0.8 }),
      ],
    });

    expect(field.focuses).toHaveLength(1);
    expect(field.focuses[0]?.weight).toBeGreaterThan(0);
  });

  it("keeps pinned attention active even when another focus scores higher", () => {
    const field = createMemoryAttentionField({
      contextField: contextField(),
      epistemicCore,
      memoryRevision: 1,
      candidates: [
        candidate("focus-pinned", "goal", "initial-need", {
          pinned: true,
          urgency: 0.1,
        }),
        candidate("focus-risk", "challenge", "critical-risk", {
          risk: 1,
          urgency: 1,
          expectedInformationGain: 1,
        }),
      ],
      policy: { minimumRoleCoverage: [] },
    });

    expect(field.focuses.find((focus) => focus.id === "focus-pinned")?.status).toBe("pinned");
    expect(field.activeFocusIds).toContain("focus-pinned");
  });

  it("releases stale unpinned attention without deleting its historical focus", () => {
    const initial = createMemoryAttentionField({
      contextField: contextField(),
      epistemicCore,
      memoryRevision: 1,
      candidates: [candidate("focus-old", "experience")],
      policy: { maxStaleContextRevisions: 0 },
    });
    const advanced = advanceMemoryAttentionField({
      previous: initial,
      contextField: contextField(2, true),
      epistemicCore,
      memoryRevision: 2,
      candidates: [],
      feedback: [],
    });

    expect(advanced.releasedFocusIds).toContain("focus-old");
    expect(advanced.field.focuses.find((focus) => focus.id === "focus-old")?.status).toBe(
      "released",
    );
  });

  it("uses independent feedback to challenge a misleading focus", () => {
    const initial = createMemoryAttentionField({
      contextField: contextField(),
      epistemicCore,
      memoryRevision: 1,
      candidates: [candidate("focus-pattern", "experience")],
    });
    const before = initial.focuses[0]!.weight;
    const advanced = advanceMemoryAttentionField({
      previous: initial,
      contextField: contextField(2),
      epistemicCore,
      memoryRevision: 2,
      candidates: [],
      feedback: [
        {
          id: "feedback-1",
          focusId: "focus-pattern",
          effect: "challenge",
          magnitude: 0.9,
          independenceKey: "outcome-context-b",
          reason: "The historical pattern did not apply.",
          contextRevision: 2,
          observedAt: "2026-07-30T18:02:00.000Z",
        },
      ],
    });

    expect(advanced.field.focuses[0]!.weight).toBeLessThan(before);
    expect(advanced.field.focuses[0]!.independentChallengeKeys).toContain(
      "outcome-context-b",
    );
  });

  it("reactivates a dormant focus when new context justifies it", () => {
    const initial = createMemoryAttentionField({
      contextField: contextField(),
      epistemicCore,
      memoryRevision: 1,
      candidates: [candidate("focus-return", "experience")],
      policy: { maxActiveFocuses: 1, maxBackgroundFocuses: 0 },
    });
    const dormant = {
      ...initial,
      focuses: initial.focuses.map((focus) => ({
        ...focus,
        status: "dormant" as const,
      })),
      activeFocusIds: [],
      dominantFocusId: null,
    };
    const advanced = advanceMemoryAttentionField({
      previous: dormant,
      contextField: contextField(2),
      epistemicCore,
      memoryRevision: 2,
      candidates: [],
      feedback: [
        {
          id: "feedback-return",
          focusId: "focus-return",
          effect: "reactivate",
          magnitude: 0.8,
          independenceKey: "return-to-context",
          reason: "The conversation returned to the prior situation.",
          contextRevision: 2,
          observedAt: "2026-07-30T18:02:00.000Z",
        },
      ],
    });

    expect(advanced.reactivatedFocusIds).toContain("focus-return");
    expect(advanced.field.activeFocusIds).toContain("focus-return");
  });
});
