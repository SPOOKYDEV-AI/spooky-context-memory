import { stableHash } from "../utils/stable-hash.js";
import type {
  MemoryVision,
  ResolveVisionInput,
  TraversalBudget,
} from "./types.js";
import { assessVisionBranch } from "./prune-vision-branch.js";

const DEFAULT_BUDGET: TraversalBudget = {
  maxVisitedNodes: 50,
  maxCandidateCapsules: 8,
  maxInjectedCapsules: 2,
  maxScopeDistance: 3,
  maxUnknownConditions: 3,
  maxDurationMs: 250,
};

export function resolveMemoryVision(input: ResolveVisionInput): MemoryVision {
  const evaluations = input.branches.map((branch) => ({
    branch,
    evaluation: assessVisionBranch(branch, input),
  }));
  const excludedBranches = evaluations.flatMap(({ evaluation }) =>
    evaluation.excluded !== null ? [evaluation.excluded] : [],
  );
  const frontiers = evaluations
    .flatMap(({ evaluation }) =>
      evaluation.frontier !== null ? [evaluation.frontier] : [],
    )
    .sort(
      (left, right) =>
        right.estimatedUtility / Math.max(0.01, right.estimatedCost) -
        left.estimatedUtility / Math.max(0.01, left.estimatedCost),
    );
  const allowedBranchIds = frontiers.map((frontier) => frontier.branchId);
  const anchors = frontiers
    .filter((frontier) => frontier.state === "queued")
    .slice(0, 3)
    .map((frontier) => frontier.branchId);
  const allowedIdSet = new Set(allowedBranchIds);
  const likelyPatternIds = Array.from(
    new Set(
      input.branches
        .filter((branch) => allowedIdSet.has(branch.id))
        .flatMap((branch) => branch.patternIds),
    ),
  );
  const taskSignatureHash = stableHash({
    task: input.task,
    scope: input.scope,
  });
  const confidence =
    frontiers.length === 0
      ? 0
      : frontiers.reduce(
          (sum, frontier) => sum + frontier.estimatedUtility * (1 - frontier.uncertainty),
          0,
        ) / frontiers.length;

  return {
    id: `vision-${taskSignatureHash}-${input.memoryRevision}`,
    taskSignatureHash,
    memoryRevision: input.memoryRevision,
    scope: input.scope,
    task: input.task,
    anchors,
    allowedBranchIds,
    excludedBranches,
    likelyPatternIds,
    frontiers,
    traversalBudget: {
      ...DEFAULT_BUDGET,
      ...input.budget,
    },
    confidence,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}
