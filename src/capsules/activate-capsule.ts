import { clonePlainData } from "../utils/clone-plain-data.js";
import type {
  CapsuleActivationDecision,
  CapsuleActivationFailureCode,
  CapsuleActivationRequest,
  ExperienceCapsule,
} from "./types.js";

export class CapsuleActivationError extends Error {
  public readonly failureCodes: CapsuleActivationFailureCode[];

  public constructor(decision: CapsuleActivationDecision) {
    super(decision.reasons.join(" "));
    this.name = "CapsuleActivationError";
    this.failureCodes = decision.failureCodes;
  }
}

export function evaluateCapsuleActivation(
  capsule: ExperienceCapsule,
  request: CapsuleActivationRequest,
): CapsuleActivationDecision {
  const failureCodes: CapsuleActivationFailureCode[] = [];
  const reasons: string[] = [];
  const requestedMinimumEvidence =
    request.policy?.minimumPassingEvidence ?? 1;
  const minimumPassingEvidence = Number.isFinite(requestedMinimumEvidence)
    ? Math.max(1, Math.floor(requestedMinimumEvidence))
    : 1;
  const requireAllEvidenceToPass =
    request.policy?.requireAllEvidenceToPass ?? true;

  if (capsule.lifecycle.status !== "candidate") {
    failureCodes.push("CAPSULE_NOT_CANDIDATE");
    reasons.push("Only a candidate capsule can be activated.");
  }

  if (!request.approval.approved) {
    failureCodes.push("USER_APPROVAL_REQUIRED");
    reasons.push("Explicit user approval is required before activation.");
  }

  if (
    request.approval.approvedBy.trim().length === 0 ||
    request.approval.approvedAt.trim().length === 0
  ) {
    failureCodes.push("USER_APPROVAL_METADATA_REQUIRED");
    reasons.push("The approval must identify who approved the capsule and when.");
  }


  if (
    request.approval.scope &&
    (!request.approval.scope.outcomeAccepted ||
      !request.approval.scope.reusableAsMemory)
  ) {
    failureCodes.push("USER_OUTCOME_ACCEPTANCE_REQUIRED");
    reasons.push(
      "Activation requires an accepted user outcome and explicit permission to reuse the episode as memory.",
    );
  }

  const passingEvidence = capsule.validation.evidence.filter(
    (evidence) => evidence.passed,
  );
  const failedEvidence = capsule.validation.evidence.filter(
    (evidence) => !evidence.passed,
  );

  if (passingEvidence.length < minimumPassingEvidence) {
    failureCodes.push("PASSING_EVIDENCE_REQUIRED");
    reasons.push(
      `At least ${minimumPassingEvidence} passing validation evidence item(s) are required.`,
    );
  }

  if (requireAllEvidenceToPass && failedEvidence.length > 0) {
    failureCodes.push("FAILED_EVIDENCE_PRESENT");
    reasons.push("All attached validation evidence must pass before activation.");
  }

  if (failureCodes.length === 0) {
    reasons.push(
      "The capsule has explicit user approval and sufficient passing evidence.",
    );
  }

  return {
    allowed: failureCodes.length === 0,
    failureCodes,
    reasons,
  };
}

export function activateCapsule(
  capsule: ExperienceCapsule,
  request: CapsuleActivationRequest,
): ExperienceCapsule {
  const decision = evaluateCapsuleActivation(capsule, request);

  if (!decision.allowed) {
    throw new CapsuleActivationError(decision);
  }

  const activatedAt = request.activatedAt ?? new Date().toISOString();
  const approvalEvidenceId = `user-outcome-${request.approval.approvedAt}`;
  const approvalEvidence = {
    id: approvalEvidenceId,
    type: "user_acceptance" as const,
    description:
      request.approval.comment?.trim() ||
      "The user accepted the final outcome for the original request.",
    passed: true,
    observedAt: request.approval.approvedAt,
    sourceId: request.approval.approvedBy,
  };
  const existingEvidence = capsule.validation.evidence.some(
    (evidence) => evidence.id === approvalEvidenceId,
  );
  const outcomeClaim = {
    id: `${capsule.id}-claim-outcome-fit`,
    kind: "outcome_fit" as const,
    statement: "The final result matched the user's requested outcome.",
    status: "verified" as const,
    confidence: 1,
    assertedBy: request.approval.approvedBy.trim(),
    assertedAt: request.approval.approvedAt,
    derivedFromAttemptIds: [],
    evidence: [
      {
        evidenceId: approvalEvidenceId,
        effect: "supports" as const,
        weight: 1,
        independenceKey: `user:${request.approval.approvedBy.trim()}`,
      },
    ],
  };

  return {
    ...clonePlainData(capsule),
    claims: [
      ...clonePlainData(capsule.claims).filter(
        (claim) => claim.id !== outcomeClaim.id,
      ),
      outcomeClaim,
    ],
    validation: {
      ...clonePlainData(capsule.validation),
      userApproval: clonePlainData(request.approval),
      evidence: existingEvidence
        ? clonePlainData(capsule.validation.evidence)
        : [...clonePlainData(capsule.validation.evidence), approvalEvidence],
    },
    lifecycle: {
      ...clonePlainData(capsule.lifecycle),
      status: "active",
      activatedAt,
    },
  };
}
