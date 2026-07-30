import type { AttentionRole } from "../attention/types.js";
import type { EpistemicCore } from "../epistemic/types.js";
import type { PlasticMemoryGraph } from "../plasticity/types.js";
import {
  applyReflectiveLearning,
} from "../reflection/reflective-memory-engine.js";
import type {
  CognitiveTrajectory,
  ReflectiveLearningPolicyOverrides,
  ReflectiveMemoryState,
} from "../reflection/types.js";
import {
  applyRetroactiveLearning,
} from "../retroaction/retroactive-memory-loop.js";
import type {
  ApplyRetroactiveLearningResult,
  ViewOutcomeFeedback,
} from "../retroaction/types.js";
import type { ContextField } from "../contexts/types.js";
import type { MemoryAttentionField } from "../attention/types.js";
import type { RejectedViewLedger, CrossViewTriageResult } from "../views/types.js";
import {
  evaluateHabitForUnlearning,
} from "../unlearning/adaptive-unlearning-engine.js";
import type {
  AdaptiveUnlearningPolicyOverrides,
  AdaptiveUnlearningState,
  CounterfactualViewPlan,
  HabitObservation,
  RelearningPlan,
  UnlearningDecision,
} from "../unlearning/types.js";
import {
  applyUnderstandingObservations,
} from "../understanding/global-understanding.js";
import type {
  GlobalRevisionDecision,
  GlobalUnderstandingModel,
  GlobalUnderstandingPolicyOverrides,
  GlobalUnderstandingState,
  UnderstandingObservation,
} from "../understanding/types.js";
import { stableHash } from "../utils/stable-hash.js";
import { uniqueNormalizedStrings } from "../utils/normalized-set.js";

export interface CompleteAdaptiveMemoryEvolutionInput {
  attentionField: MemoryAttentionField;
  contextField: ContextField;
  epistemicCore: EpistemicCore;
  memoryRevision: number;
  triage: CrossViewTriageResult;
  rejectedViewLedger: RejectedViewLedger;
  plasticMemoryGraph: PlasticMemoryGraph;
  outcome: ViewOutcomeFeedback;
  trajectory: CognitiveTrajectory;
  reflectiveMemory: ReflectiveMemoryState;
  adaptiveUnlearning: AdaptiveUnlearningState;
  globalUnderstanding: GlobalUnderstandingState;
  habitId?: string;
  habitObservations?: HabitObservation[];
  replacementHabitId?: string;
  understandingObservations?: UnderstandingObservation[];
  replacementUnderstandingModel?: GlobalUnderstandingModel;
  reflectivePolicy?: ReflectiveLearningPolicyOverrides;
  unlearningPolicy?: AdaptiveUnlearningPolicyOverrides;
  understandingPolicy?: GlobalUnderstandingPolicyOverrides;
  completedAt?: string;
}

export interface NextCycleGuidance {
  attentionRoleWeights: Partial<Record<AttentionRole, number>>;
  requiredAttentionRoles: AttentionRole[];
  minimumAlternativeViews: number;
  contradictionBudget: number;
  maximumVisitedMemoryItems: number | null;
  maximumInjectedMemoryItems: number | null;
  blockedHabitIds: string[];
  counterfactualViewPlans: CounterfactualViewPlan[];
  relearningPlanIds: string[];
  globalRevisionAction: GlobalRevisionDecision["action"];
  mirrorLearningAccepted: boolean;
  warnings: string[];
}

export interface CompleteAdaptiveMemoryEvolutionResult {
  retroactive: ApplyRetroactiveLearningResult;
  reflectiveMemory: ReflectiveMemoryState;
  adaptiveUnlearning: AdaptiveUnlearningState;
  globalUnderstanding: GlobalUnderstandingState;
  unlearningDecision: UnlearningDecision | null;
  counterfactualViewPlans: CounterfactualViewPlan[];
  relearningPlan: RelearningPlan | null;
  globalRevisionDecision: GlobalRevisionDecision;
  nextCycleGuidance: NextCycleGuidance;
}

function outcomeObservation(
  input: CompleteAdaptiveMemoryEvolutionInput,
  completedAt: string,
): UnderstandingObservation {
  const positive =
    input.outcome.verdict === "supported" ||
    input.outcome.verdict === "partially_supported";
  return {
    id: `understanding-outcome-${stableHash({
      outcomeId: input.outcome.id,
      viewId: input.outcome.viewId,
    })}`,
    kind: "view_outcome",
    effect: positive ? "supports" : "challenges",
    targetIds: uniqueNormalizedStrings([
      input.globalUnderstanding.dominantModelId,
      input.outcome.viewId,
      ...input.outcome.capsuleIds,
    ]),
    weight: input.outcome.confidence,
    independenceKey: input.outcome.independenceKey,
    contextFingerprint: input.outcome.contextFingerprint,
    scope: { ...input.trajectory.scope },
    reason: `View ${input.outcome.viewId} received verdict ${input.outcome.verdict}.`,
    observedAt: completedAt,
  };
}

function reflectiveObservation(
  input: CompleteAdaptiveMemoryEvolutionInput,
  mirrorLearningAccepted: boolean,
  completedAt: string,
): UnderstandingObservation {
  return {
    id: `understanding-reflection-${stableHash({
      trajectoryId: input.trajectory.id,
      mirrorLearningAccepted,
    })}`,
    kind: "reflective_signal",
    effect: mirrorLearningAccepted ? "supports" : "challenges",
    targetIds: [input.globalUnderstanding.dominantModelId],
    weight: mirrorLearningAccepted ? 0.42 : 0.28,
    independenceKey: `reflection:${input.trajectory.independentOutcomeKey}`,
    contextFingerprint: input.trajectory.contextFingerprint,
    scope: { ...input.trajectory.scope },
    reason: mirrorLearningAccepted
      ? "A grounded cognitive trajectory improved the strategy model."
      : "Mirror learning was denied because the trajectory lacked sufficient grounding.",
    observedAt: completedAt,
  };
}

function unlearningObservation(
  input: CompleteAdaptiveMemoryEvolutionInput,
  decision: UnlearningDecision | null,
  completedAt: string,
): UnderstandingObservation[] {
  if (decision === null || decision.action === "retain") {
    return [];
  }
  return [
    {
      id: `understanding-unlearning-${stableHash({ decisionId: decision.id })}`,
      kind: "unlearning_signal",
      effect:
        decision.action === "supersede" || decision.action === "reopen_unknown"
          ? "challenges"
          : decision.action === "narrow"
            ? "narrows"
            : "challenges",
      targetIds: uniqueNormalizedStrings([
        input.globalUnderstanding.dominantModelId,
        decision.habitId,
      ]),
      weight: decision.confidence,
      independenceKey: `unlearning:${decision.id}`,
      contextFingerprint: input.trajectory.contextFingerprint,
      scope: { ...input.trajectory.scope },
      reason: decision.reasons.join(" "),
      observedAt: completedAt,
    },
  ];
}

function buildGuidance(
  reflective: ReturnType<typeof applyReflectiveLearning>,
  decision: UnlearningDecision | null,
  counterfactualViewPlans: CounterfactualViewPlan[],
  relearningPlan: RelearningPlan | null,
  globalRevisionDecision: GlobalRevisionDecision,
): NextCycleGuidance {
  const cognitivePolicy = reflective.cognitivePolicy;
  const requiredRoles = uniqueNormalizedStrings([
    ...(cognitivePolicy === null
      ? []
      : Object.entries(cognitivePolicy.roleWeights)
          .filter(([, weight]) => weight >= 0.08)
          .map(([role]) => role)),
    ...counterfactualViewPlans.flatMap((plan) => plan.requiredAttentionRoles),
    ...(decision !== null && decision.action !== "retain" ? ["dehabituation"] : []),
  ]) as AttentionRole[];
  const warnings = uniqueNormalizedStrings([
    ...reflective.analysis.warnings,
    ...reflective.newBiasSignals.flatMap((signal) => signal.reasons),
    ...(globalRevisionDecision.action === "global_revision" &&
    globalRevisionDecision.replacementModelId === null
      ? ["Global revision pressure is high, but no replacement understanding model was supplied."]
      : []),
  ]);
  return {
    attentionRoleWeights: cognitivePolicy?.roleWeights ?? {},
    requiredAttentionRoles: requiredRoles,
    minimumAlternativeViews: cognitivePolicy?.minimumAlternativeViews ?? 1,
    contradictionBudget: cognitivePolicy?.contradictionBudget ?? 0.12,
    maximumVisitedMemoryItems: cognitivePolicy?.maximumVisitedMemoryItems ?? null,
    maximumInjectedMemoryItems: cognitivePolicy?.maximumInjectedMemoryItems ?? null,
    blockedHabitIds:
      decision !== null &&
      ["contextually_inhibit", "narrow", "weaken", "quarantine", "supersede", "reopen_unknown"].includes(
        decision.action,
      )
        ? [decision.habitId]
        : [],
    counterfactualViewPlans,
    relearningPlanIds: relearningPlan === null ? [] : [relearningPlan.id],
    globalRevisionAction: globalRevisionDecision.action,
    mirrorLearningAccepted: reflective.mirrorLearningAccepted,
    warnings,
  };
}

export function completeAdaptiveMemoryEvolution(
  input: CompleteAdaptiveMemoryEvolutionInput,
): CompleteAdaptiveMemoryEvolutionResult {
  const completedAt = input.completedAt ?? input.trajectory.completedAt;
  const retroactive = applyRetroactiveLearning({
    attentionField: input.attentionField,
    contextField: input.contextField,
    epistemicCore: input.epistemicCore,
    memoryRevision: input.memoryRevision,
    triage: input.triage,
    rejectedViewLedger: input.rejectedViewLedger,
    plasticMemoryGraph: input.plasticMemoryGraph,
    outcome: input.outcome,
  });
  const reflective = applyReflectiveLearning({
    state: input.reflectiveMemory,
    trajectory: input.trajectory,
    ...(input.reflectivePolicy === undefined ? {} : { policy: input.reflectivePolicy }),
    updatedAt: completedAt,
  });
  let adaptiveUnlearning = input.adaptiveUnlearning;
  let unlearningDecision: UnlearningDecision | null = null;
  let counterfactualViewPlans: CounterfactualViewPlan[] = [];
  let relearningPlan: RelearningPlan | null = null;
  if (input.habitId !== undefined) {
    const unlearning = evaluateHabitForUnlearning({
      state: adaptiveUnlearning,
      habitId: input.habitId,
      observations: input.habitObservations ?? [],
      ...(input.replacementHabitId === undefined
        ? {}
        : { replacementHabitId: input.replacementHabitId }),
      ...(input.unlearningPolicy === undefined ? {} : { policy: input.unlearningPolicy }),
      evaluatedAt: completedAt,
    });
    adaptiveUnlearning = unlearning.state;
    unlearningDecision = unlearning.decision;
    counterfactualViewPlans = unlearning.counterfactualViewPlans;
    relearningPlan = unlearning.relearningPlan;
  }
  const observations = [
    outcomeObservation(input, completedAt),
    reflectiveObservation(input, reflective.mirrorLearningAccepted, completedAt),
    ...unlearningObservation(input, unlearningDecision, completedAt),
    ...(input.understandingObservations ?? []),
  ];
  const understanding = applyUnderstandingObservations({
    state: input.globalUnderstanding,
    observations,
    ...(input.replacementUnderstandingModel === undefined
      ? {}
      : { replacementModel: input.replacementUnderstandingModel }),
    ...(input.understandingPolicy === undefined
      ? {}
      : { policy: input.understandingPolicy }),
    updatedAt: completedAt,
  });
  return {
    retroactive,
    reflectiveMemory: reflective.state,
    adaptiveUnlearning,
    globalUnderstanding: understanding.state,
    unlearningDecision,
    counterfactualViewPlans,
    relearningPlan,
    globalRevisionDecision: understanding.decision,
    nextCycleGuidance: buildGuidance(
      reflective,
      unlearningDecision,
      counterfactualViewPlans,
      relearningPlan,
      understanding.decision,
    ),
  };
}
