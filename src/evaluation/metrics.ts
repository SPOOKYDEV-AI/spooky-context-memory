export interface RetrievalEvaluationSample {
  expectedCapsuleIds: string[];
  injectedCapsuleIds: string[];
  prunedRelevantCapsuleIds: string[];
  repeatedKnownError: boolean;
  visitedNodeCount: number;
  injectedTokenEstimate: number;
}

export interface RetrievalEvaluationMetrics {
  precision: number;
  recall: number;
  falsePruningRate: number;
  knownErrorRepetitionRate: number;
  averageVisitedNodes: number;
  averageInjectedTokenEstimate: number;
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function evaluateRetrievalSamples(
  samples: readonly RetrievalEvaluationSample[],
): RetrievalEvaluationMetrics {
  let truePositive = 0;
  let injectedTotal = 0;
  let expectedTotal = 0;
  let falsePruned = 0;
  let repeatedErrors = 0;
  let visitedNodes = 0;
  let injectedTokens = 0;

  for (const sample of samples) {
    const expected = new Set(sample.expectedCapsuleIds);
    truePositive += sample.injectedCapsuleIds.filter((id) => expected.has(id)).length;
    injectedTotal += sample.injectedCapsuleIds.length;
    expectedTotal += sample.expectedCapsuleIds.length;
    falsePruned += sample.prunedRelevantCapsuleIds.length;
    repeatedErrors += sample.repeatedKnownError ? 1 : 0;
    visitedNodes += sample.visitedNodeCount;
    injectedTokens += sample.injectedTokenEstimate;
  }

  return {
    precision: safeDivide(truePositive, injectedTotal),
    recall: safeDivide(truePositive, expectedTotal),
    falsePruningRate: safeDivide(falsePruned, expectedTotal),
    knownErrorRepetitionRate: safeDivide(repeatedErrors, samples.length),
    averageVisitedNodes: safeDivide(visitedNodes, samples.length),
    averageInjectedTokenEstimate: safeDivide(injectedTokens, samples.length),
  };
}
