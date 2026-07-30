import { clonePlainData } from "../utils/clone-plain-data.js";
import { normalizeText, uniqueNormalizedStrings } from "../utils/normalized-set.js";
import { attentionViewSignature } from "./attention-view-generator.js";
import type {
  RecordRejectedViewInput,
  RejectedViewLedger,
  RejectedViewTrace,
  RevisitRejectedViewDecision,
  RevisitRejectedViewInput,
} from "./types.js";

export function createRejectedViewLedger(
  createdAt = new Date().toISOString(),
): RejectedViewLedger {
  return { traces: [], revision: 1, updatedAt: createdAt };
}

export function recordRejectedView(
  input: RecordRejectedViewInput,
): RejectedViewLedger {
  const observedAt = input.observedAt ?? input.view.updatedAt;
  const next = clonePlainData(input.ledger);
  const signature = attentionViewSignature(input.view);
  const existingIndex = next.traces.findIndex(
    (trace) =>
      trace.signature === signature &&
      trace.contextFingerprint === input.contextFingerprint &&
      trace.verdict === input.verdict,
  );
  if (existingIndex < 0) {
    const trace: RejectedViewTrace = {
      id: `rejected-${signature}-${input.verdict}-${input.contextFingerprint}`,
      signature,
      viewId: input.view.id,
      attentionAnchorIds: [...input.view.attentionIds],
      contextFingerprint: input.contextFingerprint,
      verdict: input.verdict,
      rejectionReasons: [...input.view.rejectionReasons],
      violatedConstraintIds: uniqueNormalizedStrings(input.violatedConstraintIds ?? []),
      contradictionIds: uniqueNormalizedStrings(input.contradictionIds ?? []),
      reusableDiscriminators: uniqueNormalizedStrings(input.reusableDiscriminators ?? []),
      revisitConditions: uniqueNormalizedStrings(input.revisitConditions ?? []),
      occurrences: 1,
      firstObservedAt: observedAt,
      lastObservedAt: observedAt,
    };
    next.traces.push(trace);
  } else {
    const existing = next.traces[existingIndex]!;
    next.traces[existingIndex] = {
      ...existing,
      attentionAnchorIds: uniqueNormalizedStrings([
        ...existing.attentionAnchorIds,
        ...input.view.attentionIds,
      ]),
      rejectionReasons: uniqueNormalizedStrings([
        ...existing.rejectionReasons,
        ...input.view.rejectionReasons,
      ]),
      violatedConstraintIds: uniqueNormalizedStrings([
        ...existing.violatedConstraintIds,
        ...(input.violatedConstraintIds ?? []),
      ]),
      contradictionIds: uniqueNormalizedStrings([
        ...existing.contradictionIds,
        ...(input.contradictionIds ?? []),
      ]),
      reusableDiscriminators: uniqueNormalizedStrings([
        ...existing.reusableDiscriminators,
        ...(input.reusableDiscriminators ?? []),
      ]),
      revisitConditions: uniqueNormalizedStrings([
        ...existing.revisitConditions,
        ...(input.revisitConditions ?? []),
      ]),
      occurrences: existing.occurrences + 1,
      lastObservedAt: observedAt,
    };
  }
  next.revision += 1;
  next.updatedAt = observedAt;
  return next;
}

export function canRevisitRejectedView(
  input: RevisitRejectedViewInput,
): RevisitRejectedViewDecision {
  const trace = input.ledger.traces
    .filter((candidate) => candidate.signature === input.signature)
    .sort((left, right) => right.lastObservedAt.localeCompare(left.lastObservedAt))[0];
  if (trace === undefined) {
    return { allowed: true, traceId: null, reason: "No prior rejected View trace matches this signature." };
  }
  if (trace.contextFingerprint !== input.contextFingerprint) {
    return {
      allowed: true,
      traceId: trace.id,
      reason: "The semantic context fingerprint changed, so the old rejection is not binding.",
    };
  }
  const satisfied = new Set(input.satisfiedConditions.map(normalizeText));
  const required = trace.revisitConditions.map(normalizeText);
  if (required.some((condition) => satisfied.has(condition))) {
    return {
      allowed: true,
      traceId: trace.id,
      reason: "At least one explicit revisit condition is now satisfied.",
    };
  }
  return {
    allowed: false,
    traceId: trace.id,
    reason: "The same View was already rejected in this context and no revisit condition changed.",
  };
}
