import { uniqueNormalizedStrings } from "../utils/normalized-set.js";
import { stableHash } from "../utils/stable-hash.js";
import {
  createProgressiveVision,
  revalidateProgressiveVision,
  visionEquivalenceKey,
} from "./progressive-vision.js";
import type {
  AdvanceProgressiveVisionEnsembleInput,
  AdvanceProgressiveVisionEnsembleResult,
  CreateProgressiveVisionEnsembleInput,
  ProgressiveVision,
  ProgressiveVisionEnsemble,
  ProgressiveVisionEnsemblePolicy,
  ProgressiveVisionEnsemblePolicyOverrides,
  ProgressiveVisionSeed,
  VisionCheckpoint,
} from "./progressive-types.js";
import { selectProgressiveVisionBeam } from "./vision-beam-controller.js";
import type { VisionBranchCandidate } from "./types.js";

const DEFAULT_POLICY: ProgressiveVisionEnsemblePolicy = {
  maxActiveVisions: 4,
  maxDeferredVisions: 2,
  maxBranchesPerVision: 3,
  maxStaleContextRevisions: 2,
  contradictionPruneThreshold: 0.82,
  minimumActiveScore: 0.2,
  dominanceMargin: 0.08,
  minimumLoopProgress: 0.02,
  maxRevisitsWithoutProgress: 1,
  defaultVisionBudget: {
    maxVisitedNodes: 16,
    maxDepth: 5,
    maxInjectedItems: 2,
    maxDurationMs: 80,
  },
  baseTraversalBudget: {
    maxVisitedNodes: 20,
    maxCandidateCapsules: 4,
    maxInjectedCapsules: 2,
    maxScopeDistance: 3,
    maxUnknownConditions: 2,
    maxDurationMs: 100,
  },
};

function assertIntegerAtLeast(
  value: number,
  minimum: number,
  name: string,
): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}.`);
  }
}

function assertUnitInterval(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be between 0 and 1.`);
  }
}

function resolvePolicy(
  partial: ProgressiveVisionEnsemblePolicyOverrides | undefined,
): ProgressiveVisionEnsemblePolicy {
  const policy: ProgressiveVisionEnsemblePolicy = {
    ...DEFAULT_POLICY,
    ...partial,
    defaultVisionBudget: {
      ...DEFAULT_POLICY.defaultVisionBudget,
      ...partial?.defaultVisionBudget,
    },
    baseTraversalBudget: {
      ...DEFAULT_POLICY.baseTraversalBudget,
      ...partial?.baseTraversalBudget,
    },
  };

  assertIntegerAtLeast(policy.maxActiveVisions, 1, "maxActiveVisions");
  assertIntegerAtLeast(policy.maxDeferredVisions, 0, "maxDeferredVisions");
  assertIntegerAtLeast(policy.maxBranchesPerVision, 1, "maxBranchesPerVision");
  assertIntegerAtLeast(
    policy.maxStaleContextRevisions,
    0,
    "maxStaleContextRevisions",
  );
  assertIntegerAtLeast(
    policy.maxRevisitsWithoutProgress,
    0,
    "maxRevisitsWithoutProgress",
  );
  assertIntegerAtLeast(
    policy.defaultVisionBudget.maxVisitedNodes,
    1,
    "defaultVisionBudget.maxVisitedNodes",
  );
  assertIntegerAtLeast(
    policy.defaultVisionBudget.maxDepth,
    1,
    "defaultVisionBudget.maxDepth",
  );
  assertIntegerAtLeast(
    policy.defaultVisionBudget.maxInjectedItems,
    1,
    "defaultVisionBudget.maxInjectedItems",
  );
  assertIntegerAtLeast(
    policy.defaultVisionBudget.maxDurationMs,
    1,
    "defaultVisionBudget.maxDurationMs",
  );
  assertUnitInterval(
    policy.contradictionPruneThreshold,
    "contradictionPruneThreshold",
  );
  assertUnitInterval(policy.minimumActiveScore, "minimumActiveScore");
  assertUnitInterval(policy.dominanceMargin, "dominanceMargin");
  assertUnitInterval(policy.minimumLoopProgress, "minimumLoopProgress");

  return policy;
}

interface ExpandedSeed {
  seed: ProgressiveVisionSeed;
  parentVisionId: string | null;
  splitFromSeedId: string | null;
}

function expandSeed(
  seed: ProgressiveVisionSeed,
  maxBranchesPerVision: number,
): ExpandedSeed[] {
  if (seed.branchIds.length <= maxBranchesPerVision) {
    return [{ seed, parentVisionId: null, splitFromSeedId: null }];
  }

  const parentVisionId = `pvision-parent-${stableHash({
    seedId: seed.id,
    branchIds: [...seed.branchIds].sort(),
  })}`;
  const chunks: string[][] = [];

  for (let index = 0; index < seed.branchIds.length; index += maxBranchesPerVision) {
    chunks.push(seed.branchIds.slice(index, index + maxBranchesPerVision));
  }

  return chunks.map((branchIds, index) => ({
    seed: {
      ...seed,
      id: `${seed.id}-split-${index + 1}`,
      branchIds,
      hypothesis: `${seed.hypothesis} [branch group ${index + 1}]`,
      noveltyScore: Math.max(0, seed.noveltyScore - index * 0.03),
    },
    parentVisionId,
    splitFromSeedId: seed.id,
  }));
}

function createFromSeeds(
  input: Pick<
    CreateProgressiveVisionEnsembleInput,
    | "task"
    | "scope"
    | "contextField"
    | "branches"
    | "memoryRevision"
  > & {
    seeds: ProgressiveVisionSeed[];
    policy: ProgressiveVisionEnsemblePolicy;
    createdAt: string;
  },
): {
  visions: ProgressiveVision[];
  splitVisionIds: string[];
} {
  const visions: ProgressiveVision[] = [];
  const splitVisionIds: string[] = [];

  for (const seed of input.seeds) {
    const expanded = expandSeed(seed, input.policy.maxBranchesPerVision);

    for (const item of expanded) {
      const vision = createProgressiveVision({
        seed: item.seed,
        task: input.task,
        currentScope: input.scope,
        contextField: input.contextField,
        branches: input.branches,
        memoryRevision: input.memoryRevision,
        policy: input.policy,
        parentVisionId: item.parentVisionId,
        createdAt: input.createdAt,
      });
      visions.push(vision);

      if (item.splitFromSeedId !== null) {
        splitVisionIds.push(vision.id);
      }
    }
  }

  return { visions, splitVisionIds };
}

function mergeEquivalentVisions(visions: readonly ProgressiveVision[]): {
  visions: ProgressiveVision[];
  mergedVisionIds: string[];
} {
  const groups = new Map<string, ProgressiveVision[]>();

  for (const vision of visions) {
    const key = visionEquivalenceKey(vision);
    const current = groups.get(key) ?? [];
    current.push(vision);
    groups.set(key, current);
  }

  const merged: ProgressiveVision[] = [];
  const mergedVisionIds: string[] = [];

  for (const group of groups.values()) {
    const ranked = [...group].sort((left, right) => right.score - left.score);
    const winner = ranked[0];

    if (winner === undefined) {
      continue;
    }

    const others = ranked.slice(1);
    mergedVisionIds.push(...others.map((vision) => vision.id));
    merged.push({
      ...winner,
      mergedFromVisionIds: uniqueNormalizedStrings([
        ...winner.mergedFromVisionIds,
        ...others.flatMap((vision) => [vision.id, ...vision.mergedFromVisionIds]),
      ]),
      supportingEvidenceIds: uniqueNormalizedStrings(
        ranked.flatMap((vision) => vision.supportingEvidenceIds),
      ),
      contradictionIds: uniqueNormalizedStrings(
        ranked.flatMap((vision) => vision.contradictionIds),
      ),
      visitedNodeIds: uniqueNormalizedStrings(
        ranked.flatMap((vision) => vision.visitedNodeIds),
      ),
      frontierNodeIds: uniqueNormalizedStrings(
        ranked.flatMap((vision) => vision.frontierNodeIds),
      ),
      injectedItemIds: uniqueNormalizedStrings(
        ranked.flatMap((vision) => vision.injectedItemIds),
      ),
      checkpointIds: uniqueNormalizedStrings(
        ranked.flatMap((vision) => vision.checkpointIds),
      ),
      score: Math.max(...ranked.map((vision) => vision.score)),
    });
  }

  return { visions: merged, mergedVisionIds };
}

export function createProgressiveVisionEnsemble(
  input: CreateProgressiveVisionEnsembleInput,
): ProgressiveVisionEnsemble {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const policy = resolvePolicy(input.policy);
  const spawned = createFromSeeds({
    task: input.task,
    scope: input.scope,
    contextField: input.contextField,
    branches: input.branches,
    seeds: input.seeds,
    memoryRevision: input.memoryRevision,
    policy,
    createdAt,
  });
  const merged = mergeEquivalentVisions(spawned.visions);
  const beam = selectProgressiveVisionBeam(merged.visions, policy);

  return {
    id: `vision-ensemble-${stableHash({
      task: input.task,
      scope: input.scope,
      createdAt,
    })}`,
    task: input.task,
    scope: input.scope,
    contextRevision: input.contextField.revision,
    memoryRevision: input.memoryRevision,
    cycle: 0,
    dominantVisionId: beam.dominantVisionId,
    activeVisionIds: beam.activeVisionIds,
    deferredVisionIds: beam.deferredVisionIds,
    visions: beam.visions,
    policy,
    createdAt,
    updatedAt: createdAt,
  };
}

function observationsByVision(
  observations: AdvanceProgressiveVisionEnsembleInput["observations"],
): Map<string, AdvanceProgressiveVisionEnsembleInput["observations"][number]> {
  return new Map(observations.map((item) => [item.visionId, item]));
}

function branchIdsExist(
  vision: ProgressiveVision,
  branches: readonly VisionBranchCandidate[],
): boolean {
  const known = new Set(branches.map((branch) => branch.id));
  return vision.branchIds.some((id) => known.has(id));
}

export function advanceProgressiveVisionEnsemble(
  input: AdvanceProgressiveVisionEnsembleInput,
): AdvanceProgressiveVisionEnsembleResult {
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  const task = input.task ?? input.previous.task;
  const observations = observationsByVision(input.observations);
  const checkpoints: VisionCheckpoint[] = [];
  const reevaluated: ProgressiveVision[] = [];
  const prunedVisionIds: string[] = [];
  const backtrackEligibleVisionIds: string[] = [];

  for (const vision of input.previous.visions) {
    if (!branchIdsExist(vision, input.branches)) {
      reevaluated.push({
        ...vision,
        contextRevision: input.contextField.revision,
        memoryRevision: input.memoryRevision,
        status: "pruned",
        updatedAt,
      });
      prunedVisionIds.push(vision.id);
      continue;
    }

    const result = revalidateProgressiveVision({
      vision,
      task,
      currentScope: input.previous.scope,
      contextField: input.contextField,
      branches: input.branches,
      evidence: input.evidence,
      observation: observations.get(vision.id) ?? null,
      memoryRevision: input.memoryRevision,
      policy: input.previous.policy,
      updatedAt,
    });
    reevaluated.push(result.vision);

    if (result.checkpoint !== null) {
      checkpoints.push(result.checkpoint);
    }

    if (result.vision.status === "pruned") {
      prunedVisionIds.push(result.vision.id);
    }

    if (
      result.vision.checkpointIds.length > 0 &&
      (result.vision.status === "pruned" || result.vision.status === "exhausted")
    ) {
      backtrackEligibleVisionIds.push(result.vision.id);
    }
  }

  const spawned = createFromSeeds({
    task,
    scope: input.previous.scope,
    contextField: input.contextField,
    branches: input.branches,
    seeds: input.newSeeds,
    memoryRevision: input.memoryRevision,
    policy: input.previous.policy,
    createdAt: updatedAt,
  });
  const combined = [...reevaluated, ...spawned.visions];
  const merged = mergeEquivalentVisions(combined);
  const beam = selectProgressiveVisionBeam(
    merged.visions,
    input.previous.policy,
  );
  return {
    ensemble: {
      ...input.previous,
      task,
      contextRevision: input.contextField.revision,
      memoryRevision: input.memoryRevision,
      cycle: input.previous.cycle + 1,
      dominantVisionId: beam.dominantVisionId,
      activeVisionIds: beam.activeVisionIds,
      deferredVisionIds: beam.deferredVisionIds,
      visions: beam.visions,
      updatedAt,
    },
    checkpoints,
    spawnedVisionIds: spawned.visions.map((vision) => vision.id),
    splitVisionIds: spawned.splitVisionIds,
    mergedVisionIds: merged.mergedVisionIds,
    supersededVisionIds: beam.supersededVisionIds,
    prunedVisionIds: uniqueNormalizedStrings(prunedVisionIds),
    backtrackEligibleVisionIds: uniqueNormalizedStrings(
      backtrackEligibleVisionIds,
    ),
  };
}
