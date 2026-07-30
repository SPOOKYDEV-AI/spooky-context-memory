import type { MemoryVision } from "../visions/types.js";

export interface RoutableMemoryNode {
  id: string;
  branchId: string;
  estimatedRelevance: number;
  applicabilityConfidence: number;
  contaminationRisk: number;
  contradictionRisk: number;
  unknownConditionCount: number;
  evidenceStrength: number;
}

export interface RoutableMemoryEdge {
  sourceNodeId: string;
  targetNodeId: string;
  cost: number;
}

export interface RoutingStopPolicy {
  minimumApplicability: number;
  minimumEvidenceConfidence: number;
  maximumContaminationRisk: number;
  maximumContradictionRisk: number;
  maxResults: number;
}

export interface HeuristicRoutingRequest {
  nodes: RoutableMemoryNode[];
  edges: RoutableMemoryEdge[];
  startNodeIds: string[];
  vision: MemoryVision;
  stopPolicy?: Partial<RoutingStopPolicy>;
}

export interface RoutedMemoryCandidate {
  nodeId: string;
  branchId: string;
  totalCost: number;
  path: string[];
  applicabilityConfidence: number;
}

export interface HeuristicRoutingResult {
  candidates: RoutedMemoryCandidate[];
  visitedNodeIds: string[];
  prunedNodeIds: string[];
  deferredNodeIds: string[];
  exhausted: boolean;
  durationMs: number;
}

export interface BeliefHypothesis {
  id: string;
  priorProbability: number;
}

export interface BeliefEvidence {
  hypothesisId: string;
  independenceKey: string;
  likelihoodRatio: number;
  evidenceId: string;
}

export interface UpdatedBelief {
  hypothesisId: string;
  priorProbability: number;
  posteriorProbability: number;
  appliedEvidenceIds: string[];
}
