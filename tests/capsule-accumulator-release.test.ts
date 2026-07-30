import { describe, expect, it } from "vitest";
import {
  applyContextRelease,
  assessCapsuleAccumulator,
  createCapsuleAccumulator,
  createEmptyContextField,
  depositIntoCapsuleAccumulator,
  evaluateContextRelease,
  sealCapsuleAccumulator,
  updateContextField,
  type ContextTransferRecord,
  type MemoryClaim,
} from "../src/index.js";

const claim: MemoryClaim = {
  id: "claim-context-release",
  kind: "resolution",
  statement: "Release context only after verified transfer.",
  status: "supported",
  confidence: 0.82,
  assertedBy: "agent",
  assertedAt: "2026-07-30T16:00:00.000Z",
  derivedFromAttemptIds: ["attempt-accepted"],
  evidence: [
    {
      evidenceId: "test-release-gate",
      effect: "supports",
      weight: 1,
      independenceKey: "release-gate-test",
    },
  ],
};

function readyAccumulator() {
  let accumulator = createCapsuleAccumulator(
    "situation-release",
    "2026-07-30T16:00:00.000Z",
  );
  accumulator = depositIntoCapsuleAccumulator(accumulator, {
    kind: "initial_need",
    value: "Preserve the initial context until transfer is complete.",
    observedAt: "2026-07-30T16:01:00.000Z",
  });
  accumulator = depositIntoCapsuleAccumulator(accumulator, {
    kind: "observation",
    value: "A new topic does not immediately erase the old context.",
    observedAt: "2026-07-30T16:02:00.000Z",
  });
  accumulator = depositIntoCapsuleAccumulator(accumulator, {
    kind: "rejected_trajectory",
    value: "Evict by age alone.",
    observedAt: "2026-07-30T16:03:00.000Z",
  });
  accumulator = depositIntoCapsuleAccumulator(accumulator, {
    kind: "accepted_decision",
    value: "Use a transfer gate before release.",
    observedAt: "2026-07-30T16:04:00.000Z",
  });
  accumulator = depositIntoCapsuleAccumulator(accumulator, {
    kind: "claim",
    claim,
    observedAt: "2026-07-30T16:05:00.000Z",
  });
  accumulator = depositIntoCapsuleAccumulator(accumulator, {
    kind: "evidence",
    referenceId: "test-release-gate",
    observedAt: "2026-07-30T16:06:00.000Z",
  });
  accumulator = depositIntoCapsuleAccumulator(accumulator, {
    kind: "source_context",
    referenceId: "context-initial",
    observedAt: "2026-07-30T16:07:00.000Z",
  });
  accumulator = depositIntoCapsuleAccumulator(accumulator, {
    kind: "source_transition",
    referenceId: "transition-initial-new",
    observedAt: "2026-07-30T16:08:00.000Z",
  });
  return accumulator;
}

function transfer(accumulatorId: string): ContextTransferRecord {
  return {
    contractId: "contract-release",
    accumulatorId,
    capsuleId: null,
    transitionIds: ["transition-initial-new"],
    evidenceIds: ["test-release-gate"],
    initialNeedPreserved: true,
    constraintsPreserved: true,
    decisionsPreserved: true,
    rejectedTrajectoriesPreserved: true,
    provenancePreserved: true,
    uncertaintyPreserved: true,
  };
}

describe("capsule accumulation", () => {
  it("becomes ready only after need, provenance, evidence, and reusable signals exist", () => {
    const accumulator = readyAccumulator();
    const assessment = assessCapsuleAccumulator(accumulator);
    expect(assessment.recommendedStatus).toBe("ready");
    expect(assessment.completeness).toBeGreaterThanOrEqual(0.72);
  });

  it("does not auto-activate memory and requires explicit sealing", () => {
    const accumulator = readyAccumulator();
    expect(accumulator.status).toBe("ready");
    const sealed = sealCapsuleAccumulator(
      accumulator,
      "2026-07-30T16:10:00.000Z",
    );
    expect(sealed.status).toBe("sealed");
    expect(accumulator.status).toBe("ready");
  });

  it("rejects new deposits after sealing", () => {
    const sealed = sealCapsuleAccumulator(
      readyAccumulator(),
      "2026-07-30T16:10:00.000Z",
    );
    expect(() =>
      depositIntoCapsuleAccumulator(sealed, {
        kind: "observation",
        value: "Late mutation",
        observedAt: "2026-07-30T16:11:00.000Z",
      }),
    ).toThrow(/sealed/i);
  });
});

describe("context release gate", () => {
  const field = updateContextField(
    createEmptyContextField("2026-07-30T16:00:00.000Z"),
    {
      topic: "Initial context retention",
      intent: "retain_context",
      scope: { projectId: "project-atlas" },
      turnId: "turn-initial",
      observedAt: "2026-07-30T16:00:00.000Z",
    },
  ).field;
  const frame = field.frames[0]!;

  it("blocks release when useful information has no transfer destination", () => {
    const decision = evaluateContextRelease({
      frame,
      targetState: "dormant",
      situationState: "active",
      activeDependentIds: [],
      transfer: {
        contractId: null,
        accumulatorId: null,
        capsuleId: null,
        transitionIds: [],
        evidenceIds: [],
        initialNeedPreserved: false,
        constraintsPreserved: false,
        decisionsPreserved: false,
        rejectedTrajectoriesPreserved: false,
        provenancePreserved: false,
        uncertaintyPreserved: false,
      },
    });
    expect(decision.releasable).toBe(false);
    expect(decision.blockingConditions.length).toBeGreaterThan(3);
  });

  it("allows dormant release after verified transfer", () => {
    const accumulator = sealCapsuleAccumulator(
      readyAccumulator(),
      "2026-07-30T16:10:00.000Z",
    );
    const decision = evaluateContextRelease({
      frame,
      targetState: "dormant",
      situationState: "resolved",
      activeDependentIds: [],
      transfer: transfer(accumulator.id),
    });
    expect(decision.releasable).toBe(true);
  });

  it("applies a permitted release without deleting the frame", () => {
    const accumulator = sealCapsuleAccumulator(
      readyAccumulator(),
      "2026-07-30T16:10:00.000Z",
    );
    const released = applyContextRelease(
      field,
      {
        frame,
        targetState: "dormant",
        situationState: "resolved",
        activeDependentIds: [],
        transfer: transfer(accumulator.id),
      },
      "2026-07-30T16:12:00.000Z",
    );
    expect(released.frames[0]?.retentionState).toBe("dormant");
    expect(released.frames[0]?.activation).toBe(0);
  });
});
