import type {
  ContextReleaseDecision,
  ContextReleaseInput,
} from "./types.js";

function hasTransferDestination(input: ContextReleaseInput): boolean {
  return (
    input.transfer.contractId !== null ||
    input.transfer.accumulatorId !== null ||
    input.transfer.capsuleId !== null
  );
}

export function evaluateContextRelease(
  input: ContextReleaseInput,
): ContextReleaseDecision {
  const blockingConditions: string[] = [];
  const reasons: string[] = [];
  const transfer = input.transfer;

  if (input.frame.retentionState === "pinned") {
    blockingConditions.push("Pinned contexts cannot leave the active set.");
  }
  if (input.activeDependentIds.length > 0) {
    blockingConditions.push(
      `Active dependencies still require this context: ${input.activeDependentIds.join(", ")}.`,
    );
  }
  if (!hasTransferDestination(input)) {
    blockingConditions.push("No persistent transfer destination exists.");
  }
  if (!transfer.initialNeedPreserved) {
    blockingConditions.push("The initial need has not been transferred.");
  }
  if (!transfer.constraintsPreserved) {
    blockingConditions.push("Important constraints have not been transferred.");
  }
  if (!transfer.provenancePreserved) {
    blockingConditions.push("Provenance would be lost by releasing this context.");
  }
  if (!transfer.uncertaintyPreserved) {
    blockingConditions.push("Unresolved uncertainty would be silently lost.");
  }

  if (
    (input.targetState === "dormant" ||
      input.targetState === "archived" ||
      input.targetState === "eligible_for_deletion") &&
    input.situationState === "forming"
  ) {
    blockingConditions.push(
      "A forming situation cannot release context beyond background compaction.",
    );
  }

  if (
    (input.targetState === "archived" ||
      input.targetState === "eligible_for_deletion") &&
    input.situationState === "active"
  ) {
    blockingConditions.push(
      "An active situation cannot archive or delete its supporting context.",
    );
  }

  if (
    input.targetState === "eligible_for_deletion" &&
    input.transfer.capsuleId === null
  ) {
    blockingConditions.push(
      "Permanent deletion requires a consolidated capsule, not only an accumulator.",
    );
  }

  if (
    input.targetState !== "background" &&
    !transfer.decisionsPreserved
  ) {
    blockingConditions.push("Accepted decisions have not been transferred.");
  }

  if (
    (input.targetState === "archived" ||
      input.targetState === "eligible_for_deletion") &&
    !transfer.rejectedTrajectoriesPreserved
  ) {
    blockingConditions.push("Rejected trajectories have not been preserved.");
  }

  if (blockingConditions.length === 0) {
    reasons.push("The context has a verified persistent transfer destination.");
    reasons.push("Initial need, constraints, provenance, and uncertainty remain available.");
    if (transfer.transitionIds.length > 0) {
      reasons.push("The conversational transition path remains reconstructable.");
    }
    if (transfer.evidenceIds.length > 0) {
      reasons.push("Validation evidence remains linked to the compacted memory.");
    }
  }

  return {
    releasable: blockingConditions.length === 0,
    targetState: input.targetState,
    reasons,
    blockingConditions,
    preservedIn: {
      contractId: transfer.contractId,
      accumulatorId: transfer.accumulatorId,
      capsuleId: transfer.capsuleId,
      transitionIds: [...transfer.transitionIds],
      evidenceIds: [...transfer.evidenceIds],
    },
  };
}
