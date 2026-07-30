import type { AttentionRole } from "../attention/types.js";
import { clonePlainData } from "../utils/clone-plain-data.js";
import {
  normalizeText,
  uniqueNormalizedStrings,
  weightedJaccardSimilarity,
} from "../utils/normalized-set.js";
import { stableHash } from "../utils/stable-hash.js";
import type {
  ApplyReflectiveLearningInput,
  ApplyReflectiveLearningResult,
  CognitivePolicyProfile,
  CognitiveTrajectory,
  ReflectiveAttentionPattern,
  ReflectiveCapsule,
  ReflectiveLearningPolicy,
  ReflectiveLearningPolicyOverrides,
  ReflectiveMemoryState,
  SelfBiasSignal,
  ViewSuccessAnalysis,
} from "./types.js";

const ATTENTION_ROLES: AttentionRole[] = [
  "goal",
  "constraint",
  "uncertainty",
  "experience",
  "challenge",
  "transition",
  "risk",
  "exploration",
  "reflection",
  "dehabituation",
];

const DEFAULT_POLICY: ReflectiveLearningPolicy = {
  maximumStoredTrajectories: 200,
  minimumIndependentSuccessesForSupport: 2,
  minimumIndependentSuccessesForValidation: 4,
  minimumExternalGroundingKeys: 1,
  biasWindowSize: 12,
  experienceOveruseThreshold: 0.55,
  contradictionNeglectThreshold: 0.08,
  dominantViewInertiaThreshold: 0.75,
  injectionRatioThreshold: 0.5,
};

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function resolvePolicy(
  overrides: ReflectiveLearningPolicyOverrides | undefined,
): ReflectiveLearningPolicy {
  const policy = { ...DEFAULT_POLICY, ...overrides };
  for (const name of [
    "maximumStoredTrajectories",
    "minimumIndependentSuccessesForSupport",
    "minimumIndependentSuccessesForValidation",
    "minimumExternalGroundingKeys",
    "biasWindowSize",
  ] as const) {
    if (!Number.isInteger(policy[name]) || policy[name] < 1) {
      throw new Error(`${name} must be a positive integer.`);
    }
  }
  for (const name of [
    "experienceOveruseThreshold",
    "contradictionNeglectThreshold",
    "dominantViewInertiaThreshold",
    "injectionRatioThreshold",
  ] as const) {
    if (!Number.isFinite(policy[name]) || policy[name] < 0 || policy[name] > 1) {
      throw new Error(`${name} must be between 0 and 1.`);
    }
  }
  return policy;
}

function normalizedRoleWeights(trajectory: CognitiveTrajectory): Record<AttentionRole, number> {
  const weights = Object.fromEntries(ATTENTION_ROLES.map((role) => [role, 0])) as Record<
    AttentionRole,
    number
  >;
  for (const attention of trajectory.attentions) {
    weights[attention.role] += clamp(attention.weight);
  }
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    return weights;
  }
  for (const role of ATTENTION_ROLES) {
    weights[role] = clamp(weights[role] / total);
  }
  return weights;
}

function verdictOutcomeFit(verdict: CognitiveTrajectory["verdict"]): number {
  switch (verdict) {
    case "supported":
      return 1;
    case "partially_supported":
      return 0.68;
    case "missing_evidence":
    case "unresolved":
      return 0.38;
    case "redundant":
    case "superseded":
      return 0.28;
    case "contradicted":
    case "context_mismatch":
    case "scope_mismatch":
    case "truth_conflict":
      return 0;
  }
}

function causalFit(trajectory: CognitiveTrajectory): number {
  switch (trajectory.causalValidation) {
    case "verified":
      return 1;
    case "supported":
      return 0.72;
    case "unsupported":
      return 0.25;
    case "refuted":
      return 0;
    case "not_tested":
      return 0.15;
  }
}

export function analyzeCognitiveTrajectory(
  trajectory: CognitiveTrajectory,
  minimumExternalGroundingKeys = 1,
): ViewSuccessAnalysis {
  const outcomeFit = verdictOutcomeFit(trajectory.verdict);
  const predictionFit = clamp(trajectory.predictionScore);
  const causal = causalFit(trajectory);
  const visitEfficiency =
    trajectory.visitedMemoryItems === 0
      ? 1
      : clamp(1 - trajectory.injectedMemoryItems / trajectory.visitedMemoryItems);
  const durationEfficiency = clamp(1 - trajectory.durationMs / 30_000);
  const strategyEfficiency = clamp(visitEfficiency * 0.72 + durationEfficiency * 0.28);
  const roles = normalizedRoleWeights(trajectory);
  const usedRoles = ATTENTION_ROLES.filter((role) => roles[role] > 0.01).length;
  const attentionDiversity = clamp(usedRoles / Math.min(6, ATTENTION_ROLES.length));
  const contradictionCoverage = clamp(roles.challenge + roles.dehabituation * 0.5);
  const mirrorLearningAllowed =
    uniqueNormalizedStrings(trajectory.externalGroundingKeys).length >=
    minimumExternalGroundingKeys;
  const warnings: string[] = [];
  if (trajectory.causalClaimPromoted && causal < 0.7) {
    warnings.push("Outcome success was at risk of being mistaken for causal validation.");
  }
  if (!mirrorLearningAllowed) {
    warnings.push("Reflective learning was blocked because the trajectory lacked external grounding.");
  }
  if (outcomeFit >= 0.8 && causal < 0.4) {
    warnings.push("The action worked, but the causal explanation remains unverified.");
  }
  if (contradictionCoverage < 0.08 && trajectory.generatedViewIds.length > 1) {
    warnings.push("The trajectory generated alternatives without allocating meaningful challenge attention.");
  }
  return {
    trajectoryId: trajectory.id,
    outcomeFit,
    predictionFit,
    causalFit: causal,
    strategyEfficiency,
    attentionDiversity,
    contradictionCoverage,
    mirrorLearningAllowed,
    outcomeValidated: outcomeFit >= 0.68 && mirrorLearningAllowed,
    causalExplanationValidated: causal >= 0.9 && mirrorLearningAllowed,
    warnings,
  };
}

export function createReflectiveMemoryState(
  updatedAt = new Date().toISOString(),
): ReflectiveMemoryState {
  return {
    revision: 1,
    trajectories: [],
    capsules: [],
    cognitivePolicies: [],
    biasSignals: [],
    updatedAt,
  };
}

function contextSimilarity(left: CognitiveTrajectory, right: CognitiveTrajectory): number {
  const exact =
    normalizeText(left.contextFingerprint) === normalizeText(right.contextFingerprint) ? 1 : 0;
  return clamp(
    exact * 0.55 +
      weightedJaccardSimilarity(left.contextDiscriminators, right.contextDiscriminators) * 0.45,
  );
}

function groupRelevantTrajectories(
  trajectories: CognitiveTrajectory[],
  target: CognitiveTrajectory,
): CognitiveTrajectory[] {
  return trajectories.filter((trajectory) => contextSimilarity(trajectory, target) >= 0.55);
}

function buildAttentionPattern(trajectories: CognitiveTrajectory[]): ReflectiveAttentionPattern {
  const roleWeights = Object.fromEntries(ATTENTION_ROLES.map((role) => [role, 0])) as Record<
    AttentionRole,
    number
  >;
  for (const trajectory of trajectories) {
    const weights = normalizedRoleWeights(trajectory);
    for (const role of ATTENTION_ROLES) {
      roleWeights[role] += weights[role];
    }
  }
  const divisor = Math.max(1, trajectories.length);
  for (const role of ATTENTION_ROLES) {
    roleWeights[role] = clamp(roleWeights[role] / divisor);
  }
  const sequencing = [...ATTENTION_ROLES]
    .filter((role) => roleWeights[role] > 0)
    .sort((left, right) => roleWeights[right] - roleWeights[left]);
  return { roleWeights, sequencing };
}

function capsuleStatus(
  successCount: number,
  failureCount: number,
  policy: ReflectiveLearningPolicy,
): ReflectiveCapsule["status"] {
  if (failureCount >= successCount && failureCount > 0) {
    return "disputed";
  }
  if (successCount >= policy.minimumIndependentSuccessesForValidation) {
    return "validated";
  }
  if (successCount >= policy.minimumIndependentSuccessesForSupport) {
    return "supported";
  }
  return "candidate";
}

function deriveReflectiveCapsule(
  trajectories: CognitiveTrajectory[],
  target: CognitiveTrajectory,
  analyses: ViewSuccessAnalysis[],
  policy: ReflectiveLearningPolicy,
  updatedAt: string,
  existing: ReflectiveCapsule | undefined,
): ReflectiveCapsule | null {
  const grounded = trajectories.filter((trajectory, index) => analyses[index]?.mirrorLearningAllowed);
  if (grounded.length === 0) {
    return null;
  }
  const successKeys = uniqueNormalizedStrings(
    grounded
      .filter((trajectory, index) => (analyses[index]?.outcomeFit ?? 0) >= 0.68)
      .map((trajectory) => trajectory.independentOutcomeKey),
  );
  const failureKeys = uniqueNormalizedStrings(
    grounded
      .filter((trajectory, index) => (analyses[index]?.outcomeFit ?? 0) < 0.38)
      .map((trajectory) => trajectory.independentOutcomeKey),
  );
  const successful = grounded.filter((trajectory, index) => (analyses[index]?.outcomeFit ?? 0) >= 0.68);
  const patternSource = successful.length > 0 ? successful : grounded;
  const attentionPattern = buildAttentionPattern(patternSource);
  const average = (values: number[]): number =>
    values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
  const confidence = clamp(
    successKeys.length * 0.18 +
      average(analyses.map((analysis) => analysis.strategyEfficiency)) * 0.28 +
      average(analyses.map((analysis) => analysis.predictionFit)) * 0.24 -
      failureKeys.length * 0.12,
  );
  const id =
    existing?.id ??
    `reflective-${stableHash({
      contextFingerprint: normalizeText(target.contextFingerprint),
      discriminators: [...target.contextDiscriminators].sort(),
      scope: target.scope,
    })}`;
  return {
    id,
    contextFingerprint: target.contextFingerprint,
    contextDiscriminators: uniqueNormalizedStrings(
      patternSource.flatMap((trajectory) => trajectory.contextDiscriminators),
    ),
    scope: clonePlainData(target.scope),
    attentionPattern,
    viewPattern: {
      minimumAlternativeViews: Math.max(
        1,
        Math.round(average(patternSource.map((trajectory) => trajectory.activeViewIds.length))),
      ),
      requiresChallengeView: attentionPattern.roleWeights.challenge >= 0.08,
      usefulViewSignatures: uniqueNormalizedStrings(
        successful.flatMap((trajectory) =>
          trajectory.selectedViewId === null ? [] : [trajectory.selectedViewId],
        ),
      ),
      rejectedViewSignatures: uniqueNormalizedStrings(
        patternSource.flatMap((trajectory) => trajectory.rejectedViewIds),
      ),
    },
    explorationProfile: {
      preferredBreadth: clamp(
        average(patternSource.map((trajectory) => trajectory.activeViewIds.length / 6)),
      ),
      preferredDepth: clamp(
        average(patternSource.map((trajectory) => trajectory.verificationSteps.length / 8)),
      ),
      contradictionBudget: clamp(attentionPattern.roleWeights.challenge * 0.7 + attentionPattern.roleWeights.dehabituation * 0.3),
      maximumVisitedMemoryItems: Math.max(
        1,
        Math.ceil(average(patternSource.map((trajectory) => trajectory.visitedMemoryItems))),
      ),
      maximumInjectedMemoryItems: Math.max(
        1,
        Math.ceil(average(patternSource.map((trajectory) => trajectory.injectedMemoryItems))),
      ),
    },
    validationRequirements: uniqueNormalizedStrings([
      "observable_outcome",
      ...(patternSource.some((trajectory) => trajectory.causalValidation === "verified")
        ? ["causal_test"]
        : ["keep_cause_separate_from_outcome"]),
      ...(attentionPattern.roleWeights.challenge >= 0.08 ? ["contradictory_view"] : []),
    ]),
    independentSuccessKeys: successKeys,
    independentFailureKeys: failureKeys,
    confidence,
    currentApplicability: clamp(
      weightedJaccardSimilarity(
        target.contextDiscriminators,
        existing?.contextDiscriminators ?? target.contextDiscriminators,
      ) * 0.7 + confidence * 0.3,
    ),
    status: capsuleStatus(successKeys.length, failureKeys.length, policy),
    revision: (existing?.revision ?? 0) + 1,
    createdAt: existing?.createdAt ?? updatedAt,
    updatedAt,
  };
}

function adaptPolicy(
  capsule: ReflectiveCapsule,
  existing: CognitivePolicyProfile | undefined,
  biasSignals: SelfBiasSignal[],
  updatedAt: string,
): CognitivePolicyProfile {
  const roleWeights = { ...capsule.attentionPattern.roleWeights };
  for (const signal of biasSignals) {
    if (signal.kind === "experience_overuse") {
      roleWeights.experience = clamp(roleWeights.experience - signal.severity * 0.2);
      roleWeights.exploration = clamp(roleWeights.exploration + signal.severity * 0.12);
    }
    if (signal.kind === "contradiction_neglect" || signal.kind === "confirmation_bias") {
      roleWeights.challenge = clamp(roleWeights.challenge + signal.severity * 0.18);
    }
    if (signal.kind === "dominant_view_inertia") {
      roleWeights.dehabituation = clamp(roleWeights.dehabituation + signal.severity * 0.16);
    }
    if (signal.kind === "novelty_neglect") {
      roleWeights.exploration = clamp(roleWeights.exploration + signal.severity * 0.18);
    }
  }
  const total = Object.values(roleWeights).reduce((sum, value) => sum + value, 0);
  if (total > 0) {
    for (const role of ATTENTION_ROLES) {
      roleWeights[role] = clamp(roleWeights[role] / total);
    }
  }
  return {
    id:
      existing?.id ??
      `cognitive-policy-${stableHash({
        contextFingerprint: capsule.contextFingerprint,
        discriminators: [...capsule.contextDiscriminators].sort(),
      })}`,
    contextFingerprint: capsule.contextFingerprint,
    contextDiscriminators: [...capsule.contextDiscriminators],
    roleWeights,
    preferredBreadth: capsule.explorationProfile.preferredBreadth,
    preferredDepth: capsule.explorationProfile.preferredDepth,
    contradictionBudget: Math.max(
      capsule.explorationProfile.contradictionBudget,
      roleWeights.challenge,
    ),
    minimumAlternativeViews: Math.max(
      capsule.viewPattern.minimumAlternativeViews,
      biasSignals.some((signal) => signal.kind === "dominant_view_inertia") ? 2 : 1,
    ),
    maximumVisitedMemoryItems: capsule.explorationProfile.maximumVisitedMemoryItems,
    maximumInjectedMemoryItems: capsule.explorationProfile.maximumInjectedMemoryItems,
    confidence: clamp(capsule.confidence - biasSignals.reduce((sum, item) => sum + item.severity, 0) * 0.05),
    sourceReflectiveCapsuleIds: uniqueNormalizedStrings([
      ...(existing?.sourceReflectiveCapsuleIds ?? []),
      capsule.id,
    ]),
    revision: (existing?.revision ?? 0) + 1,
    updatedAt,
  };
}

function biasSignal(
  kind: SelfBiasSignal["kind"],
  severity: number,
  trajectories: CognitiveTrajectory[],
  reasons: string[],
  suggestedCorrections: string[],
  detectedAt: string,
): SelfBiasSignal {
  return {
    id: `bias-${stableHash({ kind, trajectoryIds: trajectories.map((item) => item.id), detectedAt })}`,
    kind,
    severity: clamp(severity),
    trajectoryIds: trajectories.map((item) => item.id),
    reasons,
    suggestedCorrections,
    detectedAt,
  };
}

export function detectSelfBias(
  trajectories: CognitiveTrajectory[],
  policyOverrides?: ReflectiveLearningPolicyOverrides,
  detectedAt = new Date().toISOString(),
): SelfBiasSignal[] {
  const policy = resolvePolicy(policyOverrides);
  const window = trajectories.slice(-policy.biasWindowSize);
  if (window.length === 0) {
    return [];
  }
  const signals: SelfBiasSignal[] = [];
  const roleAverages = buildAttentionPattern(window).roleWeights;
  const selected = window
    .map((trajectory) => trajectory.selectedViewId)
    .filter((id): id is string => id !== null);
  const mostCommonCount = Math.max(
    0,
    ...[...new Set(selected)].map(
      (id) => selected.filter((candidate) => candidate === id).length,
    ),
  );
  const dominanceRatio = selected.length === 0 ? 0 : mostCommonCount / selected.length;
  const failingDominant = window.some(
    (trajectory) =>
      trajectory.selectedViewId !== null &&
      trajectory.verdict !== "supported" &&
      trajectory.verdict !== "partially_supported",
  );
  if (roleAverages.experience >= policy.experienceOveruseThreshold) {
    signals.push(
      biasSignal(
        "experience_overuse",
        roleAverages.experience,
        window,
        ["Experience attention consumed most of the reflective window."],
        ["Increase novelty and uncertainty attention before reusing a past pattern."],
        detectedAt,
      ),
    );
  }
  if (roleAverages.challenge < policy.contradictionNeglectThreshold) {
    signals.push(
      biasSignal(
        "contradiction_neglect",
        clamp(1 - roleAverages.challenge / Math.max(policy.contradictionNeglectThreshold, 0.01)),
        window,
        ["Challenge attention remained below its minimum reflective coverage."],
        ["Reserve budget for at least one contradictory View."],
        detectedAt,
      ),
    );
  }
  if (dominanceRatio >= policy.dominantViewInertiaThreshold && failingDominant) {
    signals.push(
      biasSignal(
        "dominant_view_inertia",
        dominanceRatio,
        window,
        ["The same View remained selected despite at least one poor outcome."],
        ["Temporarily inhibit the dominant View family and generate counterfactual alternatives."],
        detectedAt,
      ),
    );
  }
  if (roleAverages.exploration < 0.05 && window.some((item) => item.verdict === "unresolved")) {
    signals.push(
      biasSignal(
        "novelty_neglect",
        0.72,
        window,
        ["Unresolved outcomes were followed by almost no exploratory attention."],
        ["Widen the beam with one low-cost novel perspective."],
        detectedAt,
      ),
    );
  }
  const conflations = window.filter(
    (trajectory) =>
      trajectory.causalClaimPromoted &&
      trajectory.causalValidation !== "verified" &&
      trajectory.causalValidation !== "supported",
  );
  if (conflations.length > 0) {
    signals.push(
      biasSignal(
        "outcome_cause_conflation",
        clamp(conflations.length / window.length),
        conflations,
        ["Successful outcomes were used to promote unverified causal explanations."],
        ["Separate outcome-fit, prediction-fit, and causal validation in memory updates."],
        detectedAt,
      ),
    );
  }
  const overInjected = window.filter(
    (trajectory) =>
      trajectory.visitedMemoryItems > 0 &&
      trajectory.injectedMemoryItems / trajectory.visitedMemoryItems >=
        policy.injectionRatioThreshold,
  );
  if (overInjected.length > 0) {
    signals.push(
      biasSignal(
        "memory_over_injection",
        clamp(overInjected.length / window.length),
        overInjected,
        ["Too much inspected memory was repeatedly injected into the working context."],
        ["Keep exploration broad while compiling a smaller reconstruction."],
        detectedAt,
      ),
    );
  }
  if (
    dominanceRatio >= policy.dominantViewInertiaThreshold &&
    roleAverages.challenge < policy.contradictionNeglectThreshold
  ) {
    signals.push(
      biasSignal(
        "confirmation_bias",
        clamp((dominanceRatio + (1 - roleAverages.challenge)) / 2),
        window,
        ["A dominant View was repeatedly selected without adequate contradictory attention."],
        ["Require an independent challenge before strengthening the reflective policy."],
        detectedAt,
      ),
    );
  }
  return signals;
}

export function applyReflectiveLearning(
  input: ApplyReflectiveLearningInput,
): ApplyReflectiveLearningResult {
  const policy = resolvePolicy(input.policy);
  const updatedAt = input.updatedAt ?? input.trajectory.completedAt;
  const analysis = analyzeCognitiveTrajectory(
    input.trajectory,
    policy.minimumExternalGroundingKeys,
  );
  const next = clonePlainData(input.state);
  next.trajectories = [...next.trajectories, clonePlainData(input.trajectory)].slice(
    -policy.maximumStoredTrajectories,
  );
  const relevant = groupRelevantTrajectories(next.trajectories, input.trajectory);
  const analyses = relevant.map((trajectory) =>
    analyzeCognitiveTrajectory(trajectory, policy.minimumExternalGroundingKeys),
  );
  const existingCapsule = next.capsules.find(
    (capsule) =>
      normalizeText(capsule.contextFingerprint) ===
      normalizeText(input.trajectory.contextFingerprint),
  );
  const capsule = analysis.mirrorLearningAllowed
    ? deriveReflectiveCapsule(
        relevant,
        input.trajectory,
        analyses,
        policy,
        updatedAt,
        existingCapsule,
      )
    : null;
  if (capsule !== null) {
    const index = next.capsules.findIndex((item) => item.id === capsule.id);
    if (index >= 0) {
      next.capsules[index] = capsule;
    } else {
      next.capsules.push(capsule);
    }
  }
  const newBiasSignals = detectSelfBias(next.trajectories, policy, updatedAt);
  next.biasSignals = [...next.biasSignals, ...newBiasSignals];
  let cognitivePolicy: CognitivePolicyProfile | null = null;
  if (capsule !== null) {
    const existingPolicy =
      input.existingPolicyId === undefined
        ? next.cognitivePolicies.find(
            (item) =>
              normalizeText(item.contextFingerprint) ===
              normalizeText(input.trajectory.contextFingerprint),
          )
        : next.cognitivePolicies.find((item) => item.id === input.existingPolicyId);
    cognitivePolicy = adaptPolicy(capsule, existingPolicy, newBiasSignals, updatedAt);
    const policyIndex = next.cognitivePolicies.findIndex(
      (item) => item.id === cognitivePolicy?.id,
    );
    if (policyIndex >= 0) {
      next.cognitivePolicies[policyIndex] = cognitivePolicy;
    } else {
      next.cognitivePolicies.push(cognitivePolicy);
    }
  }
  next.revision += 1;
  next.updatedAt = updatedAt;
  return {
    state: next,
    analysis,
    reflectiveCapsule: capsule,
    cognitivePolicy,
    newBiasSignals,
    mirrorLearningAccepted: analysis.mirrorLearningAllowed && capsule !== null,
  };
}
