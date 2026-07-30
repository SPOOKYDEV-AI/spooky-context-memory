import type { ContextField } from "../contexts/types.js";
import { assessVisionBranch } from "./prune-vision-branch.js";
import type {
  ExcludedVisionBranch,
  MemoryVision,
  ResolveVisionInput,
  VisionBranchCandidate,
  VisionFrontier,
} from "./types.js";

export interface UpdateMemoryVisionInput {
  previous: MemoryVision;
  contextField: ContextField;
  branches: VisionBranchCandidate[];
  affectedBranchIds: string[];
  memoryRevision: number;
  createdAt?: string;
}

export interface UpdateMemoryVisionResult {
  vision: MemoryVision;
  reevaluatedBranchIds: string[];
  preservedBranchIds: string[];
}

function ratio(frontier: VisionFrontier): number {
  return frontier.estimatedUtility / Math.max(0.01, frontier.estimatedCost);
}

export function updateMemoryVision(
  input: UpdateMemoryVisionInput,
): UpdateMemoryVisionResult {
  const affected = new Set(input.affectedBranchIds);
  const branchMap = new Map(input.branches.map((branch) => [branch.id, branch]));
  const preservedFrontiers = input.previous.frontiers.filter(
    (frontier) => !affected.has(frontier.branchId),
  );
  const preservedExcluded = input.previous.excludedBranches.filter(
    (excluded) => !affected.has(excluded.branchId),
  );
  const preservedBranchIds = Array.from(
    new Set([
      ...preservedFrontiers.map((frontier) => frontier.branchId),
      ...preservedExcluded.map((excluded) => excluded.branchId),
    ]),
  );

  const resolveInput: ResolveVisionInput = {
    task: input.previous.task,
    scope: input.previous.scope,
    branches: input.branches,
    memoryRevision: input.memoryRevision,
    budget: input.previous.traversalBudget,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  const reevaluatedFrontiers: VisionFrontier[] = [];
  const reevaluatedExcluded: ExcludedVisionBranch[] = [];
  const reevaluatedBranchIds: string[] = [];

  for (const branchId of affected) {
    const branch = branchMap.get(branchId);
    if (branch === undefined) {
      continue;
    }

    const evaluation = assessVisionBranch(branch, resolveInput);
    reevaluatedBranchIds.push(branchId);
    if (evaluation.frontier !== null) {
      reevaluatedFrontiers.push(evaluation.frontier);
    }
    if (evaluation.excluded !== null) {
      reevaluatedExcluded.push(evaluation.excluded);
    }
  }

  const frontiers = [...preservedFrontiers, ...reevaluatedFrontiers].sort(
    (left, right) => ratio(right) - ratio(left),
  );
  const excludedBranches = [...preservedExcluded, ...reevaluatedExcluded];
  const allowedBranchIds = frontiers.map((frontier) => frontier.branchId);
  const allowedIdSet = new Set(allowedBranchIds);
  const likelyPatternIds = Array.from(
    new Set(
      input.branches
        .filter((branch) => allowedIdSet.has(branch.id))
        .flatMap((branch) => branch.patternIds),
    ),
  );
  const activeContextIds = input.contextField.frames
    .filter((frame) => frame.activationState !== "dormant")
    .sort(
      (left, right) =>
        right.activation * right.relevance - left.activation * left.relevance,
    )
    .slice(0, 3)
    .map((frame) => frame.id);
  const frontierAnchors = frontiers
    .filter((frontier) => frontier.state === "queued")
    .slice(0, 3)
    .map((frontier) => frontier.branchId);
  const confidence =
    frontiers.length === 0
      ? 0
      : frontiers.reduce(
          (sum, frontier) =>
            sum + frontier.estimatedUtility * (1 - frontier.uncertainty),
          0,
        ) / frontiers.length;

  return {
    vision: {
      ...input.previous,
      id: `${input.previous.id}-ctx${input.contextField.revision}-m${input.memoryRevision}`,
      memoryRevision: input.memoryRevision,
      anchors: Array.from(new Set([...activeContextIds, ...frontierAnchors])).slice(
        0,
        4,
      ),
      allowedBranchIds,
      excludedBranches,
      likelyPatternIds,
      frontiers,
      confidence,
      createdAt: input.createdAt ?? new Date().toISOString(),
    },
    reevaluatedBranchIds,
    preservedBranchIds,
  };
}
