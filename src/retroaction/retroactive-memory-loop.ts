import { advanceMemoryAttentionField } from "../attention/attention-field.js";
import type {
  AttentionCandidate,
  AttentionFeedback,
  AttentionFocus,
} from "../attention/types.js";
import {
  deriveCapsuleRefinementPlans,
  updatePlasticMemoryGraph,
} from "../plasticity/continuous-memory-plasticity.js";
import type { CapsuleOutcomeObservation } from "../plasticity/types.js";
import { normalizeText, uniqueNormalizedStrings } from "../utils/normalized-set.js";
import { stableHash } from "../utils/stable-hash.js";
import { recordRejectedView } from "../views/rejected-view-ledger.js";
import type { AttentionView, AttentionViewVerdict } from "../views/types.js";
import type {
  ApplyRetroactiveLearningInput,
  ApplyRetroactiveLearningResult,
} from "./types.js";

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isPositiveVerdict(verdict: AttentionViewVerdict): boolean {
  return verdict === "supported" || verdict === "partially_supported";
}

function isRejectingVerdict(verdict: AttentionViewVerdict): boolean {
  return [
    "contradicted",
    "context_mismatch",
    "scope_mismatch",
    "truth_conflict",
    "superseded",
    "redundant",
  ].includes(verdict);
}

function feedbackMagnitude(verdict: AttentionViewVerdict, confidence: number): number {
  const base =
    verdict === "supported"
      ? 0.9
      : verdict === "partially_supported"
        ? 0.55
        : verdict === "missing_evidence" || verdict === "unresolved"
          ? 0.3
          : 0.78;
  return clamp(base * confidence);
}

function buildAttentionFeedback(
  view: AttentionView,
  outcome: ApplyRetroactiveLearningInput["outcome"],
): AttentionFeedback[] {
  const magnitude = feedbackMagnitude(outcome.verdict, outcome.confidence);
  const effect: AttentionFeedback["effect"] = isPositiveVerdict(outcome.verdict)
    ? "reinforce"
    : outcome.verdict === "missing_evidence" || outcome.verdict === "unresolved"
      ? "reactivate"
      : "challenge";
  return view.attentionIds.map((focusId) => ({
    id: `attention-feedback-${stableHash({
      outcomeId: outcome.id,
      focusId,
      effect,
    })}`,
    focusId,
    effect,
    magnitude,
    independenceKey: outcome.independenceKey,
    reason: `View ${view.id} received verdict ${outcome.verdict}: ${outcome.actualOutcome}`,
    contextRevision: view.contextRevision,
    observedAt: outcome.observedAt,
  }));
}

function relatedFocuses(
  field: ApplyRetroactiveLearningInput["attentionField"],
  view: AttentionView,
): AttentionFocus[] {
  const ids = new Set(view.attentionIds);
  return field.focuses.filter((focus) => ids.has(focus.id));
}

function buildChallengeAttention(
  input: ApplyRetroactiveLearningInput,
  view: AttentionView,
): AttentionCandidate[] {
  if (isPositiveVerdict(input.outcome.verdict)) {
    return [];
  }
  const related = relatedFocuses(input.attentionField, view);
  const contextAnchorIds = uniqueNormalizedStrings(
    related.flatMap((focus) => focus.contextAnchorIds),
  );
  const truthAnchorIds = uniqueNormalizedStrings([
    ...view.truthAnchorIds,
    ...related.flatMap((focus) => focus.truthAnchorIds),
  ]);
  const scope = related[0]?.scope ?? view.scope;
  const contradictionCandidate: AttentionCandidate = {
    id: `attention-challenge-${stableHash({
      viewId: view.id,
      verdict: input.outcome.verdict,
      contextFingerprint: input.outcome.contextFingerprint,
    })}`,
    targetType:
      input.outcome.verdict === "truth_conflict" ? "truth_anchor" : "contradiction",
    targetId: view.id,
    role: "challenge",
    reason: `Challenge the rejected View using discriminators: ${input.outcome.discriminators.join(", ") || "unknown"}.`,
    scope: { ...scope },
    contextAnchorIds,
    truthAnchorIds,
    goalDependency: 0.55,
    constraintImportance:
      input.outcome.verdict === "scope_mismatch" ||
      input.outcome.verdict === "truth_conflict"
        ? 0.9
        : 0.65,
    uncertainty: 0.85,
    novelty: input.outcome.discriminators.length > 0 ? 0.78 : 0.5,
    risk: input.outcome.verdict === "truth_conflict" ? 0.95 : 0.7,
    expectedInformationGain: 0.88,
    predictiveValue: 0.62,
    persistence: 0.45,
    urgency: 0.8,
  };
  return [contradictionCandidate];
}

function buildCapsuleObservations(
  input: ApplyRetroactiveLearningInput,
): CapsuleOutcomeObservation[] {
  return input.outcome.capsuleIds.map((capsuleId) => ({
    capsuleId,
    viewId: input.outcome.viewId,
    verdict: input.outcome.verdict,
    independentContextKey: input.outcome.independenceKey,
    discriminators: uniqueNormalizedStrings(input.outcome.discriminators),
    confidence: clamp(input.outcome.confidence),
  }));
}

export function applyRetroactiveLearning(
  input: ApplyRetroactiveLearningInput,
): ApplyRetroactiveLearningResult {
  const view = input.triage.views.find(
    (candidate) => candidate.id === input.outcome.viewId,
  );
  if (view === undefined) {
    throw new Error(`Unknown View outcome target: ${input.outcome.viewId}.`);
  }
  const attentionFeedback = buildAttentionFeedback(view, input.outcome);
  const newAttentionCandidates = buildChallengeAttention(input, view);
  const advancedAttention = advanceMemoryAttentionField({
    previous: input.attentionField,
    contextField: input.contextField,
    epistemicCore: input.epistemicCore,
    memoryRevision: input.memoryRevision,
    candidates: newAttentionCandidates,
    feedback: attentionFeedback,
    updatedAt: input.outcome.observedAt,
  });
  let ledger = input.rejectedViewLedger;
  if (!isPositiveVerdict(input.outcome.verdict)) {
    ledger = recordRejectedView({
      ledger,
      view,
      verdict: input.outcome.verdict,
      contextFingerprint: input.outcome.contextFingerprint,
      contradictionIds:
        input.outcome.verdict === "contradicted"
          ? [input.outcome.id]
          : [],
      reusableDiscriminators: input.outcome.discriminators,
      revisitConditions: input.outcome.revisitConditions,
      observedAt: input.outcome.observedAt,
    });
  }
  const plasticity = updatePlasticMemoryGraph(
    input.plasticMemoryGraph,
    input.outcome.linkObservations,
    input.outcome.observedAt,
  );
  const capsuleRefinementPlans = deriveCapsuleRefinementPlans(
    buildCapsuleObservations(input),
  );
  const invalidatedViewIds = isRejectingVerdict(input.outcome.verdict)
    ? [view.id]
    : [];
  const reconsideredViewIds =
    input.outcome.verdict === "missing_evidence" ||
    input.outcome.verdict === "unresolved" ||
    input.outcome.verdict === "partially_supported"
      ? [view.id]
      : [];
  const generatedDiscriminators = uniqueNormalizedStrings([
    ...input.outcome.discriminators,
    ...(normalizeText(input.outcome.expectedOutcome) ===
    normalizeText(input.outcome.actualOutcome)
      ? []
      : [`expected:${input.outcome.expectedOutcome}`, `actual:${input.outcome.actualOutcome}`]),
  ]);

  return {
    attentionField: advancedAttention.field,
    rejectedViewLedger: ledger,
    plasticity,
    capsuleRefinementPlans,
    signals: {
      attentionFeedback,
      newAttentionCandidates,
      invalidatedViewIds,
      reconsideredViewIds,
      generatedDiscriminators,
    },
  };
}
