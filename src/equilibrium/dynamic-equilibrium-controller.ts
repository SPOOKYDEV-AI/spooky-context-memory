import { getAttentionRoleCoverage } from "../attention/attention-field.js";
import type { AttentionRole } from "../attention/types.js";
import { uniqueNormalizedStrings } from "../utils/normalized-set.js";
import type {
  DynamicEquilibriumPolicy,
  DynamicEquilibriumPolicyOverrides,
  DynamicEquilibriumResult,
  EquilibriumBand,
  EquilibriumDimension,
  EquilibriumSnapshot,
  EvaluateDynamicEquilibriumInput,
  RebalanceDecision,
} from "./types.js";

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

const DEFAULT_BAND: EquilibriumBand = {
  minimum: 0.15,
  targetLow: 0.35,
  targetHigh: 0.78,
  maximum: 0.95,
};

const DEFAULT_POLICY: DynamicEquilibriumPolicy = {
  bands: {
    goal_fidelity: { minimum: 0.35, targetLow: 0.6, targetHigh: 1, maximum: 1 },
    constraint_coverage: { minimum: 0.3, targetLow: 0.55, targetHigh: 1, maximum: 1 },
    attention_diversity: { minimum: 0.2, targetLow: 0.35, targetHigh: 0.8, maximum: 1 },
    view_diversity: { minimum: 0.15, targetLow: 0.3, targetHigh: 0.75, maximum: 1 },
    challenge_coverage: { minimum: 0.12, targetLow: 0.25, targetHigh: 0.7, maximum: 1 },
    uncertainty_coverage: { minimum: 0.12, targetLow: 0.25, targetHigh: 0.8, maximum: 1 },
    exploration_depth: { minimum: 0.1, targetLow: 0.25, targetHigh: 0.75, maximum: 0.95 },
    exploration_breadth: { minimum: 0.15, targetLow: 0.3, targetHigh: 0.8, maximum: 1 },
    injection_efficiency: { minimum: 0.4, targetLow: 0.65, targetHigh: 1, maximum: 1 },
    stability: { minimum: 0.3, targetLow: 0.55, targetHigh: 0.9, maximum: 1 },
    plasticity: { minimum: 0.2, targetLow: 0.4, targetHigh: 0.85, maximum: 1 },
  },
  dominanceHysteresis: 0.08,
  maximumDominanceSwitches: 3,
  criticalDebtThreshold: 0.62,
  minimumCorrectionConfidence: 0.45,
};

function resolveBand(
  base: EquilibriumBand,
  override: Partial<EquilibriumBand> | undefined,
): EquilibriumBand {
  const band = { ...base, ...override };
  if (
    band.minimum > band.targetLow ||
    band.targetLow > band.targetHigh ||
    band.targetHigh > band.maximum
  ) {
    throw new Error("Equilibrium band values must be monotonically ordered.");
  }
  return band;
}

function resolvePolicy(
  overrides: DynamicEquilibriumPolicyOverrides | undefined,
): DynamicEquilibriumPolicy {
  const dimensions = Object.keys(DEFAULT_POLICY.bands) as EquilibriumDimension[];
  const bands = Object.fromEntries(
    dimensions.map((dimension) => [
      dimension,
      resolveBand(
        DEFAULT_POLICY.bands[dimension] ?? DEFAULT_BAND,
        overrides?.bands?.[dimension],
      ),
    ]),
  ) as Record<EquilibriumDimension, EquilibriumBand>;
  return {
    ...DEFAULT_POLICY,
    ...overrides,
    bands,
  };
}

function normalizedRoleWeight(
  coverage: Record<AttentionRole, number>,
  role: AttentionRole,
): number {
  return clamp(coverage[role]);
}

function uniqueCountRatio(values: string[], expected: number): number {
  return expected <= 0 ? 0 : clamp(new Set(values).size / expected);
}

function switchCount(history: string[]): number {
  let switches = 0;
  for (let index = 1; index < history.length; index += 1) {
    if (history[index] !== history[index - 1]) {
      switches += 1;
    }
  }
  return switches;
}

function dimensionOutOfBand(value: number, band: EquilibriumBand): boolean {
  return value < band.minimum || value > band.maximum;
}

function createDecision(
  action: RebalanceDecision["action"],
  targetIds: string[],
  reason: string,
  triggeringSignals: string[],
  expectedEffect: string,
  confidence: number,
  reversible = true,
): RebalanceDecision {
  return {
    action,
    targetIds: uniqueNormalizedStrings(targetIds),
    reason,
    triggeringSignals: uniqueNormalizedStrings(triggeringSignals),
    expectedEffect,
    confidence: clamp(confidence),
    reversible,
  };
}

export function evaluateDynamicEquilibrium(
  input: EvaluateDynamicEquilibriumInput,
): DynamicEquilibriumResult {
  const policy = resolvePolicy(input.policy);
  const roles = getAttentionRoleCoverage(input.attentionField);
  const activeAttentionCount = input.attentionField.activeFocusIds.length;
  const activeViewCount = input.triage.activeViewIds.length;
  const switches = switchCount(input.observation.dominantViewHistory);
  const injectionEfficiency =
    input.observation.visitedMemoryItems === 0
      ? 1
      : clamp(
          1 -
            input.observation.injectedMemoryItems /
              Math.max(1, input.observation.visitedMemoryItems),
        );
  const challenge = normalizedRoleWeight(roles, "challenge");
  const uncertainty = normalizedRoleWeight(roles, "uncertainty");
  const risk = normalizedRoleWeight(roles, "risk");
  const exploration = normalizedRoleWeight(roles, "exploration");
  const dimensions: EquilibriumSnapshot["dimensions"] = {
    goal_fidelity: clamp(
      normalizedRoleWeight(roles, "goal") +
        input.triage.consensus.commonAttentionIds.length * 0.04,
    ),
    constraint_coverage: clamp(
      normalizedRoleWeight(roles, "constraint") + risk * 0.3,
    ),
    attention_diversity: uniqueCountRatio(
      input.attentionField.activeFocusIds.flatMap((id) => {
        const focus = input.attentionField.focuses.find((item) => item.id === id);
        return focus === undefined ? [] : [focus.role];
      }),
      6,
    ),
    view_diversity: clamp(
      activeViewCount / Math.max(1, input.attentionField.policy.maxActiveFocuses),
    ),
    challenge_coverage: clamp(challenge + input.triage.consensus.divergences.length * 0.08),
    uncertainty_coverage: clamp(
      uncertainty +
        input.observation.explorationDebt.filter((item) => item.coverage > 0).length *
          0.05,
    ),
    exploration_depth: clamp(input.observation.averageExplorationDepth / 8),
    exploration_breadth: clamp((activeViewCount + exploration * 2) / 6),
    injection_efficiency: injectionEfficiency,
    stability: clamp(1 - switches / Math.max(1, policy.maximumDominanceSwitches + 1)),
    plasticity: clamp(
      0.25 +
        (input.observation.changedContextIds.length > 0 ? 0.25 : 0) +
        (input.observation.changedTruthAnchorIds.length > 0 ? 0.2 : 0) +
        challenge * 0.15 +
        uncertainty * 0.15,
    ),
  };
  const outOfBandDimensions = (
    Object.keys(dimensions) as EquilibriumDimension[]
  ).filter((dimension) =>
    dimensionOutOfBand(dimensions[dimension], policy.bands[dimension]),
  );
  const criticalExplorationDebtIds = input.observation.explorationDebt
    .filter(
      (item) =>
        item.criticality * item.riskIfIgnored * (1 - item.coverage) >=
        policy.criticalDebtThreshold,
    )
    .map((item) => item.id);
  const oscillationDetected = switches > policy.maximumDominanceSwitches;
  const now = input.evaluatedAt ?? input.attentionField.updatedAt;
  const snapshot: EquilibriumSnapshot = {
    revision: (input.previousSnapshot?.revision ?? 0) + 1,
    dimensions,
    outOfBandDimensions,
    criticalExplorationDebtIds,
    oscillationDetected,
    dominantViewId: input.triage.dominantViewId,
    dominantAttentionId: input.attentionField.dominantFocusId,
    createdAt: now,
  };
  const decisions: RebalanceDecision[] = [];

  if (dimensions.goal_fidelity < policy.bands.goal_fidelity.minimum) {
    const target = input.attentionField.focuses
      .filter((focus) => focus.role === "goal")
      .map((focus) => focus.id);
    decisions.push(
      createDecision(
        "PIN_INVARIANT",
        target,
        "Goal attention fell below the protected fidelity band.",
        ["low_goal_fidelity"],
        "Restore the initial need before deeper exploration.",
        0.88,
        false,
      ),
    );
  }

  if (
    dimensions.view_diversity < policy.bands.view_diversity.minimum ||
    dimensions.challenge_coverage < policy.bands.challenge_coverage.minimum
  ) {
    decisions.push(
      createDecision(
        "SPAWN_ALTERNATIVE",
        input.attentionField.focuses
          .filter((focus) => ["challenge", "uncertainty", "exploration"].includes(focus.role))
          .map((focus) => focus.id),
        "The current beam lacks enough independent perspectives.",
        ["low_view_diversity", "low_challenge_coverage"],
        "Generate a cheap contradictory or exploratory View.",
        0.76,
      ),
    );
  }

  if (criticalExplorationDebtIds.length > 0) {
    decisions.push(
      createDecision(
        "REQUEST_EVIDENCE",
        criticalExplorationDebtIds,
        "Critical unresolved questions are not adequately covered by active Views.",
        ["critical_exploration_debt"],
        "Acquire discriminating evidence before consolidation.",
        0.9,
      ),
    );
    decisions.push(
      createDecision(
        "FREEZE_CONSOLIDATION",
        criticalExplorationDebtIds,
        "Consolidating while critical uncertainty remains would overstate confidence.",
        ["critical_exploration_debt"],
        "Keep claims and capsules provisional until coverage improves.",
        0.86,
        false,
      ),
    );
  }

  if (oscillationDetected) {
    decisions.push(
      createDecision(
        "DEFER_VIEW",
        input.observation.dominantViewHistory.slice(-2),
        "Dominance changed too frequently without stable progress.",
        ["dominance_oscillation"],
        "Apply hysteresis and preserve both hypotheses as alternatives.",
        0.82,
      ),
    );
    decisions.push(
      createDecision(
        "REQUEST_EVIDENCE",
        input.observation.dominantViewHistory.slice(-2),
        "Oscillation indicates that ranking evidence is not discriminating enough.",
        ["dominance_oscillation"],
        "Seek one observation capable of separating the competing Views.",
        0.8,
      ),
    );
  }

  if (dimensions.injection_efficiency < policy.bands.injection_efficiency.minimum) {
    decisions.push(
      createDecision(
        "REDUCE_INJECTION",
        input.triage.activeViewIds,
        "Too much inspected memory is being injected into the agent context.",
        ["low_injection_efficiency"],
        "Keep exploration broad while reconstructing a smaller final memory.",
        0.84,
      ),
    );
  }

  if (
    dimensions.exploration_depth < policy.bands.exploration_depth.minimum &&
    input.triage.dominantViewId !== null &&
    criticalExplorationDebtIds.length === 0
  ) {
    decisions.push(
      createDecision(
        "DEEPEN_VIEW",
        [input.triage.dominantViewId],
        "A dominant View exists but has not yet received enough depth.",
        ["shallow_dominant_view"],
        "Spend additional budget on the most promising local frontier.",
        0.68,
      ),
    );
  }

  if (
    dimensions.exploration_breadth > policy.bands.exploration_breadth.maximum ||
    activeAttentionCount > input.attentionField.policy.maxActiveFocuses
  ) {
    decisions.push(
      createDecision(
        "DECAY_ATTENTION",
        input.attentionField.backgroundFocusIds,
        "The active search is too dispersed for its current evidence quality.",
        ["excessive_breadth"],
        "Move low-value focuses to background without deleting their memory.",
        0.72,
      ),
    );
  }

  if (decisions.length === 0) {
    decisions.push(
      createDecision(
        "MAINTAIN",
        uniqueNormalizedStrings([
          ...(input.triage.dominantViewId === null ? [] : [input.triage.dominantViewId]),
          ...(input.attentionField.dominantFocusId === null
            ? []
            : [input.attentionField.dominantFocusId]),
        ]),
        "All monitored dimensions remain inside their acceptable control bands.",
        ["within_equilibrium_bands"],
        "Continue incremental observation without global recomputation.",
        0.7,
      ),
    );
  }

  const filtered = decisions.filter(
    (decision) =>
      decision.confidence >= policy.minimumCorrectionConfidence ||
      decision.action === "MAINTAIN",
  );
  return {
    snapshot,
    decisions: filtered,
    balanced:
      outOfBandDimensions.length === 0 &&
      criticalExplorationDebtIds.length === 0 &&
      !oscillationDetected,
  };
}
