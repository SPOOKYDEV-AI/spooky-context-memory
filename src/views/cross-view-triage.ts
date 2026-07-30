import { resolveMemoryVision } from "../visions/resolve-vision.js";
import type { ProgressiveVisionSeed } from "../visions/progressive-types.js";
import { normalizeText, uniqueNormalizedStrings, weightedJaccardSimilarity } from "../utils/normalized-set.js";
import { stableHash } from "../utils/stable-hash.js";
import { createAttentionView, attentionViewSignature } from "./attention-view-generator.js";
import type {
  AttentionView,
  AttentionViewProposal,
  CrossViewConsensus,
  CrossViewTriageResult,
  GenerateAttentionViewsInput,
  RejectedViewTrace,
  ViewAssertion,
  ViewTriagePolicy,
} from "./types.js";

const DEFAULT_POLICY: ViewTriagePolicy = {
  maxActiveViews: 4,
  maxDeferredViews: 3,
  minimumPromisingScore: 0.28,
  contradictionThreshold: 0.78,
  truthConflictThreshold: 0.72,
  redundancyThreshold: 0.9,
  dominanceMargin: 0.06,
  minimumAttentionCoverage: 0.12,
};

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function resolvePolicy(input: GenerateAttentionViewsInput): ViewTriagePolicy {
  return { ...DEFAULT_POLICY, ...input.policy };
}

function projectScopeMatches(
  left: AttentionViewProposal["scope"],
  right: AttentionViewProposal["scope"],
  sharedAcrossProjects: boolean,
): boolean {
  if (sharedAcrossProjects) {
    return true;
  }
  return left.projectId === undefined || right.projectId === undefined || left.projectId === right.projectId;
}

function truthConsistency(
  view: AttentionView,
  input: GenerateAttentionViewsInput,
): { score: number; conflicts: string[] } {
  const activeTruths = input.epistemicCore.anchors.filter(
    (anchor) => anchor.status === "active" && ["authoritative", "verified", "supported", "observed"].includes(anchor.state),
  );
  const requested = new Set(view.truthAnchorIds);
  const existingIds = new Set(activeTruths.map((anchor) => anchor.id));
  const missing = view.truthAnchorIds.filter((id) => !existingIds.has(id));
  const assumptionConflicts = view.assumptionIds.filter((id) => requested.has(id));
  const conflicts = uniqueNormalizedStrings([...missing, ...assumptionConflicts]);
  const referenced = view.truthAnchorIds.length;
  const score = referenced === 0 ? 1 : clamp((referenced - conflicts.length) / referenced);
  return { score, conflicts };
}

function viewSimilarity(left: AttentionView, right: AttentionView): number {
  const hypothesis = normalizeText(left.hypothesis) === normalizeText(right.hypothesis) ? 1 : 0;
  const branches = weightedJaccardSimilarity(left.eligibleBranchIds, right.eligibleBranchIds);
  const attentions = weightedJaccardSimilarity(left.attentionIds, right.attentionIds);
  return hypothesis * 0.45 + branches * 0.35 + attentions * 0.2;
}

function mergeViews(left: AttentionView, right: AttentionView, now: string): AttentionView {
  const stronger = left.score >= right.score ? left : right;
  const conclusionsByKey = new Map<string, ViewAssertion>();
  for (const conclusion of [...left.conclusions, ...right.conclusions]) {
    const existing = conclusionsByKey.get(conclusion.key);
    if (existing === undefined || conclusion.confidence > existing.confidence) {
      conclusionsByKey.set(conclusion.key, conclusion);
    }
  }
  const merged: AttentionView = {
    ...stronger,
    id: `view-${stableHash({
      left: attentionViewSignature(left),
      right: attentionViewSignature(right),
    })}`,
    attentionIds: uniqueNormalizedStrings([...left.attentionIds, ...right.attentionIds]),
    truthAnchorIds: uniqueNormalizedStrings([...left.truthAnchorIds, ...right.truthAnchorIds]),
    assumptionIds: uniqueNormalizedStrings([...left.assumptionIds, ...right.assumptionIds]),
    branchIds: uniqueNormalizedStrings([...left.branchIds, ...right.branchIds]),
    eligibleBranchIds: uniqueNormalizedStrings([...left.eligibleBranchIds, ...right.eligibleBranchIds]),
    questionsCovered: uniqueNormalizedStrings([...left.questionsCovered, ...right.questionsCovered]),
    conclusions: [...conclusionsByKey.values()],
    supportScore: clamp(Math.max(left.supportScore, right.supportScore) + Math.min(left.supportScore, right.supportScore) * 0.15),
    contradictionScore: Math.min(left.contradictionScore, right.contradictionScore),
    attentionCoverageScore: clamp(Math.max(left.attentionCoverageScore, right.attentionCoverageScore)),
    questionCoverageScore: clamp(Math.max(left.questionCoverageScore, right.questionCoverageScore)),
    truthConsistencyScore: Math.min(left.truthConsistencyScore, right.truthConsistencyScore),
    costPenalty: Math.min(left.costPenalty, right.costPenalty),
    score: clamp(Math.max(left.score, right.score) + Math.min(left.score, right.score) * 0.08),
    status: "candidate",
    rejectionReasons: [],
    updatedAt: now,
  };
  merged.progressiveVisionSeed = merged.progressiveVisionSeed === null ? null : {
    ...merged.progressiveVisionSeed,
    id: `seed-${merged.id}`,
    hypothesis: merged.hypothesis,
    branchIds: [...merged.eligibleBranchIds],
    unresolvedQuestions: [...merged.questionsCovered],
    priorUtility: merged.score,
  };
  return merged;
}

function rejectedTrace(view: AttentionView, verdict: RejectedViewTrace["verdict"], now: string): RejectedViewTrace {
  return {
    id: `rejected-view-${stableHash({
      signature: attentionViewSignature(view),
      verdict,
      contextRevision: view.contextRevision,
    })}`,
    signature: attentionViewSignature(view),
    viewId: view.id,
    attentionAnchorIds: [...view.attentionIds],
    contextFingerprint: stableHash({
      revision: view.contextRevision,
      attentions: [...view.attentionIds].sort(),
      truths: [...view.truthAnchorIds].sort(),
    }),
    verdict,
    rejectionReasons: [...view.rejectionReasons],
    violatedConstraintIds: [],
    contradictionIds: [],
    reusableDiscriminators: [...view.rejectionReasons],
    revisitConditions: verdict === "missing_evidence" ? ["new_independent_evidence"] : ["context_or_truth_revision_changed"],
    occurrences: 1,
    firstObservedAt: now,
    lastObservedAt: now,
  };
}

function triageOne(
  view: AttentionView,
  input: GenerateAttentionViewsInput,
  policy: ViewTriagePolicy,
): AttentionView {
  const branchIds = new Set(view.branchIds);
  const selectedBranches = input.branches.filter((branch) => branchIds.has(branch.id));
  const vision = resolveMemoryVision({
    task: input.task,
    scope: input.scope,
    branches: selectedBranches,
    memoryRevision: input.attentionField.memoryRevision,
    createdAt: view.createdAt,
  });
  const truth = truthConsistency(view, input);
  const rejectionReasons: string[] = [];
  const scopeCompatible = projectScopeMatches(view.scope, input.scope, view.sharedAcrossProjects);

  if (!scopeCompatible) {
    rejectionReasons.push("scope_mismatch");
  }
  if (vision.allowedBranchIds.length === 0) {
    rejectionReasons.push("no_eligible_branch_after_hard_exclusions");
  }
  if (truth.score < policy.truthConflictThreshold) {
    rejectionReasons.push(...truth.conflicts.map((id) => `truth_conflict:${id}`));
  }
  if (view.contradictionScore >= policy.contradictionThreshold) {
    rejectionReasons.push("independent_contradictions_exceeded_threshold");
  }
  if (view.attentionCoverageScore < policy.minimumAttentionCoverage) {
    rejectionReasons.push("insufficient_attention_coverage");
  }

  const hardIneligible = !scopeCompatible || vision.allowedBranchIds.length === 0 || truth.score < policy.truthConflictThreshold;
  const contradicted = view.contradictionScore >= policy.contradictionThreshold;
  const score = clamp(
    view.priorUtility * 0.17 +
      view.supportScore * 0.17 +
      view.attentionCoverageScore * 0.18 +
      view.questionCoverageScore * 0.11 +
      view.noveltyScore * 0.1 +
      truth.score * 0.17 +
      vision.confidence * 0.1 -
      view.contradictionScore * 0.2 -
      view.costPenalty * 0.08 -
      view.riskIfWrong * 0.05,
  );
  const status = hardIneligible
    ? "ineligible"
    : contradicted
      ? "contradicted"
      : score >= policy.minimumPromisingScore
        ? "promising"
        : "deferred";
  const progressiveVisionSeed =
    status === "ineligible" || status === "contradicted" || view.progressiveVisionSeed === null
      ? null
      : {
          ...view.progressiveVisionSeed,
          branchIds: [...vision.allowedBranchIds],
          priorUtility: score,
        };

  return {
    ...view,
    eligibleBranchIds: [...vision.allowedBranchIds],
    truthConsistencyScore: truth.score,
    score,
    status,
    rejectionReasons,
    progressiveVisionSeed,
  };
}

function buildConsensus(views: AttentionView[]): CrossViewConsensus {
  const active = views.filter((view) => ["dominant", "promising"].includes(view.status));
  if (active.length === 0) {
    return {
      consensus: [],
      divergences: [],
      coverageGaps: [],
      commonAttentionIds: [],
      commonBranchIds: [],
    };
  }
  const byKey = new Map<string, Array<{ viewId: string; assertion: ViewAssertion }>>();
  const allQuestions = new Set<string>();
  for (const view of active) {
    view.questionsCovered.forEach((question) => allQuestions.add(question));
    for (const assertion of view.conclusions) {
      const entries = byKey.get(assertion.key) ?? [];
      entries.push({ viewId: view.id, assertion });
      byKey.set(assertion.key, entries);
    }
  }
  const consensus: ViewAssertion[] = [];
  const divergences: CrossViewConsensus["divergences"] = [];
  for (const [key, entries] of byKey) {
    const groups = new Map<string, Array<{ viewId: string; assertion: ViewAssertion }>>();
    for (const entry of entries) {
      const statementKey = normalizeText(entry.assertion.statement);
      const group = groups.get(statementKey) ?? [];
      group.push(entry);
      groups.set(statementKey, group);
    }
    const majority = [...groups.values()].sort((a, b) => b.length - a.length)[0];
    if (majority !== undefined && majority.length >= Math.max(2, Math.ceil(active.length * 0.6))) {
      consensus.push({
        key,
        statement: majority[0]!.assertion.statement,
        confidence: clamp(
          majority.reduce((sum, entry) => sum + entry.assertion.confidence, 0) / majority.length,
        ),
      });
    }
    if (groups.size > 1) {
      divergences.push({
        key,
        alternatives: [...groups.values()].map((group) => group[0]!.assertion),
        viewIds: uniqueNormalizedStrings(entries.map((entry) => entry.viewId)),
      });
    }
  }
  const commonAttentionIds = active
    .map((view) => new Set(view.attentionIds))
    .reduce((common, current) => new Set([...common].filter((id) => current.has(id))));
  const commonBranchIds = active
    .map((view) => new Set(view.eligibleBranchIds))
    .reduce((common, current) => new Set([...common].filter((id) => current.has(id))));
  const coveredQuestions = new Set(active.flatMap((view) => view.questionsCovered));
  const requestedQuestions = new Set(
    active.flatMap((view) => view.progressiveVisionSeed?.unresolvedQuestions ?? []),
  );
  const coverageGaps = [...requestedQuestions].filter((question) => !coveredQuestions.has(question));

  return {
    consensus,
    divergences,
    coverageGaps,
    commonAttentionIds: [...commonAttentionIds],
    commonBranchIds: [...commonBranchIds],
  };
}

export function generateAndTriageAttentionViews(
  input: GenerateAttentionViewsInput,
): CrossViewTriageResult {
  const now = input.generatedAt ?? input.attentionField.updatedAt;
  const policy = resolvePolicy(input);
  const evidence = input.evidence ?? [];
  let views = input.proposals.map((proposal) =>
    createAttentionView(
      proposal,
      input.attentionField.focuses,
      evidence,
      input.attentionField.contextRevision,
      input.attentionField.memoryRevision,
      input.epistemicCore.revision,
      now,
    ),
  );
  views = views.map((view) => triageOne(view, input, policy));

  const merged: AttentionView[] = [];
  const redundantViews: AttentionView[] = [];
  for (const view of views.sort((left, right) => right.score - left.score)) {
    if (["ineligible", "contradicted"].includes(view.status)) {
      merged.push(view);
      continue;
    }
    const existingIndex = merged.findIndex(
      (existing) =>
        !["ineligible", "contradicted"].includes(existing.status) &&
        viewSimilarity(existing, view) >= policy.redundancyThreshold,
    );
    if (existingIndex < 0) {
      merged.push(view);
    } else {
      const existing = merged[existingIndex]!;
      merged[existingIndex] = mergeViews(existing, view, now);
      redundantViews.push({
        ...view,
        status: "redundant",
        rejectionReasons: uniqueNormalizedStrings([
          ...view.rejectionReasons,
          `merged_into:${merged[existingIndex]!.id}`,
        ]),
      });
    }
  }

  const eligible = merged
    .filter((view) => ["promising", "deferred", "candidate"].includes(view.status))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  const active = eligible.slice(0, policy.maxActiveViews);
  const activeIds = new Set(active.map((view) => view.id));
  const deferred = eligible
    .filter((view) => !activeIds.has(view.id))
    .slice(0, policy.maxDeferredViews);
  const deferredIds = new Set(deferred.map((view) => view.id));
  const first = active[0];
  const second = active[1];
  const dominantViewId =
    first === undefined
      ? null
      : second === undefined || first.score - second.score >= policy.dominanceMargin
        ? first.id
        : null;

  const rankedViews = merged.map((view) => {
    if (view.id === dominantViewId) {
      return { ...view, status: "dominant" as const };
    }
    if (activeIds.has(view.id)) {
      return { ...view, status: "promising" as const };
    }
    if (deferredIds.has(view.id)) {
      return { ...view, status: "deferred" as const };
    }
    if (["ineligible", "contradicted", "redundant"].includes(view.status)) {
      return view;
    }
    return { ...view, status: "exhausted" as const };
  });

  const finalViews = [...rankedViews, ...redundantViews];

  const rejectedTraces = finalViews
    .filter((view) => ["ineligible", "contradicted", "redundant", "exhausted"].includes(view.status))
    .map((view) => {
      const verdict: RejectedViewTrace["verdict"] =
        view.status === "ineligible"
          ? view.rejectionReasons.some((reason) => reason.startsWith("truth_conflict"))
            ? "truth_conflict"
            : view.rejectionReasons.includes("scope_mismatch")
              ? "scope_mismatch"
              : "context_mismatch"
          : view.status === "contradicted"
            ? "contradicted"
            : view.status === "redundant"
              ? "redundant"
              : "missing_evidence";
      return rejectedTrace(view, verdict, now);
    });
  const generatedProgressiveVisionSeeds = finalViews
    .filter((view) => ["dominant", "promising", "deferred"].includes(view.status))
    .map((view) => view.progressiveVisionSeed)
    .filter((seed): seed is ProgressiveVisionSeed => seed !== null);

  return {
    views: finalViews,
    dominantViewId,
    activeViewIds: finalViews
      .filter((view) => ["dominant", "promising"].includes(view.status))
      .map((view) => view.id),
    deferredViewIds: finalViews
      .filter((view) => view.status === "deferred")
      .map((view) => view.id),
    rejectedTraces,
    consensus: buildConsensus(finalViews),
    generatedProgressiveVisionSeeds,
  };
}
