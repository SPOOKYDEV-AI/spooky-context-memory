import { describe, expect, it } from "vitest";
import {
  buildSituation,
  closeSituation,
  transitionSituationPhase,
  updateContextContract,
} from "../src/index.js";

function situation() {
  return buildSituation({
    id: "situation-context-retention",
    scope: { projectId: "project-atlas", workflowId: "memory-design" },
    initialNeed: "Keep the initial context until its useful value is transferred.",
    contextFrameIds: ["context-initial"],
    invariants: ["Preserve the initial need across every phase."],
    discriminatingProperties: ["No eviction without proof of transfer."],
    forbiddenEffects: ["silent_context_loss"],
    acceptanceCriteria: ["Validation still checks the original need."],
    unresolvedQuestions: ["When is compaction safe?"],
    startedAt: "2026-07-30T15:00:00.000Z",
  });
}

describe("situational memory", () => {
  it("pins the initial need in a context contract", () => {
    const current = situation();
    expect(current.contract.initialNeed).toContain("initial context");
    expect(current.contract.invariants).toContain(
      "Preserve the initial need across every phase.",
    );
  });

  it("preserves the contract while reducing retained context between phases", () => {
    const current = situation();
    const convergence = transitionSituationPhase({
      situation: current,
      to: "convergence",
      retainedContextIds: ["context-initial", "context-best-branch"],
      compactedContextIds: ["context-rejected-branches"],
      rejectedTrajectories: ["Drop the initial context as soon as the topic changes."],
      currentGoal: "Define safe context retention boundaries.",
      createdAt: "2026-07-30T15:05:00.000Z",
    });

    expect(convergence.handoff.contractVersion).toBe(2);
    expect(convergence.situation.contract.initialNeed).toBe(
      current.contract.initialNeed,
    );
    expect(convergence.handoff.compactedContextIds).toContain(
      "context-rejected-branches",
    );
  });

  it("rejects invalid phase jumps", () => {
    expect(() =>
      transitionSituationPhase({
        situation: situation(),
        to: "validation",
        retainedContextIds: ["context-initial"],
        createdAt: "2026-07-30T15:05:00.000Z",
      }),
    ).toThrow(/invalid situation phase transition/i);
  });

  it("updates unresolved questions without mutating the original contract", () => {
    const current = situation();
    const updated = updateContextContract(current.contract, {
      resolvedQuestions: ["When is compaction safe?"],
      unresolvedQuestions: ["When is deletion safe?"],
      updatedAt: "2026-07-30T15:06:00.000Z",
    });

    expect(current.contract.unresolvedQuestions).toContain(
      "When is compaction safe?",
    );
    expect(updated.unresolvedQuestions).not.toContain(
      "When is compaction safe?",
    );
    expect(updated.unresolvedQuestions).toContain("When is deletion safe?");
  });

  it("only marks a resolved situation closed after validation", () => {
    let current = situation();
    current = transitionSituationPhase({
      situation: current,
      to: "convergence",
      retainedContextIds: ["context-initial"],
      createdAt: "2026-07-30T15:05:00.000Z",
    }).situation;
    current = transitionSituationPhase({
      situation: current,
      to: "implementation",
      retainedContextIds: ["context-initial"],
      createdAt: "2026-07-30T15:10:00.000Z",
    }).situation;
    current = transitionSituationPhase({
      situation: current,
      to: "validation",
      retainedContextIds: ["context-initial"],
      createdAt: "2026-07-30T15:15:00.000Z",
    }).situation;
    const closed = closeSituation(current, {
      outcome: "accepted",
      state: "resolved",
      closedAt: "2026-07-30T15:20:00.000Z",
    });

    expect(closed.phase).toBe("closed");
    expect(closed.state).toBe("resolved");
    expect(closed.outcome).toBe("accepted");
  });
});
