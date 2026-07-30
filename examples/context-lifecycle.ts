import {
  applyContextRelease,
  buildSituation,
  createCapsuleAccumulator,
  createEmptyContextField,
  depositIntoCapsuleAccumulator,
  evaluateContextRelease,
  pinContextFrame,
  sealCapsuleAccumulator,
  transitionSituationPhase,
  unpinContextFrame,
  updateContextField,
  type ContextTransferRecord,
  type MemoryClaim,
} from "../src/index.js";

const startedAt = "2026-07-30T18:00:00.000Z";

let contextField = updateContextField(createEmptyContextField(startedAt), {
  topic: "Design context retention",
  intent: "design_context_retention",
  summary: "Keep the initial need until its useful value is safely transferred.",
  scope: { projectId: "project-atlas", workflowId: "context-design" },
  turnId: "turn-1",
  observedAt: startedAt,
}).field;

const initialContextId = contextField.frames[0]!.id;
contextField = pinContextFrame(
  contextField,
  initialContextId,
  "Initial need must survive every phase.",
);

contextField = updateContextField(contextField, {
  topic: "Build a capsule accumulator",
  intent: "accumulate_memory",
  scope: { projectId: "project-atlas", workflowId: "context-design" },
  turnId: "turn-2",
  observedAt: "2026-07-30T18:01:00.000Z",
  explicitShift: true,
  bridge: "Retention requirements led to progressive capsule accumulation.",
}).field;

let situation = buildSituation({
  id: "situation-atlas-context-retention",
  scope: { projectId: "project-atlas", workflowId: "context-design" },
  initialNeed: "Keep the initial context until safe transfer is proven.",
  currentGoal: "Define a proof-based context release gate.",
  contextFrameIds: contextField.frames.map((frame) => frame.id),
  transitionIds: contextField.transitions.map((transition) => transition.id),
  invariants: ["No eviction without proof of transfer."],
  forbiddenEffects: ["silent_context_loss"],
  acceptanceCriteria: ["Validation still checks the initial need."],
  startedAt,
});

situation = transitionSituationPhase({
  situation,
  to: "convergence",
  retainedContextIds: [initialContextId],
  compactedContextIds: contextField.frames
    .filter((frame) => frame.id !== initialContextId)
    .map((frame) => frame.id),
  requiredNextChecks: ["Verify that provenance and uncertainty survive."],
  createdAt: "2026-07-30T18:02:00.000Z",
}).situation;

const claim: MemoryClaim = {
  id: "claim-transfer-before-release",
  kind: "resolution",
  statement: "Release context only after verified transfer.",
  status: "supported",
  confidence: 0.85,
  assertedBy: "agent",
  assertedAt: "2026-07-30T18:03:00.000Z",
  derivedFromAttemptIds: ["accepted-release-gate"],
  evidence: [
    {
      evidenceId: "test-context-release",
      effect: "supports",
      weight: 1,
      independenceKey: "context-release-regression",
    },
  ],
};

let accumulator = createCapsuleAccumulator(
  situation.id,
  "2026-07-30T18:03:00.000Z",
);

for (const deposit of [
  {
    kind: "initial_need" as const,
    value: situation.initialNeed,
    observedAt: "2026-07-30T18:03:00.000Z",
  },
  {
    kind: "observation" as const,
    value: "The old context remains active during topic overlap.",
    observedAt: "2026-07-30T18:04:00.000Z",
  },
  {
    kind: "rejected_trajectory" as const,
    value: "Evict context based only on age.",
    observedAt: "2026-07-30T18:05:00.000Z",
  },
  {
    kind: "accepted_decision" as const,
    value: "Use a proof-based release gate.",
    observedAt: "2026-07-30T18:06:00.000Z",
  },
  {
    kind: "claim" as const,
    claim,
    observedAt: "2026-07-30T18:07:00.000Z",
  },
  {
    kind: "evidence" as const,
    referenceId: "test-context-release",
    observedAt: "2026-07-30T18:08:00.000Z",
  },
  {
    kind: "source_context" as const,
    referenceId: initialContextId,
    observedAt: "2026-07-30T18:09:00.000Z",
  },
  {
    kind: "source_transition" as const,
    referenceId: contextField.transitions[0]!.id,
    observedAt: "2026-07-30T18:10:00.000Z",
  },
]) {
  accumulator = depositIntoCapsuleAccumulator(accumulator, deposit);
}

const sealed = sealCapsuleAccumulator(
  accumulator,
  "2026-07-30T18:11:00.000Z",
);

const transfer: ContextTransferRecord = {
  contractId: situation.contract.id,
  accumulatorId: sealed.id,
  capsuleId: null,
  transitionIds: contextField.transitions.map((transition) => transition.id),
  evidenceIds: ["test-context-release"],
  initialNeedPreserved: true,
  constraintsPreserved: true,
  decisionsPreserved: true,
  rejectedTrajectoriesPreserved: true,
  provenancePreserved: true,
  uncertaintyPreserved: true,
};

const initialFrame = contextField.frames.find(
  (frame) => frame.id === initialContextId,
)!;
const beforeUnpin = evaluateContextRelease({
  frame: initialFrame,
  targetState: "dormant",
  situationState: "resolved",
  activeDependentIds: [],
  transfer,
});

console.log(beforeUnpin.releasable); // false: the frame is still pinned

contextField = unpinContextFrame(contextField, initialContextId, {
  transferVerified: true,
  updatedAt: "2026-07-30T18:12:00.000Z",
});

const releasableFrame = contextField.frames.find(
  (frame) => frame.id === initialContextId,
)!;
contextField = applyContextRelease(
  contextField,
  {
    frame: releasableFrame,
    targetState: "dormant",
    situationState: "resolved",
    activeDependentIds: [],
    transfer,
  },
  "2026-07-30T18:13:00.000Z",
);

console.log(
  contextField.frames.find((frame) => frame.id === initialContextId)
    ?.retentionState,
); // dormant
