import { clonePlainData } from "../utils/clone-plain-data.js";
import { uniqueNormalizedStrings } from "../utils/normalized-set.js";
import { stableHash } from "../utils/stable-hash.js";
import type {
  CapsuleOutcomeObservation,
  CapsuleRefinementPlan,
  MemoryLinkObservation,
  PlasticMemoryGraph,
  PlasticMemoryLink,
  PlasticMemoryLinkEvidence,
  PlasticityUpdateResult,
} from "./types.js";

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function linkId(observation: MemoryLinkObservation): string {
  return `plastic-link-${stableHash({
    sourceId: observation.sourceId,
    targetId: observation.targetId,
    relation: observation.relation,
    scope: observation.scope,
  })}`;
}

function evidenceId(observation: MemoryLinkObservation): string {
  return `plastic-evidence-${stableHash({
    sourceId: observation.sourceId,
    targetId: observation.targetId,
    relation: observation.relation,
    effect: observation.effect,
    independenceKey: observation.independenceKey,
    observedAt: observation.observedAt,
  })}`;
}

function aggregateIndependentEvidence(
  evidence: PlasticMemoryLinkEvidence[],
  ids: string[],
  effect: PlasticMemoryLinkEvidence["effect"],
): number {
  const idSet = new Set(ids);
  const strongest = new Map<string, number>();
  for (const item of evidence) {
    if (!idSet.has(item.id) || item.effect !== effect) {
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

function classifyLink(
  link: PlasticMemoryLink,
  evidence: PlasticMemoryLinkEvidence[],
): PlasticMemoryLink {
  const support = aggregateIndependentEvidence(
    evidence,
    link.supportEvidenceIds,
    "supports",
  );
  const contradiction = aggregateIndependentEvidence(
    evidence,
    link.contradictionEvidenceIds,
    "contradicts",
  );
  const confidence = clamp(0.5 + support * 0.48 - contradiction * 0.58);
  const independentSupport = new Set(
    evidence
      .filter(
        (item) =>
          item.effect === "supports" && link.supportEvidenceIds.includes(item.id),
      )
      .map((item) => item.independenceKey),
  ).size;
  const status =
    contradiction >= 0.62 && contradiction >= support * 0.85
      ? "disputed"
      : independentSupport >= 3 && confidence >= 0.82
        ? "verified"
        : independentSupport >= 2 && confidence >= 0.68
          ? "supported"
          : "candidate";
  return { ...link, confidence, status };
}

export function createPlasticMemoryGraph(
  createdAt = new Date().toISOString(),
): PlasticMemoryGraph {
  return { revision: 1, links: [], evidence: [], updatedAt: createdAt };
}

export function updatePlasticMemoryGraph(
  graph: PlasticMemoryGraph,
  observations: MemoryLinkObservation[],
  updatedAt = new Date().toISOString(),
): PlasticityUpdateResult {
  const next = clonePlainData(graph);
  const createdLinkIds: string[] = [];
  const changedLinkIds: string[] = [];

  for (const observation of observations) {
    const id = linkId(observation);
    const evidence: PlasticMemoryLinkEvidence = {
      id: evidenceId(observation),
      effect: observation.effect,
      weight: clamp(observation.weight),
      independenceKey: observation.independenceKey,
      contextIds: uniqueNormalizedStrings(observation.contextIds),
      observedAt: observation.observedAt,
    };
    if (!next.evidence.some((item) => item.id === evidence.id)) {
      next.evidence.push(evidence);
    }
    const existingIndex = next.links.findIndex((link) => link.id === id);
    if (existingIndex < 0) {
      const created: PlasticMemoryLink = {
        id,
        sourceId: observation.sourceId,
        targetId: observation.targetId,
        relation: observation.relation,
        scope: clonePlainData(observation.scope),
        confidence: 0.5,
        status: "candidate",
        supportEvidenceIds:
          observation.effect === "supports" ? [evidence.id] : [],
        contradictionEvidenceIds:
          observation.effect === "contradicts" ? [evidence.id] : [],
        contextAnchorIds: uniqueNormalizedStrings(observation.contextIds),
        version: 1,
        createdAt: observation.observedAt,
        updatedAt,
      };
      next.links.push(classifyLink(created, next.evidence));
      createdLinkIds.push(id);
    } else {
      const existing = next.links[existingIndex]!;
      const changed: PlasticMemoryLink = {
        ...existing,
        supportEvidenceIds:
          observation.effect === "supports"
            ? uniqueNormalizedStrings([...existing.supportEvidenceIds, evidence.id])
            : [...existing.supportEvidenceIds],
        contradictionEvidenceIds:
          observation.effect === "contradicts"
            ? uniqueNormalizedStrings([
                ...existing.contradictionEvidenceIds,
                evidence.id,
              ])
            : [...existing.contradictionEvidenceIds],
        contextAnchorIds: uniqueNormalizedStrings([
          ...existing.contextAnchorIds,
          ...observation.contextIds,
        ]),
        version: existing.version + 1,
        updatedAt,
      };
      next.links[existingIndex] = classifyLink(changed, next.evidence);
      changedLinkIds.push(id);
    }
  }

  next.revision += observations.length > 0 ? 1 : 0;
  next.updatedAt = updatedAt;
  const disputedLinkIds = next.links
    .filter((link) => link.status === "disputed")
    .map((link) => link.id);
  return {
    graph: next,
    createdLinkIds,
    changedLinkIds,
    disputedLinkIds,
  };
}

export function deriveCapsuleRefinementPlans(
  observations: CapsuleOutcomeObservation[],
): CapsuleRefinementPlan[] {
  const byCapsule = new Map<string, CapsuleOutcomeObservation[]>();
  for (const observation of observations) {
    const group = byCapsule.get(observation.capsuleId) ?? [];
    group.push(observation);
    byCapsule.set(observation.capsuleId, group);
  }
  const plans: CapsuleRefinementPlan[] = [];
  for (const [capsuleId, group] of byCapsule) {
    const independent = new Map<string, CapsuleOutcomeObservation>();
    for (const observation of group) {
      const current = independent.get(observation.independentContextKey);
      if (current === undefined || observation.confidence > current.confidence) {
        independent.set(observation.independentContextKey, observation);
      }
    }
    const items = [...independent.values()];
    const supported = items.filter((item) =>
      ["supported", "partially_supported"].includes(item.verdict),
    );
    const rejected = items.filter((item) =>
      [
        "contradicted",
        "context_mismatch",
        "scope_mismatch",
        "truth_conflict",
      ].includes(item.verdict),
    );
    const discriminators = uniqueNormalizedStrings(
      items.flatMap((item) => item.discriminators),
    );
    let action: CapsuleRefinementPlan["action"] = "retain_raw_trace";
    let reason = "Evidence remains insufficient for active capsule refinement.";
    if (supported.length >= 3 && rejected.length === 0) {
      action = "reinforce";
      reason = "The capsule predicted outcomes across at least three independent contexts.";
    } else if (supported.length >= 2 && rejected.length >= 2 && discriminators.length >= 2) {
      action = "split";
      reason = "Independent evidence suggests multiple mechanisms were merged into one capsule.";
    } else if (supported.length >= 1 && rejected.length >= 1 && discriminators.length > 0) {
      action = "narrow";
      reason = "Mixed outcomes revealed reusable applicability discriminators.";
    } else if (rejected.length >= 2 && supported.length === 0) {
      action = "dispute";
      reason = "The capsule repeatedly failed to predict outcomes in independent contexts.";
    } else if (supported.length >= 2 && discriminators.length > 0) {
      action = "extend";
      reason = "Repeated support adds new scoped applicability information.";
    }
    const confidence = clamp(
      items.length === 0
        ? 0
        : items.reduce((sum, item) => sum + item.confidence, 0) / items.length,
    );
    plans.push({
      capsuleId,
      action,
      reason,
      supportingViewIds: uniqueNormalizedStrings(supported.map((item) => item.viewId)),
      rejectedViewIds: uniqueNormalizedStrings(rejected.map((item) => item.viewId)),
      discriminators,
      confidence,
    });
  }
  return plans;
}
