import type { AttentionRole } from "../attention/types.js";
import { clonePlainData } from "../utils/clone-plain-data.js";
import {
  normalizeText,
  uniqueNormalizedStrings,
  weightedJaccardSimilarity,
} from "../utils/normalized-set.js";
import { stableHash } from "../utils/stable-hash.js";
import type {
  AdaptiveUnlearningPolicy,
  AdaptiveUnlearningPolicyOverrides,
  AdaptiveUnlearningState,
  CognitiveHabit,
  ContextDriftReport,
  CounterfactualViewPlan,
  EvaluateHabitInput,
  EvaluateHabitResult,
  HabitObservation,
  HabitRecoveryEntry,
  ReactivateHabitInput,
  ReactivateHabitResult,
  RelearningPlan,
  UnlearningAction,
  UnlearningDecision,
} from "./types.js";

const DEFAULT_POLICY: AdaptiveUnlearningPolicy = {
  minimumIndependentFailuresForInhibition: 2,
  minimumIndependentFailuresForQuarantine: 4,
  contextDriftThreshold: 0.45,
  contradictionPressureThreshold: 0.62,
  overactivationThreshold: 0.7,
  superiorStrategyThreshold: 0.72,
  automaticityReduction: 0.35,
  applicabilityReduction: 0.4,
};

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function resolvePolicy(
  overrides: AdaptiveUnlearningPolicyOverrides | undefined,
): AdaptiveUnlearningPolicy {
  const policy = { ...DEFAULT_POLICY, ...overrides };
  for (const name of [
    "minimumIndependentFailuresForInhibition",
    "minimumIndependentFailuresForQuarantine",
  ] as const) {
    if (!Number.isInteger(policy[name]) || policy[name] < 1) {
      throw new Error(`${name} must be a positive integer.`);
    }
  }
  for (const name of [
    "contextDriftThreshold",
    "contradictionPressureThreshold",
    "overactivationThreshold",
    "superiorStrategyThreshold",
    "automaticityReduction",
    "applicabilityReduction",
  ] as const) {
    if (!Number.isFinite(policy[name]) || policy[name] < 0 || policy[name] > 1) {
      throw new Error(`${name} must be between 0 and 1.`);
    }
  }
  return policy;
}

export function createAdaptiveUnlearningState(
  habits: CognitiveHabit[] = [],
  updatedAt = new Date().toISOString(),
): AdaptiveUnlearningState {
  return {
    revision: 1,
    habits: clonePlainData(habits),
    inhibitions: [],
    recoveryRegistry: [],
    relearningPlans: [],
    decisions: [],
    updatedAt,
  };
}

export function assessContextDrift(
  habit: CognitiveHabit,
  currentContextFingerprint: string,
  currentDiscriminators: string[],
): ContextDriftReport {
  const fingerprintChanged =
    normalizeText(habit.contextFingerprint) !== normalizeText(currentContextFingerprint);
  const discriminatorSimilarity = weightedJaccardSimilarity(
    habit.contextDiscriminators,
    currentDiscriminators,
  );
  const currentSet = new Set(currentDiscriminators.map(normalizeText));
  const habitSet = new Set(habit.contextDiscriminators.map(normalizeText));
  const changedDiscriminators = uniqueNormalizedStrings([
    ...habit.contextDiscriminators.filter((item) => !currentSet.has(normalizeText(item))),
    ...currentDiscriminators.filter((item) => !habitSet.has(normalizeText(item))),
  ]);
  const missingRequiredDiscriminators = habit.contextDiscriminators.filter(
    (item) => !currentSet.has(normalizeText(item)),
  );
  return {
    habitId: habit.id,
    fingerprintChanged,
    discriminatorSimilarity,
    changedDiscriminators,
    missingRequiredDiscriminators,
    severity: clamp(
      (fingerprintChanged ? 0.3 : 0) +
        (1 - discriminatorSimilarity) * 0.7,
    ),
  };
}

function independentObservations(
  observations: HabitObservation[],
  kinds: HabitObservation["kind"][],
): { keys: string[]; pressure: number } {
  const strongest = new Map<string, number>();
  for (const observation of observations) {
    if (!kinds.includes(observation.kind)) {
      continue;
    }
    strongest.set(
      observation.independenceKey,
      Math.max(strongest.get(observation.independenceKey) ?? 0, clamp(observation.weight)),
    );
  }
  let remaining = 1;
  for (const weight of strongest.values()) {
    remaining *= 1 - weight;
  }
  return { keys: [...strongest.keys()], pressure: 1 - remaining };
}

function determineAction(
  habit: CognitiveHabit,
  observations: HabitObservation[],
  drift: ContextDriftReport,
  policy: AdaptiveUnlearningPolicy,
  replacementHabitId: string | undefined,
): { action: UnlearningAction; reasons: string[]; confidence: number } {
  const failures = independentObservations(observations, ["failure"]);
  const truthChanges = independentObservations(observations, ["truth_supersession"]);
  const superior = independentObservations(observations, ["superior_strategy"]);
  const overactivation = independentObservations(observations, ["overactivation"]);
  const reasons: string[] = [];

  if (truthChanges.pressure >= policy.contradictionPressureThreshold) {
    reasons.push("A scoped truth used by the habit was superseded.");
    return {
      action: replacementHabitId === undefined ? "reopen_unknown" : "supersede",
      reasons,
      confidence: truthChanges.pressure,
    };
  }

  if (
    replacementHabitId !== undefined &&
    superior.pressure >= policy.superiorStrategyThreshold
  ) {
    reasons.push("A better strategy repeatedly outperformed the habit in comparable contexts.");
    return { action: "supersede", reasons, confidence: superior.pressure };
  }

  if (
    failures.keys.length >= policy.minimumIndependentFailuresForQuarantine &&
    failures.pressure >= policy.contradictionPressureThreshold
  ) {
    reasons.push("Independent failures exceeded the quarantine threshold.");
    return { action: "quarantine", reasons, confidence: failures.pressure };
  }

  if (
    drift.severity >= policy.contextDriftThreshold &&
    failures.keys.length >= policy.minimumIndependentFailuresForInhibition
  ) {
    reasons.push("The habit failed after meaningful context drift.");
    return {
      action: "contextually_inhibit",
      reasons,
      confidence: clamp((drift.severity + failures.pressure) / 2),
    };
  }

  if (
    failures.keys.length >= policy.minimumIndependentFailuresForInhibition &&
    drift.missingRequiredDiscriminators.length > 0
  ) {
    reasons.push("The habit was over-generalized beyond its learned discriminators.");
    return { action: "narrow", reasons, confidence: failures.pressure };
  }

  if (
    overactivation.pressure >= policy.overactivationThreshold ||
    (habit.automaticity >= policy.overactivationThreshold && failures.keys.length > 0)
  ) {
    reasons.push("The habit activated too automatically despite contradictory context signals.");
    return {
      action: "challenge",
      reasons,
      confidence: Math.max(overactivation.pressure, habit.automaticity),
    };
  }

  if (failures.keys.length >= policy.minimumIndependentFailuresForInhibition) {
    reasons.push("Repeated failures justify weakening current applicability without erasing history.");
    return { action: "weaken", reasons, confidence: failures.pressure };
  }

  if (failures.keys.length === 1) {
    reasons.push("A single independent failure is recorded but does not justify unlearning.");
    return { action: "challenge", reasons, confidence: failures.pressure * 0.6 };
  }

  reasons.push("No durable evidence currently justifies changing the habit.");
  return {
    action: habit.status === "relearning" ? "relearn" : "retain",
    reasons,
    confidence: clamp(habit.confidence.currentApplicability),
  };
}

function recoveryConditions(
  habit: CognitiveHabit,
  drift: ContextDriftReport,
  action: UnlearningAction,
): string[] {
  if (["contextually_inhibit", "narrow", "weaken", "challenge"].includes(action)) {
    return uniqueNormalizedStrings([
      ...habit.reactivationConditions,
      ...drift.missingRequiredDiscriminators.map((item) => `context-restores:${item}`),
      "new-independent-success",
      "contradiction-resolved",
    ]);
  }
  if (["quarantine", "reopen_unknown", "supersede"].includes(action)) {
    return uniqueNormalizedStrings([
      ...habit.reactivationConditions,
      "explicit-revalidation",
      "new-independent-success",
    ]);
  }
  return [...habit.reactivationConditions];
}

function buildDecision(
  habit: CognitiveHabit,
  observations: HabitObservation[],
  drift: ContextDriftReport,
  actionResult: ReturnType<typeof determineAction>,
  decidedAt: string,
): UnlearningDecision {
  return {
    id: `unlearning-${stableHash({
      habitId: habit.id,
      action: actionResult.action,
      observationIds: observations.map((item) => item.id),
      decidedAt,
    })}`,
    habitId: habit.id,
    action: actionResult.action,
    confidence: clamp(actionResult.confidence),
    reasons: actionResult.reasons,
    triggeringObservationIds: observations.map((item) => item.id),
    affectedDiscriminators: drift.changedDiscriminators,
    reactivationConditions: recoveryConditions(habit, drift, actionResult.action),
    preservedHistoricalSupport: habit.confidence.historicalSupport,
    reversible: actionResult.action !== "supersede",
    decidedAt,
  };
}

function requiredRolesForCounterfactual(habit: CognitiveHabit): AttentionRole[] {
  return uniqueNormalizedStrings([
    "goal",
    "constraint",
    "challenge",
    "exploration",
    "dehabituation",
    ...habit.preferredAttentionRoles.filter((role) => role !== "experience"),
  ]) as AttentionRole[];
}

export function buildCounterfactualViewPlans(
  habit: CognitiveHabit,
  decision: UnlearningDecision,
): CounterfactualViewPlan[] {
  if (["retain", "relearn"].includes(decision.action)) {
    return [];
  }
  const common = {
    habitId: habit.id,
    maximumCost: 0.35,
  };
  return [
    {
      ...common,
      id: `counterfactual-${stableHash({ habitId: habit.id, strategy: "habit_control" })}`,
      strategy: "habit_control",
      excludedPatternIds: [],
      requiredAttentionRoles: uniqueNormalizedStrings(habit.preferredAttentionRoles) as AttentionRole[],
      requiredChecks: ["current-context-match", "forbidden-effects"],
      reason: "Keep the habitual path as a control branch rather than deleting it.",
    },
    {
      ...common,
      id: `counterfactual-${stableHash({ habitId: habit.id, strategy: "without_habit" })}`,
      strategy: "without_habit",
      excludedPatternIds: uniqueNormalizedStrings(habit.preferredViewPatternIds),
      requiredAttentionRoles: requiredRolesForCounterfactual(habit),
      requiredChecks: ["rebuild-from-current-truths", "independent-contradiction"],
      reason: "Explore the current situation without the habitual strategy.",
    },
    {
      ...common,
      id: `counterfactual-${stableHash({ habitId: habit.id, strategy: "inverted_assumption" })}`,
      strategy: "inverted_assumption",
      excludedPatternIds: [],
      requiredAttentionRoles: ["challenge", "uncertainty", "dehabituation"],
      requiredChecks: ["assume-habit-is-inapplicable", "seek-discriminating-evidence"],
      reason: "Test the opposite of the habitual interpretation to expose hidden assumptions.",
    },
    {
      ...common,
      id: `counterfactual-${stableHash({ habitId: habit.id, strategy: "fresh_from_truths" })}`,
      strategy: "fresh_from_truths",
      excludedPatternIds: uniqueNormalizedStrings([
        ...habit.preferredViewPatternIds,
        ...habit.preferredActionPatternIds,
      ]),
      requiredAttentionRoles: ["goal", "constraint", "uncertainty", "exploration"],
      requiredChecks: ["authoritative-truths-only", "current-context-only"],
      reason: "Reconstruct a fresh View from stable truths and the present context.",
    },
  ];
}

function buildRelearningPlan(
  habit: CognitiveHabit,
  decision: UnlearningDecision,
  plans: CounterfactualViewPlan[],
  createdAt: string,
): RelearningPlan | null {
  if (["retain", "challenge"].includes(decision.action)) {
    return null;
  }
  return {
    id: `relearning-${stableHash({ habitId: habit.id, decisionId: decision.id })}`,
    habitId: habit.id,
    preserve: [
      "historical outcomes",
      "original context discriminators",
      "reactivation conditions",
    ],
    suspend: [
      "automatic activation",
      ...(decision.action === "supersede" ? ["current operational authority"] : []),
    ],
    explore: plans.map((plan) => plan.strategy),
    validationRequirements: [
      "independent observable outcome",
      "current-context compatibility",
      "separate outcome success from causal validation",
    ],
    counterfactualViewPlanIds: plans.map((plan) => plan.id),
    status: "planned",
    createdAt,
  };
}

function applyDecisionToHabit(
  habit: CognitiveHabit,
  observations: HabitObservation[],
  drift: ContextDriftReport,
  decision: UnlearningDecision,
  policy: AdaptiveUnlearningPolicy,
  replacementHabitId: string | undefined,
  updatedAt: string,
): CognitiveHabit {
  const failures = independentObservations(observations, ["failure"]);
  const successes = independentObservations(observations, ["success"]);
  const status: CognitiveHabit["status"] =
    decision.action === "contextually_inhibit" || decision.action === "narrow" || decision.action === "weaken"
      ? "inhibited"
      : decision.action === "quarantine" || decision.action === "reopen_unknown"
        ? "quarantined"
        : decision.action === "supersede"
          ? "superseded"
          : decision.action === "relearn"
            ? "relearning"
            : decision.action === "challenge"
              ? "challenged"
              : habit.status;
  return {
    ...clonePlainData(habit),
    contextDiscriminators:
      decision.action === "narrow"
        ? habit.contextDiscriminators.filter(
            (item) => !drift.missingRequiredDiscriminators.includes(item),
          )
        : [...habit.contextDiscriminators],
    independentSuccessKeys: uniqueNormalizedStrings([
      ...habit.independentSuccessKeys,
      ...successes.keys,
    ]),
    independentFailureKeys: uniqueNormalizedStrings([
      ...habit.independentFailureKeys,
      ...failures.keys,
    ]),
    automaticity: clamp(
      habit.automaticity -
        (["challenge", "contextually_inhibit", "narrow", "weaken", "quarantine", "reopen_unknown", "supersede"].includes(decision.action)
          ? policy.automaticityReduction
          : 0),
    ),
    confidence: {
      historicalSupport: habit.confidence.historicalSupport,
      currentApplicability: clamp(
        habit.confidence.currentApplicability -
          (["contextually_inhibit", "narrow", "weaken", "quarantine", "reopen_unknown", "supersede"].includes(decision.action)
            ? policy.applicabilityReduction
            : 0) +
          successes.pressure * 0.12,
      ),
      predictiveReliability: clamp(
        habit.confidence.predictiveReliability +
          successes.pressure * 0.12 -
          failures.pressure * 0.28,
      ),
      contradictionPressure: clamp(
        habit.confidence.contradictionPressure * 0.6 + failures.pressure * 0.5,
      ),
      contextDrift: drift.severity,
    },
    status,
    reactivationConditions: uniqueNormalizedStrings(decision.reactivationConditions),
    supersededByHabitId:
      decision.action === "supersede" ? replacementHabitId ?? habit.supersededByHabitId : habit.supersededByHabitId,
    revision: habit.revision + 1,
    updatedAt,
  };
}

function upsertRecovery(
  entries: HabitRecoveryEntry[],
  habitId: string,
  requiredConditions: string[],
  updatedAt: string,
): HabitRecoveryEntry[] {
  const id = `recovery-${stableHash({ habitId, requiredConditions: [...requiredConditions].sort() })}`;
  const existing = entries.find((entry) => entry.id === id);
  const next: HabitRecoveryEntry = {
    id,
    habitId,
    requiredConditions: uniqueNormalizedStrings(requiredConditions),
    satisfiedConditions: existing?.satisfiedConditions ?? [],
    ready: false,
    updatedAt,
  };
  const index = entries.findIndex((entry) => entry.id === id);
  if (index < 0) {
    return [...entries, next];
  }
  return entries.map((entry, itemIndex) => (itemIndex === index ? next : clonePlainData(entry)));
}

export function evaluateHabitForUnlearning(
  input: EvaluateHabitInput,
): EvaluateHabitResult {
  const policy = resolvePolicy(input.policy);
  const evaluatedAt = input.evaluatedAt ?? input.state.updatedAt;
  const next = clonePlainData(input.state);
  const habitIndex = next.habits.findIndex((habit) => habit.id === input.habitId);
  if (habitIndex < 0) {
    throw new Error(`Unknown cognitive habit: ${input.habitId}.`);
  }
  const habit = next.habits[habitIndex]!;
  const relevant = input.observations.filter((observation) => observation.habitId === habit.id);
  const latest = relevant.at(-1);
  const drift = assessContextDrift(
    habit,
    latest?.currentContextFingerprint ?? habit.contextFingerprint,
    latest?.currentDiscriminators ?? habit.contextDiscriminators,
  );
  const actionResult = determineAction(
    habit,
    relevant,
    drift,
    policy,
    input.replacementHabitId,
  );
  const decision = buildDecision(habit, relevant, drift, actionResult, evaluatedAt);
  const plans = buildCounterfactualViewPlans(habit, decision);
  const relearningPlan = buildRelearningPlan(habit, decision, plans, evaluatedAt);
  next.habits[habitIndex] = applyDecisionToHabit(
    habit,
    relevant,
    drift,
    decision,
    policy,
    input.replacementHabitId,
    evaluatedAt,
  );
  if (["contextually_inhibit", "narrow", "weaken", "quarantine", "reopen_unknown"].includes(decision.action)) {
    next.inhibitions.push({
      id: `inhibition-${stableHash({ habitId: habit.id, decisionId: decision.id })}`,
      habitId: habit.id,
      contextFingerprint: latest?.currentContextFingerprint ?? habit.contextFingerprint,
      reason: decision.reasons.join(" "),
      triggeringObservationIds: decision.triggeringObservationIds,
      reactivationConditions: decision.reactivationConditions,
      active: true,
      createdAt: evaluatedAt,
      releasedAt: null,
    });
    next.recoveryRegistry = upsertRecovery(
      next.recoveryRegistry,
      habit.id,
      decision.reactivationConditions,
      evaluatedAt,
    );
  }
  if (relearningPlan !== null) {
    next.relearningPlans.push(relearningPlan);
  }
  next.decisions.push(decision);
  next.revision += 1;
  next.updatedAt = evaluatedAt;
  return { state: next, decision, drift, counterfactualViewPlans: plans, relearningPlan };
}

export function reactivateHabit(input: ReactivateHabitInput): ReactivateHabitResult {
  const reactivatedAt = input.reactivatedAt ?? input.state.updatedAt;
  const next = clonePlainData(input.state);
  const habitIndex = next.habits.findIndex((habit) => habit.id === input.habitId);
  if (habitIndex < 0) {
    throw new Error(`Unknown cognitive habit: ${input.habitId}.`);
  }
  const entries = next.recoveryRegistry.filter((entry) => entry.habitId === input.habitId);
  if (entries.length === 0) {
    return { state: next, reactivated: false, reason: "No recovery conditions were registered." };
  }
  const satisfied = new Set(input.satisfiedConditions.map(normalizeText));
  let ready = false;
  next.recoveryRegistry = next.recoveryRegistry.map((entry) => {
    if (entry.habitId !== input.habitId) {
      return entry;
    }
    const allSatisfied = entry.requiredConditions.every((condition) =>
      satisfied.has(normalizeText(condition)),
    );
    ready ||= allSatisfied;
    return {
      ...entry,
      satisfiedConditions: uniqueNormalizedStrings([
        ...entry.satisfiedConditions,
        ...input.satisfiedConditions,
      ]),
      ready: allSatisfied,
      updatedAt: reactivatedAt,
    };
  });
  if (!ready) {
    return {
      state: next,
      reactivated: false,
      reason: "The registered recovery conditions are not fully satisfied.",
    };
  }
  const habit = next.habits[habitIndex]!;
  next.habits[habitIndex] = {
    ...habit,
    status: "challenged",
    automaticity: clamp(Math.min(habit.automaticity, 0.45)),
    confidence: {
      ...habit.confidence,
      currentApplicability: clamp(Math.max(habit.confidence.currentApplicability, 0.45)),
      contradictionPressure: clamp(habit.confidence.contradictionPressure * 0.6),
    },
    revision: habit.revision + 1,
    updatedAt: reactivatedAt,
  };
  next.inhibitions = next.inhibitions.map((record) =>
    record.habitId === input.habitId && record.active
      ? { ...record, active: false, releasedAt: reactivatedAt }
      : record,
  );
  next.revision += 1;
  next.updatedAt = reactivatedAt;
  return {
    state: next,
    reactivated: true,
    reason: "The habit was restored as a challenged option, not as an automatic default.",
  };
}
