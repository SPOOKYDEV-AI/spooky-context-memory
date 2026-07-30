import type {
  CapsuleAdmissionAssessment,
  CapsuleAdmissionInput,
  CapsuleAdmissionScores,
} from "./types.js";

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function assessCapsuleAdmission(
  input: CapsuleAdmissionInput,
): CapsuleAdmissionAssessment {
  const acceptedCount = input.analysis.acceptedAttemptIds.length;
  const rejectedCount = input.analysis.rejectedAttemptIds.length;
  const discriminatorCount = input.contrast.inferredDiscriminators.length;
  const claimCount = input.claims.length;
  const verifiedOrSupportedClaims = input.claims.filter(
    (claim) => claim.status === "verified" || claim.status === "supported",
  ).length;
  const totalEvidence =
    input.analysis.totalPassingEvidence + input.analysis.totalFailingEvidence;

  const reusableValue = clamp(
    acceptedCount > 0
      ? 0.35 + Math.min(0.35, discriminatorCount * 0.15) +
          Math.min(0.3, verifiedOrSupportedClaims * 0.1)
      : discriminatorCount * 0.1,
  );
  const diagnosticValue = clamp(
    Math.min(0.6, rejectedCount * 0.2) + Math.min(0.4, claimCount * 0.1),
  );
  const evidenceQuality =
    totalEvidence === 0
      ? 0
      : input.analysis.totalPassingEvidence / totalEvidence;
  const contextCompleteness = clamp(
    (acceptedCount > 0 ? 0.35 : 0) +
      (rejectedCount > 0 ? 0.25 : 0) +
      (discriminatorCount > 0 ? 0.25 : 0) +
      (claimCount > 0 ? 0.15 : 0),
  );
  const contaminationRisk = clamp(
    (acceptedCount === 0 ? 0.35 : 0) +
      (discriminatorCount === 0 ? 0.25 : 0) +
      (input.contrast.unresolvedReasons.length > 0 ? 0.2 : 0) +
      (claimCount === 0 ? 0.2 : 0),
  );
  const total = clamp(
    reusableValue * 0.3 +
      diagnosticValue * 0.2 +
      evidenceQuality * 0.2 +
      contextCompleteness * 0.3 -
      contaminationRisk * 0.35,
  );
  const scores: CapsuleAdmissionScores = {
    reusableValue,
    diagnosticValue,
    evidenceQuality,
    contextCompleteness,
    contaminationRisk,
    total,
  };
  const reasons: string[] = [];

  let decision: CapsuleAdmissionAssessment["decision"];

  if (acceptedCount === 0 && rejectedCount === 0) {
    decision = "reject";
    reasons.push("The episode contains no user-validated outcome signal.");
  } else if (acceptedCount === 0) {
    decision = "request_more_evidence";
    reasons.push(
      "A rejected trajectory is available, but no accepted outcome anchors a reusable correction.",
    );
  } else if (!input.analysis.hasOutcomeContrast) {
    decision = "keep_raw_trace";
    reasons.push(
      "The outcome was accepted, but no rejected attempt exists to isolate what changed.",
    );
  } else if (contaminationRisk > 0.6 || total < 0.45) {
    decision = "request_more_evidence";
    reasons.push(
      "The episode is potentially useful, but its causal boundary is still too uncertain.",
    );
  } else if (input.matchingPatternId) {
    decision = "extend_existing";
    reasons.push(
      `The experience should reinforce or refine pattern "${input.matchingPatternId}" instead of creating a duplicate pattern.`,
    );
  } else {
    decision = "create_candidate";
    reasons.push(
      "The episode has an accepted outcome, a rejected contrast, and enough structured context for a candidate capsule.",
    );
  }

  return {
    decision,
    scores,
    reasons,
    matchingPatternId: input.matchingPatternId ?? null,
  };
}
