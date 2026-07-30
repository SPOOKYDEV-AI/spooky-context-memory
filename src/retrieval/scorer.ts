import type {
  MemoryNode,
  MemoryScope,
  RetrievalScore,
} from "../domain/types.js";

const ACTIVE_STATUS_SCORE = 1;
const SUPERSEDED_STATUS_PENALTY = 0.45;
const DEPRECATED_STATUS_PENALTY = 0.65;
const QUARANTINED_STATUS_PENALTY = 1;

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function commonPathRatio(pathA: string, pathB: string): number {
  const a = pathA.split("/").filter(Boolean);
  const b = pathB.split("/").filter(Boolean);
  const maxLength = Math.max(a.length, b.length);

  if (maxLength === 0) {
    return 1;
  }

  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) {
    common += 1;
  }

  return common / maxLength;
}

function exactScopePart(
  current: string | undefined,
  candidate: string | undefined,
): number | undefined {
  if (!current || !candidate) {
    return undefined;
  }

  return current === candidate ? 1 : 0;
}

function calculateScopeMatch(
  currentScope: MemoryScope,
  nodeScope: MemoryScope,
): number {
  const parts = [
    exactScopePart(currentScope.userId, nodeScope.userId),
    exactScopePart(currentScope.projectId, nodeScope.projectId),
    exactScopePart(currentScope.workflowId, nodeScope.workflowId),
    exactScopePart(currentScope.taskId, nodeScope.taskId),
  ].filter((value): value is number => value !== undefined);

  if (parts.length === 0) {
    return 0.5;
  }

  return parts.reduce((sum, value) => sum + value, 0) / parts.length;
}

function calculateFreshness(node: MemoryNode, now: Date): number {
  if (node.metadata.validUntil) {
    const validUntil = new Date(node.metadata.validUntil);
    if (validUntil.getTime() < now.getTime()) {
      return 0;
    }
  }

  const updatedAt = new Date(node.metadata.updatedAt);
  const ageInDays = Math.max(
    0,
    (now.getTime() - updatedAt.getTime()) / 86_400_000,
  );

  return clamp(1 - ageInDays / 365);
}

function calculateStatusPenalty(node: MemoryNode): number {
  switch (node.status) {
    case "active":
      return 1 - ACTIVE_STATUS_SCORE;
    case "superseded":
      return SUPERSEDED_STATUS_PENALTY;
    case "deprecated":
      return DEPRECATED_STATUS_PENALTY;
    case "quarantined":
      return QUARANTINED_STATUS_PENALTY;
  }
}

export interface ScoreNodeInput {
  node: MemoryNode;
  currentScope: MemoryScope;
  anchorPaths: string[];
  semanticRelevance: number;
  edgeWeight?: number;
  now: Date;
}

export function scoreNode(input: ScoreNodeInput): RetrievalScore {
  const nearestAnchor = Math.max(
    0,
    ...input.anchorPaths.map((path) => commonPathRatio(path, input.node.path)),
  );

  const semanticRelevance = clamp(input.semanticRelevance);
  const scopeMatch = calculateScopeMatch(input.currentScope, input.node.scope);
  const pathProximity = clamp(nearestAnchor * (input.edgeWeight ?? 1));
  const confidence = clamp(input.node.metadata.confidence);
  const freshness = calculateFreshness(input.node, input.now);
  const sourceTrust = clamp(input.node.metadata.sourceTrust);
  const contaminationPenalty = calculateStatusPenalty(input.node);

  const total = clamp(
    semanticRelevance * 0.3 +
      scopeMatch * 0.25 +
      pathProximity * 0.15 +
      confidence * 0.1 +
      freshness * 0.1 +
      sourceTrust * 0.1 -
      contaminationPenalty,
  );

  return {
    semanticRelevance,
    scopeMatch,
    pathProximity,
    confidence,
    freshness,
    sourceTrust,
    contaminationPenalty,
    total,
  };
}
