import { clonePlainData } from "../utils/clone-plain-data.js";
import {
  normalizeText,
  uniqueNormalizedStrings,
  weightedJaccardSimilarity,
} from "../utils/normalized-set.js";
import { stableHash } from "../utils/stable-hash.js";
import type {
  AdvanceMemoryAttentionFieldInput,
  AdvanceMemoryAttentionFieldResult,
  AttentionCandidate,
  AttentionFeedback,
  AttentionFocus,
  AttentionPortfolioPolicy,
  AttentionPortfolioPolicyOverrides,
  AttentionRole,
  CreateMemoryAttentionFieldInput,
  MemoryAttentionField,
} from "./types.js";

const DEFAULT_POLICY: AttentionPortfolioPolicy = {
  maxActiveFocuses: 6,
  maxBackgroundFocuses: 4,
  minimumWeight: 0.06,
  dominantMinimumMargin: 0.08,
  decayPerContextRevision: 0.08,
  maxStaleContextRevisions: 3,
  redundancyThreshold: 0.9,
  minimumRoleCoverage: ["goal", "constraint", "uncertainty", "experience"],
  defaultBudget: {
    maxVisitedNodes: 10,
    maxDepth: 3,
    maxGeneratedViews: 3,
    maxDurationMs: 60,
  },
};

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function assertIntegerAtLeast(value: number, minimum: number, name: string): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}.`);
  }
}

function assertUnit(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be between 0 and 1.`);
  }
}

function resolvePolicy(
  overrides: AttentionPortfolioPolicyOverrides | undefined,
): AttentionPortfolioPolicy {
  const policy: AttentionPortfolioPolicy = {
    ...DEFAULT_POLICY,
    ...overrides,
    minimumRoleCoverage:
      overrides?.minimumRoleCoverage ?? DEFAULT_POLICY.minimumRoleCoverage,
    defaultBudget: {
      ...DEFAULT_POLICY.defaultBudget,
      ...overrides?.defaultBudget,
    },
  };

  assertIntegerAtLeast(policy.maxActiveFocuses, 1, "maxActiveFocuses");
  assertIntegerAtLeast(policy.maxBackgroundFocuses, 0, "maxBackgroundFocuses");
  assertIntegerAtLeast(policy.maxStaleContextRevisions, 0, "maxStaleContextRevisions");
  assertIntegerAtLeast(policy.defaultBudget.maxVisitedNodes, 1, "defaultBudget.maxVisitedNodes");
  assertIntegerAtLeast(policy.defaultBudget.maxDepth, 1, "defaultBudget.maxDepth");
  assertIntegerAtLeast(policy.defaultBudget.maxGeneratedViews, 1, "defaultBudget.maxGeneratedViews");
  assertIntegerAtLeast(policy.defaultBudget.maxDurationMs, 1, "defaultBudget.maxDurationMs");
  assertUnit(policy.minimumWeight, "minimumWeight");
  assertUnit(policy.dominantMinimumMargin, "dominantMinimumMargin");
  assertUnit(policy.decayPerContextRevision, "decayPerContextRevision");
  assertUnit(policy.redundancyThreshold, "redundancyThreshold");
  return policy;
}

function candidateScore(candidate: AttentionCandidate): number {
  return clamp(
    candidate.goalDependency * 0.18 +
      candidate.constraintImportance * 0.17 +
      candidate.uncertainty * 0.14 +
      candidate.novelty * 0.11 +
      candidate.risk * 0.13 +
      candidate.expectedInformationGain * 0.14 +
      candidate.predictiveValue * 0.08 +
      candidate.persistence * 0.03 +
      candidate.urgency * 0.02,
  );
}

function focusKey(candidate: AttentionCandidate): string {
  return stableHash({
    targetType: candidate.targetType,
    targetId: normalizeText(candidate.targetId),
    role: candidate.role,
    scope: candidate.scope,
    contextAnchorIds: [...candidate.contextAnchorIds].sort(),
    truthAnchorIds: [...candidate.truthAnchorIds].sort(),
  });
}

function contextAnchorIsActive(
  focus: Pick<AttentionFocus, "contextAnchorIds">,
  activeContextIds: ReadonlySet<string>,
): boolean {
  return (
    focus.contextAnchorIds.length === 0 ||
    focus.contextAnchorIds.some((id) => activeContextIds.has(id))
  );
}

function createFocus(
  candidate: AttentionCandidate,
  policy: AttentionPortfolioPolicy,
  now: string,
): AttentionFocus {
  const score = candidateScore(candidate);
  return {
    ...clonePlainData(candidate),
    id: candidate.id || `attention-${focusKey(candidate)}`,
    contextAnchorIds: uniqueNormalizedStrings(candidate.contextAnchorIds),
    truthAnchorIds: uniqueNormalizedStrings(candidate.truthAnchorIds),
    weight: score,
    score,
    status: candidate.pinned === true ? "pinned" : "active",
    budget: { ...policy.defaultBudget },
    independentSupportKeys: [],
    independentChallengeKeys: [],
    staleContextRevisions: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function attentionSimilarity(left: AttentionFocus, right: AttentionFocus): number {
  if (left.role !== right.role || left.targetType !== right.targetType) {
    return 0;
  }
  const targetMatch = normalizeText(left.targetId) === normalizeText(right.targetId) ? 1 : 0;
  const context = weightedJaccardSimilarity(left.contextAnchorIds, right.contextAnchorIds);
  const truths = weightedJaccardSimilarity(left.truthAnchorIds, right.truthAnchorIds);
  return targetMatch * 0.6 + context * 0.2 + truths * 0.2;
}

function mergeFocus(left: AttentionFocus, right: AttentionFocus, now: string): AttentionFocus {
  const strongest = left.score >= right.score ? left : right;
  return {
    ...clonePlainData(strongest),
    contextAnchorIds: uniqueNormalizedStrings([
      ...left.contextAnchorIds,
      ...right.contextAnchorIds,
    ]),
    truthAnchorIds: uniqueNormalizedStrings([
      ...left.truthAnchorIds,
      ...right.truthAnchorIds,
    ]),
    independentSupportKeys: uniqueNormalizedStrings([
      ...left.independentSupportKeys,
      ...right.independentSupportKeys,
    ]),
    independentChallengeKeys: uniqueNormalizedStrings([
      ...left.independentChallengeKeys,
      ...right.independentChallengeKeys,
    ]),
    weight: clamp(Math.max(left.weight, right.weight) + Math.min(left.weight, right.weight) * 0.15),
    score: clamp(Math.max(left.score, right.score) + Math.min(left.score, right.score) * 0.1),
    persistence: clamp(Math.max(left.persistence, right.persistence)),
    urgency: clamp(Math.max(left.urgency, right.urgency)),
    updatedAt: now,
  };
}

function applyFeedback(
  focus: AttentionFocus,
  feedback: AttentionFeedback[],
): AttentionFocus {
  const next = clonePlainData(focus);
  const strongestByEffect = new Map<string, number>();

  for (const item of feedback) {
    if (item.focusId !== focus.id) {
      continue;
    }
    const key = `${item.effect}:${item.independenceKey}`;
    strongestByEffect.set(key, Math.max(strongestByEffect.get(key) ?? 0, clamp(item.magnitude)));

    if (item.effect === "reinforce") {
      next.independentSupportKeys = uniqueNormalizedStrings([
        ...next.independentSupportKeys,
        item.independenceKey,
      ]);
    }
    if (item.effect === "challenge") {
      next.independentChallengeKeys = uniqueNormalizedStrings([
        ...next.independentChallengeKeys,
        item.independenceKey,
      ]);
    }
  }

  for (const [key, magnitude] of strongestByEffect) {
    const effect = key.split(":", 1)[0];
    if (effect === "reinforce") {
      next.score = clamp(next.score + magnitude * 0.2);
      next.weight = clamp(next.weight + magnitude * 0.16);
    } else if (effect === "challenge") {
      next.score = clamp(next.score - magnitude * 0.25);
      next.weight = clamp(next.weight - magnitude * 0.2);
    } else if (effect === "resolve") {
      next.score = clamp(next.score - magnitude * 0.4);
      next.weight = clamp(next.weight - magnitude * 0.35);
    } else if (effect === "reactivate") {
      next.score = clamp(next.score + magnitude * 0.24);
      next.weight = clamp(next.weight + magnitude * 0.22);
      next.status = "active";
      next.staleContextRevisions = 0;
    }
  }

  return next;
}

function ensureRoleCoverage(
  sorted: AttentionFocus[],
  policy: AttentionPortfolioPolicy,
): AttentionFocus[] {
  const selected: AttentionFocus[] = [];
  const usedIds = new Set<string>();

  for (const role of policy.minimumRoleCoverage) {
    const candidate = sorted.find(
      (focus) => focus.role === role && focus.status !== "released" && !usedIds.has(focus.id),
    );
    if (candidate !== undefined && selected.length < policy.maxActiveFocuses) {
      selected.push(candidate);
      usedIds.add(candidate.id);
    }
  }

  for (const focus of sorted) {
    if (selected.length >= policy.maxActiveFocuses) {
      break;
    }
    if (!usedIds.has(focus.id) && focus.status !== "released") {
      selected.push(focus);
      usedIds.add(focus.id);
    }
  }

  return selected;
}

function rankAndAssignStatuses(
  focuses: AttentionFocus[],
  policy: AttentionPortfolioPolicy,
): {
  focuses: AttentionFocus[];
  dominantFocusId: string | null;
  activeFocusIds: string[];
  backgroundFocusIds: string[];
} {
  const pinned = focuses.filter((focus) => focus.status === "pinned");
  const eligible = focuses
    .filter((focus) => focus.status !== "released" && focus.status !== "pinned")
    .sort((left, right) => right.weight - left.weight || right.score - left.score || left.id.localeCompare(right.id));
  const activeSelection = ensureRoleCoverage([...pinned, ...eligible], policy);
  const activeIds = new Set(activeSelection.map((focus) => focus.id));
  const remaining = eligible.filter((focus) => !activeIds.has(focus.id));
  const backgroundSelection = remaining.slice(0, policy.maxBackgroundFocuses);
  const backgroundIds = new Set(backgroundSelection.map((focus) => focus.id));

  const mutable = focuses.map((focus) => {
    if (focus.status === "released") {
      return focus;
    }
    if (focus.pinned === true || focus.status === "pinned") {
      return { ...focus, status: "pinned" as const };
    }
    if (activeIds.has(focus.id)) {
      return { ...focus, status: "active" as const };
    }
    if (backgroundIds.has(focus.id)) {
      return { ...focus, status: "background" as const };
    }
    return { ...focus, status: "dormant" as const };
  });

  const dominantCandidates = mutable
    .filter((focus) => focus.status === "active" || focus.status === "pinned")
    .sort((left, right) => right.weight - left.weight || right.score - left.score || left.id.localeCompare(right.id));
  const first = dominantCandidates[0];
  const second = dominantCandidates[1];
  let dominantFocusId: string | null = first?.id ?? null;

  if (
    first !== undefined &&
    second !== undefined &&
    first.status !== "pinned" &&
    first.weight - second.weight < policy.dominantMinimumMargin
  ) {
    dominantFocusId = null;
  }

  const withDominance = mutable.map((focus) =>
    focus.id === dominantFocusId && focus.status !== "pinned"
      ? { ...focus, status: "dominant" as const }
      : focus,
  );

  return {
    focuses: withDominance,
    dominantFocusId,
    activeFocusIds: withDominance
      .filter((focus) => ["pinned", "dominant", "active"].includes(focus.status))
      .map((focus) => focus.id),
    backgroundFocusIds: withDominance
      .filter((focus) => focus.status === "background")
      .map((focus) => focus.id),
  };
}

function roleCoverageGaps(
  focuses: AttentionFocus[],
  policy: AttentionPortfolioPolicy,
): AttentionRole[] {
  const activeRoles = new Set(
    focuses
      .filter((focus) => ["pinned", "dominant", "active"].includes(focus.status))
      .map((focus) => focus.role),
  );
  return policy.minimumRoleCoverage.filter((role) => !activeRoles.has(role));
}

export function createMemoryAttentionField(
  input: CreateMemoryAttentionFieldInput,
): MemoryAttentionField {
  const now = input.createdAt ?? input.contextField.updatedAt;
  const policy = resolvePolicy(input.policy);
  const raw = input.candidates.map((candidate) => createFocus(candidate, policy, now));
  const merged: AttentionFocus[] = [];

  for (const focus of raw.sort((left, right) => right.score - left.score)) {
    const existingIndex = merged.findIndex(
      (existing) => attentionSimilarity(existing, focus) >= policy.redundancyThreshold,
    );
    if (existingIndex < 0) {
      merged.push(focus);
    } else {
      merged[existingIndex] = mergeFocus(merged[existingIndex]!, focus, now);
    }
  }

  const ranked = rankAndAssignStatuses(merged, policy);
  return {
    id: `attention-field-${stableHash({
      contextRevision: input.contextField.revision,
      memoryRevision: input.memoryRevision,
      truthRevision: input.epistemicCore.revision,
      focusIds: ranked.focuses.map((focus) => focus.id).sort(),
    })}`,
    contextRevision: input.contextField.revision,
    memoryRevision: input.memoryRevision,
    truthRevision: input.epistemicCore.revision,
    cycle: 1,
    dominantFocusId: ranked.dominantFocusId,
    activeFocusIds: ranked.activeFocusIds,
    backgroundFocusIds: ranked.backgroundFocusIds,
    focuses: ranked.focuses,
    policy,
    createdAt: now,
    updatedAt: now,
  };
}

export function advanceMemoryAttentionField(
  input: AdvanceMemoryAttentionFieldInput,
): AdvanceMemoryAttentionFieldResult {
  const now = input.updatedAt ?? input.contextField.updatedAt;
  const activeContextIds = new Set(
    input.contextField.frames
      .filter((frame) => frame.activationState !== "dormant" && frame.retentionState !== "archived")
      .map((frame) => frame.id),
  );
  const revisionDelta = Math.max(1, input.contextField.revision - input.previous.contextRevision);
  const createdFocusIds: string[] = [];
  const mergedFocusIds: string[] = [];
  const releasedFocusIds: string[] = [];
  const reactivatedFocusIds: string[] = [];
  let focuses = input.previous.focuses.map((focus) => {
    let next = applyFeedback(focus, input.feedback);
    const activeAnchor = contextAnchorIsActive(next, activeContextIds);
    const staleContextRevisions = activeAnchor
      ? 0
      : next.staleContextRevisions + revisionDelta;
    const decay =
      activeAnchor || next.status === "pinned"
        ? 0
        : input.previous.policy.decayPerContextRevision * revisionDelta;
    next = {
      ...next,
      staleContextRevisions,
      weight: clamp(next.weight - decay),
      score: clamp(next.score - decay * 0.75),
      updatedAt: now,
    };

    if (
      next.status !== "pinned" &&
      (next.weight < input.previous.policy.minimumWeight ||
        staleContextRevisions > input.previous.policy.maxStaleContextRevisions)
    ) {
      next.status = "released";
      releasedFocusIds.push(next.id);
    }

    if (focus.status === "dormant" && next.status === "active") {
      reactivatedFocusIds.push(next.id);
    }
    return next;
  });

  for (const candidate of input.candidates) {
    const incoming = createFocus(candidate, input.previous.policy, now);
    const existingIndex = focuses.findIndex(
      (focus) =>
        focus.status !== "released" &&
        attentionSimilarity(focus, incoming) >= input.previous.policy.redundancyThreshold,
    );
    if (existingIndex < 0) {
      focuses.push(incoming);
      createdFocusIds.push(incoming.id);
    } else {
      const existing = focuses[existingIndex]!;
      focuses[existingIndex] = mergeFocus(existing, incoming, now);
      mergedFocusIds.push(incoming.id);
      if (existing.status === "dormant") {
        reactivatedFocusIds.push(existing.id);
      }
    }
  }

  const ranked = rankAndAssignStatuses(focuses, input.previous.policy);
  const field: MemoryAttentionField = {
    ...clonePlainData(input.previous),
    contextRevision: input.contextField.revision,
    memoryRevision: input.memoryRevision,
    truthRevision: input.epistemicCore.revision,
    cycle: input.previous.cycle + 1,
    dominantFocusId: ranked.dominantFocusId,
    activeFocusIds: ranked.activeFocusIds,
    backgroundFocusIds: ranked.backgroundFocusIds,
    focuses: ranked.focuses,
    updatedAt: now,
  };

  return {
    field,
    createdFocusIds: uniqueNormalizedStrings(createdFocusIds),
    mergedFocusIds: uniqueNormalizedStrings(mergedFocusIds),
    releasedFocusIds: uniqueNormalizedStrings(releasedFocusIds),
    reactivatedFocusIds: uniqueNormalizedStrings(reactivatedFocusIds),
    roleCoverageGaps: roleCoverageGaps(field.focuses, field.policy),
  };
}

export function getAttentionRoleCoverage(
  field: MemoryAttentionField,
): Record<AttentionRole, number> {
  const result: Record<AttentionRole, number> = {
    goal: 0,
    constraint: 0,
    uncertainty: 0,
    experience: 0,
    challenge: 0,
    transition: 0,
    risk: 0,
    exploration: 0,
  };
  for (const focus of field.focuses) {
    if (["pinned", "dominant", "active"].includes(focus.status)) {
      result[focus.role] += focus.weight;
    }
  }
  return result;
}
