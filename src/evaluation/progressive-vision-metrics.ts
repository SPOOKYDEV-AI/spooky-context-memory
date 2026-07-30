export interface ProgressiveVisionMetricSnapshot {
  totalVisionCount: number;
  activeVisionCount: number;
  deferredVisionCount: number;
  prunedVisionCount: number;
  exhaustedVisionCount: number;
  supersededVisionCount: number;
  loopBlockedCount: number;
  backtrackCount: number;
  visitedStateCount: number;
  uniqueVisitedStateCount: number;
  visitedNodeCount: number;
  injectedItemCount: number;
  resolvedQuestionCount: number;
  initialQuestionCount: number;
}

export interface ProgressiveVisionMetrics {
  beamUtilization: number;
  eliminationRate: number;
  loopRate: number;
  revisitEfficiency: number;
  backtrackRate: number;
  stateNoveltyRate: number;
  traversalEfficiency: number;
  injectionEfficiency: number;
  questionCoverage: number;
}

export interface ProgressiveVisionOutcomeRecord {
  visionId: string;
  selected: boolean;
  applicable: boolean;
  causedContextBleed: boolean;
  lostTransition: boolean;
  reusedWrongFix: boolean;
  falselyPruned: boolean;
}

export interface ProgressiveVisionQualityRates {
  wrongFixReuseRate: number;
  falsePruningRate: number;
  contextBleedRate: number;
  transitionLossRate: number;
  selectionPrecision: number;
  selectionRecall: number;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function ratio(numerator: number, denominator: number): number {
  return denominator <= 0 ? 0 : clamp(numerator / denominator);
}

export function calculateProgressiveVisionMetrics(
  snapshot: ProgressiveVisionMetricSnapshot,
): ProgressiveVisionMetrics {
  const eliminated =
    snapshot.prunedVisionCount +
    snapshot.exhaustedVisionCount +
    snapshot.supersededVisionCount;
  const repeatedStates = Math.max(
    0,
    snapshot.visitedStateCount - snapshot.uniqueVisitedStateCount,
  );

  return {
    beamUtilization: ratio(snapshot.activeVisionCount, snapshot.totalVisionCount),
    eliminationRate: ratio(eliminated, snapshot.totalVisionCount),
    loopRate: ratio(snapshot.loopBlockedCount, snapshot.visitedStateCount),
    revisitEfficiency:
      repeatedStates === 0
        ? 1
        : clamp(1 - snapshot.loopBlockedCount / repeatedStates),
    backtrackRate: ratio(snapshot.backtrackCount, snapshot.visitedStateCount),
    stateNoveltyRate: ratio(
      snapshot.uniqueVisitedStateCount,
      snapshot.visitedStateCount,
    ),
    traversalEfficiency: ratio(
      snapshot.resolvedQuestionCount,
      snapshot.visitedNodeCount,
    ),
    injectionEfficiency: ratio(
      snapshot.resolvedQuestionCount,
      Math.max(1, snapshot.injectedItemCount),
    ),
    questionCoverage: ratio(
      snapshot.resolvedQuestionCount,
      snapshot.initialQuestionCount,
    ),
  };
}

export function calculateProgressiveVisionQualityRates(
  records: readonly ProgressiveVisionOutcomeRecord[],
): ProgressiveVisionQualityRates {
  const selected = records.filter((record) => record.selected);
  const applicable = records.filter((record) => record.applicable);
  const trueSelections = selected.filter((record) => record.applicable).length;

  return {
    wrongFixReuseRate: ratio(
      records.filter((record) => record.reusedWrongFix).length,
      records.length,
    ),
    falsePruningRate: ratio(
      records.filter((record) => record.falselyPruned).length,
      applicable.length,
    ),
    contextBleedRate: ratio(
      records.filter((record) => record.causedContextBleed).length,
      selected.length,
    ),
    transitionLossRate: ratio(
      records.filter((record) => record.lostTransition).length,
      records.length,
    ),
    selectionPrecision: ratio(trueSelections, selected.length),
    selectionRecall: ratio(trueSelections, applicable.length),
  };
}
