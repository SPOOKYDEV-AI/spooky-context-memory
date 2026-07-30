import type { ContextField } from "../contexts/types.js";
import type { MemoryScope, TaskSignature } from "../domain/types.js";
import { normalizeText, uniqueNormalizedStrings } from "../utils/normalized-set.js";
import { stableHash } from "../utils/stable-hash.js";
import { resolveMemoryVision } from "./resolve-vision.js";
import type {
  ProgressiveVision,
  ProgressiveVisionBudget,
  ProgressiveVisionEvidence,
  ProgressiveVisionEnsemblePolicy,
  ProgressiveVisionSeed,
  VisionCheckpoint,
  VisionExplorationObservation,
} from "./progressive-types.js";
import type { VisionBranchCandidate } from "./types.js";

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function projectScopeMatches(
  visionScope: MemoryScope,
  currentScope: MemoryScope,
  sharedAcrossProjects: boolean,
): boolean {
  if (sharedAcrossProjects) {
    return true;
  }

  if (
    visionScope.projectId !== undefined &&
    currentScope.projectId !== undefined &&
    visionScope.projectId !== currentScope.projectId
  ) {
    return false;
  }

  return true;
}

function strongestIndependentEvidence(
  evidence: readonly ProgressiveVisionEvidence[],
  kind: ProgressiveVisionEvidence["kind"],
): ProgressiveVisionEvidence[] {
  const strongest = new Map<string, ProgressiveVisionEvidence>();

  for (const item of evidence) {
    if (item.kind !== kind) {
      continue;
    }

    const current = strongest.get(item.independenceKey);
    if (current === undefined || item.weight > current.weight) {
      strongest.set(item.independenceKey, item);
    }
  }

  return [...strongest.values()];
}

function aggregateEvidenceScore(
  evidence: readonly ProgressiveVisionEvidence[],
  kind: ProgressiveVisionEvidence["kind"],
): number {
  const independent = strongestIndependentEvidence(evidence, kind);
  let complement = 1;

  for (const item of independent) {
    complement *= 1 - clamp(item.weight);
  }

  return clamp(1 - complement);
}

function activeContextIds(field: ContextField): Set<string> {
  return new Set(
    field.frames
      .filter((frame) => frame.activationState !== "dormant")
      .map((frame) => frame.id),
  );
}

function calculateCoverageScore(
  unresolvedQuestions: readonly string[],
  originalQuestionCount: number,
): number {
  if (originalQuestionCount === 0) {
    return 1;
  }

  return clamp(1 - unresolvedQuestions.length / originalQuestionCount);
}

function calculateCostPenalty(vision: ProgressiveVision): number {
  const visitedRatio =
    vision.visitedNodeIds.length / Math.max(1, vision.budget.maxVisitedNodes);
  const injectedRatio =
    vision.injectedItemIds.length / Math.max(1, vision.budget.maxInjectedItems);

  return clamp(visitedRatio * 0.68 + injectedRatio * 0.32);
}

export function calculateProgressiveVisionScore(
  vision: Pick<
    ProgressiveVision,
    | "priorUtility"
    | "supportScore"
    | "contradictionScore"
    | "noveltyScore"
    | "coverageScore"
    | "costPenalty"
    | "memoryVision"
  >,
): number {
  const structuralConfidence = clamp(vision.memoryVision.confidence);

  return clamp(
    vision.priorUtility * 0.16 +
      structuralConfidence * 0.24 +
      vision.supportScore * 0.24 +
      vision.coverageScore * 0.14 +
      vision.noveltyScore * 0.12 -
      vision.contradictionScore * 0.32 -
      vision.costPenalty * 0.1,
  );
}

export interface CreateProgressiveVisionInput {
  seed: ProgressiveVisionSeed;
  task: TaskSignature;
  currentScope: MemoryScope;
  contextField: ContextField;
  branches: VisionBranchCandidate[];
  memoryRevision: number;
  policy: ProgressiveVisionEnsemblePolicy;
  parentVisionId?: string | null;
  createdAt: string;
}

export function createProgressiveVision(
  input: CreateProgressiveVisionInput,
): ProgressiveVision {
  const branchIds = new Set(input.seed.branchIds);
  const selectedBranches = input.branches.filter((branch) => branchIds.has(branch.id));
  const memoryVision = resolveMemoryVision({
    task: input.task,
    scope: input.currentScope,
    branches: selectedBranches,
    memoryRevision: input.memoryRevision,
    budget: input.policy.baseTraversalBudget,
    createdAt: input.createdAt,
  });
  const availableContextIds = activeContextIds(input.contextField);
  const seedAnchors =
    input.seed.contextAnchorIds.length > 0
      ? input.seed.contextAnchorIds
      : input.contextField.frames
          .filter((frame) => frame.activationState !== "dormant")
          .sort(
            (left, right) =>
              right.activation * right.relevance - left.activation * left.relevance,
          )
          .slice(0, 3)
          .map((frame) => frame.id);
  const hasActiveAnchor =
    seedAnchors.length === 0 || seedAnchors.some((id) => availableContextIds.has(id));
  const scopeCompatible = projectScopeMatches(
    input.seed.scope,
    input.currentScope,
    input.seed.sharedAcrossProjects,
  );
  const hardPruned =
    !scopeCompatible || memoryVision.allowedBranchIds.length === 0;
  const status = hardPruned
    ? "pruned"
    : hasActiveAnchor
      ? "candidate"
      : "deferred";
  const visionId = `pvision-${stableHash({
    seedId: input.seed.id,
    hypothesis: input.seed.hypothesis,
    branchIds: [...input.seed.branchIds].sort(),
    parentVisionId: input.parentVisionId ?? null,
  })}`;
  const partial: ProgressiveVision = {
    id: visionId,
    seedId: input.seed.id,
    hypothesis: input.seed.hypothesis,
    parentVisionId: input.parentVisionId ?? null,
    mergedFromVisionIds: [],
    contextRevision: input.contextField.revision,
    memoryRevision: input.memoryRevision,
    scope: input.seed.scope,
    sharedAcrossProjects: input.seed.sharedAcrossProjects,
    contextAnchorIds: uniqueNormalizedStrings(seedAnchors),
    branchIds: uniqueNormalizedStrings(selectedBranches.map((branch) => branch.id)),
    unresolvedQuestions: uniqueNormalizedStrings(input.seed.unresolvedQuestions),
    visitedNodeIds: [],
    frontierNodeIds: [],
    injectedItemIds: [],
    checkpointIds: [],
    supportingEvidenceIds: [],
    contradictionIds: [],
    priorUtility: clamp(input.seed.priorUtility),
    supportScore: 0,
    contradictionScore: 0,
    noveltyScore: clamp(input.seed.noveltyScore),
    coverageScore: input.seed.unresolvedQuestions.length === 0 ? 1 : 0,
    costPenalty: 0,
    score: 0,
    staleContextRevisions: hasActiveAnchor ? 0 : 1,
    status,
    budget: { ...input.policy.defaultVisionBudget },
    memoryVision,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };

  return {
    ...partial,
    score: calculateProgressiveVisionScore(partial),
  };
}

export interface RevalidateProgressiveVisionInput {
  vision: ProgressiveVision;
  task: TaskSignature;
  currentScope: MemoryScope;
  contextField: ContextField;
  branches: VisionBranchCandidate[];
  evidence: ProgressiveVisionEvidence[];
  observation: VisionExplorationObservation | null;
  memoryRevision: number;
  policy: ProgressiveVisionEnsemblePolicy;
  updatedAt: string;
}

export interface RevalidateProgressiveVisionResult {
  vision: ProgressiveVision;
  checkpoint: VisionCheckpoint | null;
}

function createCheckpoint(
  vision: ProgressiveVision,
  observation: VisionExplorationObservation,
): VisionCheckpoint {
  return {
    id: `checkpoint-${stableHash({
      visionId: vision.id,
      contextRevision: vision.contextRevision,
      depth: observation.depth,
      frontierNodeIds: vision.frontierNodeIds,
      visitedNodeIds: vision.visitedNodeIds,
    })}`,
    visionId: vision.id,
    contextRevision: vision.contextRevision,
    depth: observation.depth,
    frontierNodeIds: [...vision.frontierNodeIds],
    visitedNodeIds: [...vision.visitedNodeIds],
    injectedItemIds: [...vision.injectedItemIds],
    unresolvedQuestions: [...vision.unresolvedQuestions],
    score: vision.score,
    createdAt: observation.createdAt,
  };
}

export function revalidateProgressiveVision(
  input: RevalidateProgressiveVisionInput,
): RevalidateProgressiveVisionResult {
  const selectedIds = new Set(input.vision.branchIds);
  const selectedBranches = input.branches.filter((branch) => selectedIds.has(branch.id));
  const memoryVision = resolveMemoryVision({
    task: input.task,
    scope: input.currentScope,
    branches: selectedBranches,
    memoryRevision: input.memoryRevision,
    budget: input.vision.memoryVision.traversalBudget,
    createdAt: input.updatedAt,
  });
  const currentContextIds = activeContextIds(input.contextField);
  const hasActiveAnchor =
    input.vision.contextAnchorIds.length === 0 ||
    input.vision.contextAnchorIds.some((id) => currentContextIds.has(id));
  const staleContextRevisions = hasActiveAnchor
    ? 0
    : input.vision.staleContextRevisions +
      Math.max(1, input.contextField.revision - input.vision.contextRevision);
  const relevantEvidence = input.evidence.filter(
    (item) =>
      item.visionId === input.vision.id &&
      item.contextRevision <= input.contextField.revision,
  );
  const supportEvidence = strongestIndependentEvidence(relevantEvidence, "support");
  const contradictionEvidence = strongestIndependentEvidence(
    relevantEvidence,
    "contradiction",
  );
  const noveltyEvidence = strongestIndependentEvidence(relevantEvidence, "novelty");
  const supportScore = aggregateEvidenceScore(relevantEvidence, "support");
  const contradictionScore = aggregateEvidenceScore(
    relevantEvidence,
    "contradiction",
  );
  const evidenceNovelty = aggregateEvidenceScore(relevantEvidence, "novelty");
  const checkpoint =
    input.observation === null
      ? null
      : createCheckpoint(input.vision, input.observation);
  const observation = input.observation;
  const resolved = new Set(
    (observation?.resolvedQuestions ?? []).map(normalizeText),
  );
  const unresolvedQuestions = input.vision.unresolvedQuestions.filter(
    (question) => !resolved.has(normalizeText(question)),
  );
  const visitedNodeIds = uniqueNormalizedStrings([
    ...input.vision.visitedNodeIds,
    ...(observation?.visitedNodeIds ?? []),
  ]);
  const frontierNodeIds = uniqueNormalizedStrings(
    observation?.frontierNodeIds ?? input.vision.frontierNodeIds,
  );
  const injectedItemIds = uniqueNormalizedStrings([
    ...input.vision.injectedItemIds,
    ...(observation?.injectedItemIds ?? []),
  ]);
  const checkpointIds = uniqueNormalizedStrings([
    ...input.vision.checkpointIds,
    ...(checkpoint === null ? [] : [checkpoint.id]),
  ]);
  const scopeCompatible = projectScopeMatches(
    input.vision.scope,
    input.currentScope,
    input.vision.sharedAcrossProjects,
  );
  const hardPruned =
    !scopeCompatible ||
    memoryVision.allowedBranchIds.length === 0 ||
    contradictionScore >= input.policy.contradictionPruneThreshold ||
    staleContextRevisions > input.policy.maxStaleContextRevisions;
  const exhausted =
    observation?.exhausted === true && frontierNodeIds.length === 0;
  const status = hardPruned
    ? "pruned"
    : exhausted
      ? "exhausted"
      : hasActiveAnchor
        ? "exploring"
        : "deferred";
  const originalQuestionCount = Math.max(
    input.vision.unresolvedQuestions.length,
    unresolvedQuestions.length,
  );
  const intermediate: ProgressiveVision = {
    ...input.vision,
    contextRevision: input.contextField.revision,
    memoryRevision: input.memoryRevision,
    branchIds: uniqueNormalizedStrings(selectedBranches.map((branch) => branch.id)),
    unresolvedQuestions,
    visitedNodeIds,
    frontierNodeIds,
    injectedItemIds,
    checkpointIds,
    supportingEvidenceIds: uniqueNormalizedStrings([
      ...input.vision.supportingEvidenceIds,
      ...supportEvidence.map((item) => item.id),
      ...noveltyEvidence.map((item) => item.id),
    ]),
    contradictionIds: uniqueNormalizedStrings([
      ...input.vision.contradictionIds,
      ...contradictionEvidence.map((item) => item.id),
    ]),
    supportScore: Math.max(input.vision.supportScore, supportScore),
    contradictionScore: Math.max(
      input.vision.contradictionScore,
      contradictionScore,
    ),
    noveltyScore: clamp(
      Math.max(input.vision.noveltyScore, evidenceNovelty) +
        (observation?.utilityGain ?? 0) * 0.15,
    ),
    coverageScore: calculateCoverageScore(
      unresolvedQuestions,
      originalQuestionCount,
    ),
    staleContextRevisions,
    status,
    memoryVision,
    updatedAt: input.updatedAt,
  };
  const costPenalty = calculateCostPenalty(intermediate);
  const withCost = {
    ...intermediate,
    costPenalty,
  };

  return {
    vision: {
      ...withCost,
      score: calculateProgressiveVisionScore(withCost),
    },
    checkpoint,
  };
}

export function backtrackProgressiveVision(
  vision: ProgressiveVision,
  checkpoint: VisionCheckpoint,
  updatedAt: string,
): ProgressiveVision {
  if (checkpoint.visionId !== vision.id) {
    throw new Error(
      `Checkpoint "${checkpoint.id}" does not belong to vision "${vision.id}".`,
    );
  }

  const restored: ProgressiveVision = {
    ...vision,
    contextRevision: Math.max(vision.contextRevision, checkpoint.contextRevision),
    frontierNodeIds: [...checkpoint.frontierNodeIds],
    visitedNodeIds: [...checkpoint.visitedNodeIds],
    injectedItemIds: [...checkpoint.injectedItemIds],
    unresolvedQuestions: [...checkpoint.unresolvedQuestions],
    score: Math.max(checkpoint.score, vision.score * 0.82),
    status: "exploring",
    updatedAt,
  };

  return restored;
}

export function visionEquivalenceKey(vision: ProgressiveVision): string {
  return stableHash({
    hypothesis: normalizeText(vision.hypothesis),
    branchIds: [...vision.branchIds].sort(),
    scope: vision.scope,
  });
}

export function visionDominates(
  left: ProgressiveVision,
  right: ProgressiveVision,
  margin: number,
): boolean {
  const leftBranches = new Set(left.branchIds);
  const coversRight = right.branchIds.every((id) => leftBranches.has(id));

  return (
    coversRight &&
    left.score >= right.score + margin &&
    left.contradictionScore <= right.contradictionScore &&
    left.costPenalty <= right.costPenalty
  );
}

export function cloneVisionBudget(
  budget: ProgressiveVisionBudget,
): ProgressiveVisionBudget {
  return { ...budget };
}
