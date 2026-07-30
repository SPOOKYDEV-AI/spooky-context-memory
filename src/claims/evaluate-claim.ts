import type {
  ClaimEvaluation,
  ClaimEvidenceLink,
  MemoryClaim,
  MemoryClaimStatus,
} from "./types.js";

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function groupedEvidenceScore(
  evidence: readonly ClaimEvidenceLink[],
  effect: ClaimEvidenceLink["effect"],
): { score: number; count: number } {
  const strongestByGroup = new Map<string, number>();

  for (const item of evidence) {
    if (item.effect !== effect) {
      continue;
    }

    const weight = clamp(item.weight);
    const previous = strongestByGroup.get(item.independenceKey) ?? 0;
    strongestByGroup.set(item.independenceKey, Math.max(previous, weight));
  }

  const score = Array.from(strongestByGroup.values()).reduce(
    (total, weight) => total + weight,
    0,
  );

  return { score, count: strongestByGroup.size };
}

function resolveStatus(
  supportScore: number,
  contradictionScore: number,
  supportCount: number,
): MemoryClaimStatus {
  if (supportScore === 0 && contradictionScore === 0) {
    return "unverified";
  }

  if (contradictionScore > 0 && supportScore === 0) {
    return "refuted";
  }

  if (supportScore > 0 && contradictionScore > 0) {
    return "disputed";
  }

  if (supportScore >= 1.5 && supportCount >= 2) {
    return "verified";
  }

  return "supported";
}

export function evaluateMemoryClaim(claim: MemoryClaim): ClaimEvaluation {
  const support = groupedEvidenceScore(claim.evidence, "supports");
  const contradiction = groupedEvidenceScore(claim.evidence, "contradicts");
  const status = resolveStatus(
    support.score,
    contradiction.score,
    support.count,
  );
  const total = support.score + contradiction.score;
  const evidenceBalance =
    total === 0 ? 0 : (support.score - contradiction.score) / total;
  const confidence = clamp(
    status === "unverified"
      ? Math.min(claim.confidence, 0.49)
      : claim.confidence * 0.35 + ((evidenceBalance + 1) / 2) * 0.65,
  );
  const reasons: string[] = [];

  if (status === "unverified") {
    reasons.push("The claim has no independent supporting or contradicting evidence.");
  }

  if (support.count > 0) {
    reasons.push(`${support.count} independent evidence group(s) support the claim.`);
  }

  if (contradiction.count > 0) {
    reasons.push(
      `${contradiction.count} independent evidence group(s) contradict the claim.`,
    );
  }

  return {
    claimId: claim.id,
    status,
    confidence,
    supportScore: support.score,
    contradictionScore: contradiction.score,
    independentSupportCount: support.count,
    independentContradictionCount: contradiction.count,
    reasons,
  };
}
