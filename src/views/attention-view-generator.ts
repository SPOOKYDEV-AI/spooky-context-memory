import { normalizeText, uniqueNormalizedStrings } from "../utils/normalized-set.js";
import { stableHash } from "../utils/stable-hash.js";
import type { AttentionFocus } from "../attention/types.js";
import type { ProgressiveVisionSeed } from "../visions/progressive-types.js";
import type {
  AttentionView,
  AttentionViewEvidence,
  AttentionViewProposal,
} from "./types.js";

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function aggregateIndependentEvidence(
  evidence: AttentionViewEvidence[],
  effect: AttentionViewEvidence["effect"],
): number {
  const strongest = new Map<string, number>();
  for (const item of evidence) {
    if (item.effect !== effect) {
      continue;
    }
    strongest.set(
      item.independenceKey,
      Math.max(strongest.get(item.independenceKey) ?? 0, clamp(item.weight)),
    );
  }
  let remaining = 1;
  for (const weight of strongest.values()) {
    remaining *= 1 - weight;
  }
  return 1 - remaining;
}

function attentionCoverage(
  proposal: AttentionViewProposal,
  focuses: AttentionFocus[],
): number {
  const active = focuses.filter((focus) =>
    ["pinned", "dominant", "active"].includes(focus.status),
  );
  const activeWeight = active.reduce((sum, focus) => sum + focus.weight, 0);
  if (activeWeight === 0) {
    return proposal.attentionIds.length === 0 ? 1 : 0;
  }
  const proposalIds = new Set(proposal.attentionIds);
  const coveredWeight = active
    .filter((focus) => proposalIds.has(focus.id))
    .reduce((sum, focus) => sum + focus.weight, 0);
  return clamp(coveredWeight / activeWeight);
}

function toProgressiveSeed(
  proposal: AttentionViewProposal,
  contextAnchorIds: string[],
): ProgressiveVisionSeed {
  return {
    id: `seed-${proposal.id}`,
    hypothesis: proposal.hypothesis,
    branchIds: uniqueNormalizedStrings(proposal.branchIds),
    contextAnchorIds: uniqueNormalizedStrings(contextAnchorIds),
    unresolvedQuestions: uniqueNormalizedStrings(proposal.questionsCovered),
    priorUtility: clamp(proposal.priorUtility),
    noveltyScore: clamp(proposal.noveltyScore),
    scope: { ...proposal.scope },
    sharedAcrossProjects: proposal.sharedAcrossProjects,
  };
}

export function createAttentionView(
  proposal: AttentionViewProposal,
  focuses: AttentionFocus[],
  evidence: AttentionViewEvidence[],
  contextRevision: number,
  memoryRevision: number,
  truthRevision: number,
  createdAt: string,
): AttentionView {
  const relevantFocuses = focuses.filter((focus) =>
    proposal.attentionIds.includes(focus.id),
  );
  const contextAnchorIds = uniqueNormalizedStrings(
    relevantFocuses.flatMap((focus) => focus.contextAnchorIds),
  );
  const relevantEvidence = evidence.filter((item) => item.viewId === proposal.id);
  const supportScore = aggregateIndependentEvidence(relevantEvidence, "supports");
  const contradictionScore = aggregateIndependentEvidence(
    relevantEvidence,
    "contradicts",
  );
  const attentionCoverageScore = attentionCoverage(proposal, focuses);
  const questionCoverageScore = proposal.questionsCovered.length === 0 ? 0 : 1;
  const costPenalty = clamp(proposal.expectedCost);
  const progressiveVisionSeed = toProgressiveSeed(proposal, contextAnchorIds);
  const partial: AttentionView = {
    ...proposal,
    attentionIds: uniqueNormalizedStrings(proposal.attentionIds),
    truthAnchorIds: uniqueNormalizedStrings(proposal.truthAnchorIds),
    assumptionIds: uniqueNormalizedStrings(proposal.assumptionIds),
    branchIds: uniqueNormalizedStrings(proposal.branchIds),
    questionsCovered: uniqueNormalizedStrings(proposal.questionsCovered),
    conclusions: proposal.conclusions.map((conclusion) => ({
      ...conclusion,
      key: normalizeText(conclusion.key),
      statement: conclusion.statement.trim(),
      confidence: clamp(conclusion.confidence),
    })),
    contextRevision,
    memoryRevision,
    truthRevision,
    eligibleBranchIds: [],
    supportScore,
    contradictionScore,
    attentionCoverageScore,
    questionCoverageScore,
    truthConsistencyScore: 1,
    costPenalty,
    score: 0,
    status: "candidate",
    rejectionReasons: [],
    progressiveVisionSeed,
    createdAt,
    updatedAt: createdAt,
  };
  partial.score = clamp(
    proposal.priorUtility * 0.22 +
      supportScore * 0.18 +
      attentionCoverageScore * 0.18 +
      questionCoverageScore * 0.1 +
      proposal.noveltyScore * 0.12 +
      partial.truthConsistencyScore * 0.12 +
      (1 - proposal.riskIfWrong) * 0.04 -
      contradictionScore * 0.2 -
      costPenalty * 0.08,
  );
  return partial;
}

export function attentionViewSignature(view: Pick<AttentionViewProposal, "hypothesis" | "attentionIds" | "branchIds" | "scope">): string {
  return stableHash({
    hypothesis: normalizeText(view.hypothesis),
    attentionIds: [...view.attentionIds].sort(),
    branchIds: [...view.branchIds].sort(),
    scope: view.scope,
  });
}
