import { clonePlainData } from "../utils/clone-plain-data.js";
import { uniqueNormalizedStrings } from "../utils/normalized-set.js";
import { stableHash } from "../utils/stable-hash.js";
import type {
  CapsuleAccumulator,
  CapsuleAccumulatorAssessment,
  CapsuleDeposit,
} from "./types.js";

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalized(value: string): string {
  return value.trim();
}

export function createCapsuleAccumulator(
  situationId: string,
  createdAt: string,
): CapsuleAccumulator {
  return {
    id: `accumulator-${stableHash({ situationId, createdAt })}`,
    situationId,
    initialNeed: null,
    observations: [],
    rejectedTrajectories: [],
    acceptedDecisions: [],
    unresolvedItems: [],
    claims: [],
    evidenceIds: [],
    sourceContextIds: [],
    sourceTransitionIds: [],
    completeness: 0,
    stability: 0,
    reusableValue: 0,
    status: "open",
    createdAt,
    updatedAt: createdAt,
    sealedAt: null,
  };
}

export function assessCapsuleAccumulator(
  accumulator: CapsuleAccumulator,
): CapsuleAccumulatorAssessment {
  const hasInitialNeed = accumulator.initialNeed !== null ? 1 : 0;
  const hasTrajectory =
    accumulator.rejectedTrajectories.length > 0 ||
    accumulator.acceptedDecisions.length > 0
      ? 1
      : 0;
  const hasEvidence = accumulator.evidenceIds.length > 0 ? 1 : 0;
  const hasProvenance = accumulator.sourceContextIds.length > 0 ? 1 : 0;
  const hasClaims = accumulator.claims.length > 0 ? 1 : 0;
  const completeness = clamp(
    hasInitialNeed * 0.25 +
      hasTrajectory * 0.2 +
      hasEvidence * 0.2 +
      hasProvenance * 0.2 +
      hasClaims * 0.15,
  );

  const supportedClaims = accumulator.claims.filter(
    (claim) => claim.status === "supported" || claim.status === "verified",
  ).length;
  const disputedClaims = accumulator.claims.filter(
    (claim) => claim.status === "disputed" || claim.status === "refuted",
  ).length;
  const stability = clamp(
    (accumulator.acceptedDecisions.length > 0 ? 0.32 : 0) +
      (hasEvidence ? 0.32 : 0) +
      Math.min(0.28, supportedClaims * 0.09) -
      Math.min(0.35, disputedClaims * 0.15) -
      Math.min(0.25, accumulator.unresolvedItems.length * 0.06),
  );

  const signalKinds = [
    accumulator.observations.length > 0,
    accumulator.rejectedTrajectories.length > 0,
    accumulator.acceptedDecisions.length > 0,
    accumulator.claims.length > 0,
    accumulator.sourceTransitionIds.length > 0,
  ].filter(Boolean).length;
  const reusableValue = clamp(
    signalKinds / 5 * 0.72 +
      Math.min(0.18, accumulator.sourceContextIds.length * 0.05) +
      Math.min(0.1, accumulator.rejectedTrajectories.length * 0.04),
  );

  const blockingReasons: string[] = [];
  if (!hasInitialNeed) {
    blockingReasons.push("The initial need has not been preserved.");
  }
  if (!hasProvenance) {
    blockingReasons.push("No source context preserves provenance.");
  }
  if (!hasEvidence) {
    blockingReasons.push("No validation evidence has been attached.");
  }
  if (accumulator.unresolvedItems.length > 0) {
    blockingReasons.push("Unresolved items still limit consolidation.");
  }

  const recommendedStatus =
    completeness >= 0.72 && stability >= 0.58 && reusableValue >= 0.48
      ? "ready"
      : blockingReasons.length >= 3
        ? "blocked"
        : "open";

  return {
    completeness,
    stability,
    reusableValue,
    recommendedStatus,
    blockingReasons,
  };
}

export function depositIntoCapsuleAccumulator(
  accumulator: CapsuleAccumulator,
  deposit: CapsuleDeposit,
): CapsuleAccumulator {
  if (accumulator.status === "sealed") {
    throw new Error(`Accumulator "${accumulator.id}" is already sealed.`);
  }

  const next = clonePlainData(accumulator);

  switch (deposit.kind) {
    case "initial_need": {
      const value = normalized(deposit.value);
      if (value.length === 0) {
        throw new Error("The initial need must not be empty.");
      }
      next.initialNeed = value;
      break;
    }
    case "observation":
      next.observations = uniqueNormalizedStrings([
        ...next.observations,
        deposit.value,
      ]);
      break;
    case "rejected_trajectory":
      next.rejectedTrajectories = uniqueNormalizedStrings([
        ...next.rejectedTrajectories,
        deposit.value,
      ]);
      break;
    case "accepted_decision":
      next.acceptedDecisions = uniqueNormalizedStrings([
        ...next.acceptedDecisions,
        deposit.value,
      ]);
      break;
    case "unresolved_item":
      next.unresolvedItems = uniqueNormalizedStrings([
        ...next.unresolvedItems,
        deposit.value,
      ]);
      break;
    case "claim":
      if (!next.claims.some((claim) => claim.id === deposit.claim.id)) {
        next.claims.push(clonePlainData(deposit.claim));
      }
      break;
    case "evidence":
      next.evidenceIds = Array.from(
        new Set([...next.evidenceIds, deposit.referenceId]),
      );
      break;
    case "source_context":
      next.sourceContextIds = Array.from(
        new Set([...next.sourceContextIds, deposit.referenceId]),
      );
      break;
    case "source_transition":
      next.sourceTransitionIds = Array.from(
        new Set([...next.sourceTransitionIds, deposit.referenceId]),
      );
      break;
  }

  next.updatedAt = deposit.observedAt;
  const assessment = assessCapsuleAccumulator(next);
  next.completeness = assessment.completeness;
  next.stability = assessment.stability;
  next.reusableValue = assessment.reusableValue;
  next.status = assessment.recommendedStatus;
  return next;
}

export function resolveAccumulatorItem(
  accumulator: CapsuleAccumulator,
  item: string,
  resolvedAt: string,
): CapsuleAccumulator {
  const next = clonePlainData(accumulator);
  const key = item.trim().toLowerCase();
  next.unresolvedItems = next.unresolvedItems.filter(
    (value) => value.trim().toLowerCase() !== key,
  );
  next.updatedAt = resolvedAt;
  const assessment = assessCapsuleAccumulator(next);
  next.completeness = assessment.completeness;
  next.stability = assessment.stability;
  next.reusableValue = assessment.reusableValue;
  next.status = assessment.recommendedStatus;
  return next;
}

export function sealCapsuleAccumulator(
  accumulator: CapsuleAccumulator,
  sealedAt: string,
): CapsuleAccumulator {
  const assessment = assessCapsuleAccumulator(accumulator);
  if (assessment.recommendedStatus !== "ready") {
    throw new Error(
      `Accumulator "${accumulator.id}" cannot be sealed: ${assessment.blockingReasons.join(" ")}`,
    );
  }

  const next = clonePlainData(accumulator);
  next.completeness = assessment.completeness;
  next.stability = assessment.stability;
  next.reusableValue = assessment.reusableValue;
  next.status = "sealed";
  next.sealedAt = sealedAt;
  next.updatedAt = sealedAt;
  return next;
}
