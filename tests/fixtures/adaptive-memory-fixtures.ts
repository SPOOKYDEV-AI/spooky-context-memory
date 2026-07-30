import {
  createAdaptiveUnlearningState,
  createEpistemicCore,
  createGlobalUnderstandingState,
  createPlasticMemoryGraph,
  createReflectiveMemoryState,
  createRejectedViewLedger,
  runAttentionDrivenMemoryCycle,
  type AttentionCandidate,
  type AttentionViewProposal,
  type CognitiveHabit,
  type CognitiveTrajectory,
  type ContextField,
  type GlobalUnderstandingModel,
  type GlobalUnderstandingState,
  type HabitObservation,
  type SemanticBackboneEdge,
  type VisionBranchCandidate,
} from "../../src/index.js";

export const now = "2026-07-30T20:00:00.000Z";

export function makeGlobalModel(
  overrides: Partial<GlobalUnderstandingModel> = {},
): GlobalUnderstandingModel {
  return {
    id: "understanding-atlas",
    revision: 1,
    status: "dominant",
    identity: {
      subject: "Synthetic Atlas memory engine",
      primaryGoal: "Preserve a coherent contextual memory while learning.",
      currentSituation: "Evaluate adaptive memory behavior.",
    },
    scope: { projectId: "project-atlas" },
    contextFingerprint: "atlas-context-v1",
    invariantIds: ["invariant-no-loss", "invariant-context-first"],
    truthAnchorIds: ["truth-node-20"],
    corePatternIds: ["pattern-contextual-recall"],
    claims: [
      {
        id: "claim-context-is-key",
        key: "context_is_key",
        statement: "Context controls applicability and learning.",
        status: "accepted",
        confidence: 0.86,
        truthAnchorIds: ["truth-node-20"],
        patternIds: ["pattern-contextual-recall"],
        viewIds: ["view-local"],
        independentSupportKeys: ["source-spec"],
        independentChallengeKeys: [],
      },
    ],
    unresolvedQuestionIds: ["question-causal-boundary"],
    semanticBackboneEdgeIds: ["edge-goal-context"],
    coherence: 0.82,
    stability: 0.8,
    plasticity: 0.58,
    uncertainty: 0.25,
    contextCoverage: 0.78,
    contradictionPressure: 0.08,
    revisionPressure: 0.05,
    independentSupportKeys: ["source-spec"],
    independentChallengeKeys: [],
    derivedFromModelIds: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function makeBackboneEdge(
  overrides: Partial<SemanticBackboneEdge> = {},
): SemanticBackboneEdge {
  return {
    id: "edge-goal-context",
    sourceId: "invariant-context-first",
    targetId: "pattern-contextual-recall",
    relation: "constrains",
    confidence: 0.65,
    status: "supported",
    independentSupportKeys: ["source-spec"],
    independentChallengeKeys: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function makeGlobalState(
  dominant = makeGlobalModel(),
  alternatives: GlobalUnderstandingModel[] = [],
): GlobalUnderstandingState {
  return createGlobalUnderstandingState({
    dominantModel: dominant,
    alternativeModels: alternatives,
    semanticBackbone: [makeBackboneEdge()],
    createdAt: now,
  });
}

export function makeTrajectory(
  overrides: Partial<CognitiveTrajectory> = {},
): CognitiveTrajectory {
  return {
    id: "trajectory-1",
    contextFingerprint: "atlas-context-v1",
    contextDiscriminators: ["bounded", "contextual", "synthetic"],
    scope: { projectId: "project-atlas" },
    contextRevision: 1,
    memoryRevision: 1,
    truthRevision: 1,
    attentions: [
      { focusId: "focus-goal", role: "goal", weight: 0.35, status: "dominant" },
      { focusId: "focus-constraint", role: "constraint", weight: 0.25, status: "active" },
      { focusId: "focus-challenge", role: "challenge", weight: 0.2, status: "active" },
      { focusId: "focus-exploration", role: "exploration", weight: 0.2, status: "active" },
    ],
    generatedViewIds: ["view-local", "view-alternative"],
    activeViewIds: ["view-local", "view-alternative"],
    selectedViewId: "view-local",
    rejectedViewIds: ["view-alternative"],
    verificationSteps: ["check-scope", "check-truth", "observe-outcome"],
    actionSummary: "Apply the bounded local strategy.",
    expectedOutcome: "The contextual strategy is accepted.",
    actualOutcome: "The contextual strategy is accepted.",
    verdict: "supported",
    outcomeConfidence: 0.9,
    predictionScore: 0.92,
    causalValidation: "not_tested",
    causalClaimPromoted: false,
    externalGroundingKeys: ["test-run-1"],
    visitedMemoryItems: 10,
    injectedMemoryItems: 2,
    durationMs: 400,
    independentOutcomeKey: "run-1",
    startedAt: now,
    completedAt: now,
    ...overrides,
  };
}

export function makeHabit(overrides: Partial<CognitiveHabit> = {}): CognitiveHabit {
  return {
    id: "habit-contextual-reuse",
    scope: { projectId: "project-atlas" },
    contextFingerprint: "atlas-context-v1",
    contextDiscriminators: ["bounded", "typescript", "local-scope"],
    preferredAttentionRoles: ["goal", "experience", "constraint"],
    preferredViewPatternIds: ["view-pattern-local-reuse"],
    preferredActionPatternIds: ["action-pattern-local-patch"],
    independentSuccessKeys: ["success-1", "success-2"],
    independentFailureKeys: [],
    automaticity: 0.82,
    adaptability: 0.45,
    confidence: {
      historicalSupport: 0.9,
      currentApplicability: 0.82,
      predictiveReliability: 0.78,
      contradictionPressure: 0.08,
      contextDrift: 0.05,
    },
    status: "entrenched",
    reactivationConditions: ["new-independent-success"],
    supersededByHabitId: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function makeHabitObservation(
  id: string,
  kind: HabitObservation["kind"],
  independenceKey: string,
  overrides: Partial<HabitObservation> = {},
): HabitObservation {
  return {
    id,
    habitId: "habit-contextual-reuse",
    kind,
    weight: 0.82,
    independenceKey,
    currentContextFingerprint: "atlas-context-v2",
    currentDiscriminators: ["bounded", "postgresql", "distributed-scope"],
    reason: `Synthetic ${kind} observation.`,
    observedAt: now,
    ...overrides,
  };
}

export function makeAttentionCycle() {
  const contextField: ContextField = {
    revision: 1,
    updatedAt: now,
    transitions: [],
    frames: [
      {
        id: "context-adaptive-cycle",
        topic: "Adaptive memory cycle",
        intent: "complete_adaptive_cycle",
        summary: "Learn, reflect, unlearn, and preserve global coherence.",
        scope: { projectId: "project-atlas" },
        activation: 1,
        relevance: 1,
        inertia: 0.8,
        activationState: "dominant",
        retentionState: "pinned",
        introducedAt: now,
        lastReactivatedAt: now,
        parentFrameIds: [],
        sourceTurnIds: ["turn-synthetic"],
        protectedReasons: ["Preserve the global goal."],
      },
    ],
  };
  const epistemicCore = createEpistemicCore([], [], now);
  const attentionCandidates: AttentionCandidate[] = [
    {
      id: "focus-goal",
      targetType: "goal",
      targetId: "adaptive-memory",
      role: "goal",
      reason: "Protect the global objective.",
      scope: { projectId: "project-atlas" },
      contextAnchorIds: ["context-adaptive-cycle"],
      truthAnchorIds: [],
      goalDependency: 1,
      constraintImportance: 0.8,
      uncertainty: 0.2,
      novelty: 0.4,
      risk: 0.6,
      expectedInformationGain: 0.7,
      predictiveValue: 0.8,
      persistence: 0.9,
      urgency: 0.8,
      pinned: true,
    },
    {
      id: "focus-challenge",
      targetType: "contradiction",
      targetId: "habit-contextual-reuse",
      role: "challenge",
      reason: "Challenge the habitual interpretation.",
      scope: { projectId: "project-atlas" },
      contextAnchorIds: ["context-adaptive-cycle"],
      truthAnchorIds: [],
      goalDependency: 0.7,
      constraintImportance: 0.8,
      uncertainty: 0.8,
      novelty: 0.7,
      risk: 0.7,
      expectedInformationGain: 0.9,
      predictiveValue: 0.65,
      persistence: 0.5,
      urgency: 0.8,
    },
  ];
  const branches: VisionBranchCandidate[] = [
    {
      id: "branch-adaptive",
      path: "/project-atlas/adaptive",
      scope: { projectId: "project-atlas" },
      requiredConstraints: ["bounded"],
      predictedEffects: ["adaptive_result"],
      patternIds: ["pattern-contextual-recall"],
      priorUtility: 0.82,
      evidenceConfidence: 0.8,
    },
  ];
  const proposal: AttentionViewProposal = {
    id: "view-local",
    hypothesis: "The bounded adaptive branch fits the present context.",
    attentionIds: ["focus-goal", "focus-challenge"],
    truthAnchorIds: [],
    assumptionIds: [],
    branchIds: ["branch-adaptive"],
    questionsCovered: ["Does the adaptive branch preserve the global goal?"],
    conclusions: [
      { key: "path", statement: "Use the adaptive branch.", confidence: 0.82 },
    ],
    scope: { projectId: "project-atlas" },
    sharedAcrossProjects: false,
    priorUtility: 0.82,
    noveltyScore: 0.7,
    expectedCost: 0.2,
    riskIfWrong: 0.35,
  };
  const cycle = runAttentionDrivenMemoryCycle({
    task: {
      intent: "complete_adaptive_cycle",
      target: "adaptive memory",
      projectId: "project-atlas",
      expectedOutcome: "Preserve coherence while adapting.",
      operations: ["reflect", "unlearn", "revise"],
      constraints: ["bounded"],
      forbiddenEffects: ["delete_history"],
    },
    scope: { projectId: "project-atlas" },
    contextField,
    epistemicCore,
    memoryRevision: 1,
    attentionCandidates,
    viewProposals: [proposal],
    branches,
    equilibriumObservation: {
      visitedMemoryItems: 10,
      injectedMemoryItems: 2,
      averageExplorationDepth: 3,
      dominantViewHistory: [],
      changedContextIds: ["context-adaptive-cycle"],
      changedTruthAnchorIds: [],
      explorationDebt: [],
    },
    now,
  });
  return {
    contextField,
    epistemicCore,
    cycle,
    rejectedViewLedger: createRejectedViewLedger(now),
    plasticMemoryGraph: createPlasticMemoryGraph(now),
    reflectiveMemory: createReflectiveMemoryState(now),
    adaptiveUnlearning: createAdaptiveUnlearningState([makeHabit()], now),
    globalUnderstanding: makeGlobalState(),
  };
}
