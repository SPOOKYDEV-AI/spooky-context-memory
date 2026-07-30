import {
  applyReflectiveLearning,
  applyUnderstandingObservations,
  createAdaptiveUnlearningState,
  createGlobalUnderstandingState,
  createReflectiveMemoryState,
  evaluateHabitForUnlearning,
  type CognitiveHabit,
  type CognitiveTrajectory,
  type GlobalUnderstandingModel,
} from "../src/index.js";

const now = "2026-07-30T20:00:00.000Z";

const understandingModel: GlobalUnderstandingModel = {
  id: "understanding-atlas",
  revision: 1,
  status: "dominant",
  identity: {
    subject: "Synthetic Atlas agent",
    primaryGoal: "Preserve coherent contextual memory while adapting.",
    currentSituation: "Evaluate a changed deployment context.",
  },
  scope: { projectId: "project-atlas" },
  contextFingerprint: "atlas-local-v1",
  invariantIds: ["no-data-loss", "context-controls-applicability"],
  truthAnchorIds: ["truth-node-20"],
  corePatternIds: ["pattern-local-deployment"],
  claims: [],
  unresolvedQuestionIds: ["is-local-deployment-still-applicable"],
  semanticBackboneEdgeIds: [],
  coherence: 0.82,
  stability: 0.8,
  plasticity: 0.55,
  uncertainty: 0.24,
  contextCoverage: 0.78,
  contradictionPressure: 0.05,
  revisionPressure: 0.04,
  independentSupportKeys: ["specification"],
  independentChallengeKeys: [],
  derivedFromModelIds: [],
  createdAt: now,
  updatedAt: now,
};

let understanding = createGlobalUnderstandingState({
  dominantModel: understandingModel,
  createdAt: now,
});

const trajectory: CognitiveTrajectory = {
  id: "trajectory-deployment-1",
  contextFingerprint: "atlas-distributed-v2",
  contextDiscriminators: ["distributed", "postgresql", "bounded-migration"],
  scope: { projectId: "project-atlas" },
  contextRevision: 2,
  memoryRevision: 8,
  truthRevision: 3,
  attentions: [
    { focusId: "goal", role: "goal", weight: 0.3, status: "dominant" },
    { focusId: "constraint", role: "constraint", weight: 0.25, status: "active" },
    { focusId: "challenge", role: "challenge", weight: 0.25, status: "active" },
    { focusId: "exploration", role: "exploration", weight: 0.2, status: "active" },
  ],
  generatedViewIds: ["view-local-reuse", "view-controlled-migration"],
  activeViewIds: ["view-local-reuse", "view-controlled-migration"],
  selectedViewId: "view-controlled-migration",
  rejectedViewIds: ["view-local-reuse"],
  verificationSteps: ["check-invariants", "test-migration", "observe-data-integrity"],
  actionSummary: "Use a controlled migration rather than preserving the old storage unchanged.",
  expectedOutcome: "Data remains intact in the distributed deployment.",
  actualOutcome: "Data remained intact in the distributed deployment.",
  verdict: "supported",
  outcomeConfidence: 0.92,
  predictionScore: 0.94,
  causalValidation: "supported",
  causalClaimPromoted: false,
  externalGroundingKeys: ["migration-test-1"],
  visitedMemoryItems: 14,
  injectedMemoryItems: 3,
  durationMs: 850,
  independentOutcomeKey: "migration-run-1",
  startedAt: now,
  completedAt: now,
};

const reflection = applyReflectiveLearning({
  state: createReflectiveMemoryState(now),
  trajectory,
  updatedAt: now,
});

const habit: CognitiveHabit = {
  id: "habit-preserve-local-storage",
  scope: { projectId: "project-atlas" },
  contextFingerprint: "atlas-local-v1",
  contextDiscriminators: ["local", "sqlite", "single-host"],
  preferredAttentionRoles: ["experience", "constraint"],
  preferredViewPatternIds: ["view-local-reuse"],
  preferredActionPatternIds: ["action-keep-storage"],
  independentSuccessKeys: ["legacy-run-1", "legacy-run-2"],
  independentFailureKeys: [],
  automaticity: 0.85,
  adaptability: 0.4,
  confidence: {
    historicalSupport: 0.9,
    currentApplicability: 0.8,
    predictiveReliability: 0.78,
    contradictionPressure: 0.1,
    contextDrift: 0.05,
  },
  status: "entrenched",
  reactivationConditions: ["local-context-restored"],
  supersededByHabitId: null,
  revision: 1,
  createdAt: now,
  updatedAt: now,
};

const unlearning = evaluateHabitForUnlearning({
  state: createAdaptiveUnlearningState([habit], now),
  habitId: habit.id,
  observations: [
    {
      id: "habit-failure-1",
      habitId: habit.id,
      kind: "failure",
      weight: 0.9,
      independenceKey: "distributed-run-1",
      currentContextFingerprint: trajectory.contextFingerprint,
      currentDiscriminators: trajectory.contextDiscriminators,
      reason: "The local-storage habit did not fit the distributed deployment.",
      observedAt: now,
    },
    {
      id: "habit-failure-2",
      habitId: habit.id,
      kind: "failure",
      weight: 0.9,
      independenceKey: "distributed-run-2",
      currentContextFingerprint: trajectory.contextFingerprint,
      currentDiscriminators: trajectory.contextDiscriminators,
      reason: "A second independent deployment confirmed the context mismatch.",
      observedAt: now,
    },
  ],
  evaluatedAt: now,
});

understanding = applyUnderstandingObservations({
  state: understanding,
  observations: [
    {
      id: "observation-controlled-migration",
      kind: "view_outcome",
      effect: "narrows",
      targetIds: [understanding.dominantModelId],
      weight: 0.86,
      independenceKey: "migration-run-1",
      contextFingerprint: trajectory.contextFingerprint,
      scope: trajectory.scope,
      reason: "Preserve data, not the old implementation unchanged.",
      observedAt: now,
    },
  ],
  updatedAt: now,
}).state;

export const adaptiveMemoryExampleResult = {
  mirrorLearningAccepted: reflection.mirrorLearningAccepted,
  reflectiveCapsuleStatus: reflection.reflectiveCapsule?.status ?? null,
  unlearningAction: unlearning.decision.action,
  counterfactualViews: unlearning.counterfactualViewPlans.map((plan) => plan.strategy),
  dominantUnderstanding: understanding.dominantModelId,
};
