import type {
  HeuristicRoutingRequest,
  HeuristicRoutingResult,
  RoutableMemoryEdge,
  RoutableMemoryNode,
  RoutedMemoryCandidate,
  RoutingStopPolicy,
} from "./types.js";

interface QueueItem {
  nodeId: string;
  path: string[];
  travelledCost: number;
  estimatedTotalCost: number;
}

class MinHeap {
  private readonly items: QueueItem[] = [];

  public get size(): number {
    return this.items.length;
  }

  public push(item: QueueItem): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  public pop(): QueueItem | undefined {
    const first = this.items[0];
    const last = this.items.pop();

    if (!first) {
      return undefined;
    }

    if (this.items.length > 0 && last) {
      this.items[0] = last;
      this.bubbleDown(0);
    }

    return first;
  }

  private bubbleUp(startIndex: number): void {
    let index = startIndex;

    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this.items[parentIndex];
      const current = this.items[index];

      if (!parent || !current || parent.estimatedTotalCost <= current.estimatedTotalCost) {
        break;
      }

      [this.items[parentIndex], this.items[index]] = [current, parent];
      index = parentIndex;
    }
  }

  private bubbleDown(startIndex: number): void {
    let index = startIndex;

    while (true) {
      const leftIndex = index * 2 + 1;
      const rightIndex = leftIndex + 1;
      let smallestIndex = index;

      const left = this.items[leftIndex];
      const currentSmallest = this.items[smallestIndex];

      if (
        left &&
        currentSmallest &&
        left.estimatedTotalCost < currentSmallest.estimatedTotalCost
      ) {
        smallestIndex = leftIndex;
      }

      const right = this.items[rightIndex];
      const nextSmallest = this.items[smallestIndex];

      if (
        right &&
        nextSmallest &&
        right.estimatedTotalCost < nextSmallest.estimatedTotalCost
      ) {
        smallestIndex = rightIndex;
      }

      if (smallestIndex === index) {
        break;
      }

      const current = this.items[index];
      const smallest = this.items[smallestIndex];

      if (!current || !smallest) {
        break;
      }

      [this.items[index], this.items[smallestIndex]] = [smallest, current];
      index = smallestIndex;
    }
  }
}

const DEFAULT_STOP_POLICY: RoutingStopPolicy = {
  minimumApplicability: 0.7,
  minimumEvidenceConfidence: 0.6,
  maximumContaminationRisk: 0.35,
  maximumContradictionRisk: 0.25,
  maxResults: 3,
};

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function nodePenalty(node: RoutableMemoryNode): number {
  return (
    (1 - clamp(node.estimatedRelevance)) * 2.5 +
    node.unknownConditionCount * 0.75 +
    clamp(node.contaminationRisk) * 4 +
    clamp(node.contradictionRisk) * 5 +
    (1 - clamp(node.evidenceStrength)) * 1.5
  );
}

function heuristic(node: RoutableMemoryNode): number {
  return (
    (1 - clamp(node.applicabilityConfidence)) * 3 +
    (1 - clamp(node.estimatedRelevance)) * 2
  );
}

function isCandidate(
  node: RoutableMemoryNode,
  policy: RoutingStopPolicy,
): boolean {
  return (
    node.applicabilityConfidence >= policy.minimumApplicability &&
    node.evidenceStrength >= policy.minimumEvidenceConfidence &&
    node.contaminationRisk <= policy.maximumContaminationRisk &&
    node.contradictionRisk <= policy.maximumContradictionRisk
  );
}

function buildAdjacency(
  edges: readonly RoutableMemoryEdge[],
): Map<string, RoutableMemoryEdge[]> {
  const adjacency = new Map<string, RoutableMemoryEdge[]>();

  for (const edge of edges) {
    const current = adjacency.get(edge.sourceNodeId) ?? [];
    current.push(edge);
    adjacency.set(edge.sourceNodeId, current);
  }

  return adjacency;
}

export function routeMemoryWithVision(
  request: HeuristicRoutingRequest,
): HeuristicRoutingResult {
  const startedAt = Date.now();
  const policy: RoutingStopPolicy = {
    ...DEFAULT_STOP_POLICY,
    ...request.stopPolicy,
  };
  const nodeById = new Map(request.nodes.map((node) => [node.id, node]));
  const adjacency = buildAdjacency(request.edges);
  const allowedBranches = new Set(request.vision.allowedBranchIds);
  const excludedBranches = new Set(
    request.vision.excludedBranches.map((item) => item.branchId),
  );
  const frontierState = new Map(
    request.vision.frontiers.map((frontier) => [frontier.branchId, frontier.state]),
  );
  const heap = new MinHeap();
  const bestCost = new Map<string, number>();
  const visitedNodeIds: string[] = [];
  const visitedNodeSet = new Set<string>();
  const prunedNodeIds: string[] = [];
  const deferredNodeIds: string[] = [];
  const candidates: RoutedMemoryCandidate[] = [];

  for (const nodeId of request.startNodeIds) {
    const node = nodeById.get(nodeId);

    if (!node) {
      continue;
    }

    heap.push({
      nodeId,
      path: [nodeId],
      travelledCost: 0,
      estimatedTotalCost: heuristic(node),
    });
    bestCost.set(nodeId, 0);
  }

  while (
    heap.size > 0 &&
    visitedNodeIds.length < request.vision.traversalBudget.maxVisitedNodes &&
    Date.now() - startedAt < request.vision.traversalBudget.maxDurationMs &&
    candidates.length < Math.min(
      policy.maxResults,
      request.vision.traversalBudget.maxCandidateCapsules,
    )
  ) {
    const current = heap.pop();

    if (!current) {
      break;
    }

    const node = nodeById.get(current.nodeId);

    if (!node) {
      continue;
    }

    if (excludedBranches.has(node.branchId) || !allowedBranches.has(node.branchId)) {
      prunedNodeIds.push(node.id);
      continue;
    }

    if (frontierState.get(node.branchId) === "deferred") {
      deferredNodeIds.push(node.id);
      continue;
    }

    if (visitedNodeSet.has(node.id)) {
      continue;
    }

    visitedNodeSet.add(node.id);
    visitedNodeIds.push(node.id);

    if (isCandidate(node, policy)) {
      candidates.push({
        nodeId: node.id,
        branchId: node.branchId,
        totalCost: current.travelledCost + nodePenalty(node),
        path: current.path,
        applicabilityConfidence: node.applicabilityConfidence,
      });
    }

    for (const edge of adjacency.get(node.id) ?? []) {
      const neighbour = nodeById.get(edge.targetNodeId);

      if (!neighbour) {
        continue;
      }

      const travelledCost =
        current.travelledCost + Math.max(0, edge.cost) + nodePenalty(neighbour);
      const previousBest = bestCost.get(neighbour.id);

      if (previousBest !== undefined && previousBest <= travelledCost) {
        continue;
      }

      bestCost.set(neighbour.id, travelledCost);
      heap.push({
        nodeId: neighbour.id,
        path: [...current.path, neighbour.id],
        travelledCost,
        estimatedTotalCost: travelledCost + heuristic(neighbour),
      });
    }
  }

  candidates.sort((left, right) => left.totalCost - right.totalCost);

  return {
    candidates,
    visitedNodeIds,
    prunedNodeIds: Array.from(new Set(prunedNodeIds)),
    deferredNodeIds: Array.from(new Set(deferredNodeIds)),
    exhausted: heap.size === 0,
    durationMs: Date.now() - startedAt,
  };
}
