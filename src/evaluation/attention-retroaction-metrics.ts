import type { MemoryAttentionField } from "../attention/types.js";
import type { DynamicEquilibriumResult } from "../equilibrium/types.js";
import type { PlasticMemoryGraph } from "../plasticity/types.js";
import type { RejectedViewLedger, CrossViewTriageResult } from "../views/types.js";

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizedEntropy(weights: number[]): number {
  const positive = weights.filter((weight) => weight > 0);
  const total = positive.reduce((sum, weight) => sum + weight, 0);
  if (positive.length <= 1 || total === 0) {
    return 0;
  }
  const entropy = positive.reduce((sum, weight) => {
    const probability = weight / total;
    return sum - probability * Math.log(probability);
  }, 0);
  return clamp(entropy / Math.log(positive.length));
}

export interface AttentionRetroactionMetrics {
  attentionDiversity: number;
  attentionConcentration: number;
  activeViewYield: number;
  rejectedViewLearningDensity: number;
  truthConflictRate: number;
  contradictionDiscoveryRate: number;
  progressiveSeedYield: number;
  plasticLinkVerificationRate: number;
  plasticLinkDisputeRate: number;
  equilibriumCorrectionLoad: number;
  criticalDebtRate: number;
}

export interface MeasureAttentionRetroactionInput {
  attentionField: MemoryAttentionField;
  triage: CrossViewTriageResult;
  rejectedViewLedger: RejectedViewLedger;
  plasticMemoryGraph: PlasticMemoryGraph;
  equilibrium: DynamicEquilibriumResult;
}

export function measureAttentionRetroaction(
  input: MeasureAttentionRetroactionInput,
): AttentionRetroactionMetrics {
  const activeFocuses = input.attentionField.focuses.filter((focus) =>
    ["pinned", "dominant", "active"].includes(focus.status),
  );
  const attentionDiversity = normalizedEntropy(
    activeFocuses.map((focus) => focus.weight),
  );
  const maxWeight = Math.max(0, ...activeFocuses.map((focus) => focus.weight));
  const totalWeight = activeFocuses.reduce((sum, focus) => sum + focus.weight, 0);
  const attentionConcentration = totalWeight === 0 ? 0 : clamp(maxWeight / totalWeight);
  const totalViews = input.triage.views.length;
  const activeViewYield = totalViews === 0 ? 0 : clamp(input.triage.activeViewIds.length / totalViews);
  const rejectedViewLearningDensity =
    input.rejectedViewLedger.traces.length === 0
      ? 0
      : clamp(
          input.rejectedViewLedger.traces.filter(
            (trace) =>
              trace.reusableDiscriminators.length > 0 ||
              trace.revisitConditions.length > 0,
          ).length / input.rejectedViewLedger.traces.length,
        );
  const truthConflictRate =
    totalViews === 0
      ? 0
      : clamp(
          input.triage.rejectedTraces.filter(
            (trace) => trace.verdict === "truth_conflict",
          ).length / totalViews,
        );
  const contradictionDiscoveryRate =
    totalViews === 0
      ? 0
      : clamp(
          input.triage.views.filter((view) => view.status === "contradicted").length /
            totalViews,
        );
  const progressiveSeedYield =
    totalViews === 0
      ? 0
      : clamp(input.triage.generatedProgressiveVisionSeeds.length / totalViews);
  const totalLinks = input.plasticMemoryGraph.links.length;
  const plasticLinkVerificationRate =
    totalLinks === 0
      ? 0
      : clamp(
          input.plasticMemoryGraph.links.filter((link) => link.status === "verified")
            .length / totalLinks,
        );
  const plasticLinkDisputeRate =
    totalLinks === 0
      ? 0
      : clamp(
          input.plasticMemoryGraph.links.filter((link) => link.status === "disputed")
            .length / totalLinks,
        );
  const equilibriumCorrectionLoad = clamp(
    input.equilibrium.decisions.filter((decision) => decision.action !== "MAINTAIN")
      .length / 8,
  );
  const criticalDebtRate = clamp(
    input.equilibrium.snapshot.criticalExplorationDebtIds.length / 5,
  );
  return {
    attentionDiversity,
    attentionConcentration,
    activeViewYield,
    rejectedViewLearningDensity,
    truthConflictRate,
    contradictionDiscoveryRate,
    progressiveSeedYield,
    plasticLinkVerificationRate,
    plasticLinkDisputeRate,
    equilibriumCorrectionLoad,
    criticalDebtRate,
  };
}
