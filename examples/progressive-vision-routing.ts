import {
  VisionCheckpointStore,
  VisionLoopGuard,
  advanceProgressiveVisionEnsemble,
  backtrackProgressiveVision,
  createProgressiveVisionEnsemble,
} from "../src/index.js";

const contextField = {
  revision: 1,
  updatedAt: new Date().toISOString(),
  transitions: [],
  frames: [
    {
      id: "context-atlas-routing",
      topic: "Progressive memory routing",
      intent: "route_memory",
      summary: "Explore local hypotheses without replaying the entire memory.",
      scope: { projectId: "project-atlas" },
      activation: 1,
      relevance: 1,
      inertia: 0.8,
      activationState: "dominant" as const,
      retentionState: "pinned" as const,
      introducedAt: new Date().toISOString(),
      lastReactivatedAt: new Date().toISOString(),
      parentFrameIds: [],
      sourceTurnIds: ["turn-1"],
      protectedReasons: ["Keep the routing objective stable."],
    },
  ],
};

const branches = [
  {
    id: "branch-context-drop",
    path: "/project-atlas/context/drop",
    scope: { projectId: "project-atlas" },
    requiredConstraints: ["preserve_initial_need"],
    predictedEffects: ["safe_release"],
    patternIds: ["pattern-premature-drop"],
    priorUtility: 0.9,
    evidenceConfidence: 0.86,
  },
  {
    id: "branch-circular-search",
    path: "/project-atlas/vision/loops",
    scope: { projectId: "project-atlas" },
    requiredConstraints: ["bounded_exploration"],
    predictedEffects: ["loop_detection"],
    patternIds: ["pattern-circular-search"],
    priorUtility: 0.84,
    evidenceConfidence: 0.82,
  },
];

const ensemble = createProgressiveVisionEnsemble({
  task: {
    intent: "route_memory",
    target: "progressive Vision ensemble",
    projectId: "project-atlas",
    expectedOutcome: "Find the applicable memory without circular exploration.",
    operations: ["spawn", "explore", "backtrack"],
    constraints: ["preserve_initial_need", "bounded_exploration"],
    forbiddenEffects: ["global_memory_replay"],
  },
  scope: { projectId: "project-atlas" },
  contextField,
  branches,
  seeds: [
    {
      id: "seed-drop",
      hypothesis: "The initial context was released too early.",
      branchIds: ["branch-context-drop"],
      contextAnchorIds: ["context-atlas-routing"],
      unresolvedQuestions: ["Was the context transferred before release?"],
      priorUtility: 0.9,
      noveltyScore: 0.65,
      scope: { projectId: "project-atlas" },
      sharedAcrossProjects: false,
    },
    {
      id: "seed-loop",
      hypothesis: "The router is revisiting an unchanged state.",
      branchIds: ["branch-circular-search"],
      contextAnchorIds: ["context-atlas-routing"],
      unresolvedQuestions: ["Did the revisit add evidence or progress?"],
      priorUtility: 0.84,
      noveltyScore: 0.7,
      scope: { projectId: "project-atlas" },
      sharedAcrossProjects: false,
    },
  ],
  memoryRevision: 7,
});

const dominant = ensemble.visions.find(
  (vision) => vision.id === ensemble.dominantVisionId,
)!;
const advanced = advanceProgressiveVisionEnsemble({
  previous: ensemble,
  contextField: { ...contextField, revision: 2 },
  branches,
  evidence: [],
  observations: [
    {
      visionId: dominant.id,
      visitedNodeIds: ["node-root"],
      frontierNodeIds: ["node-alternative"],
      injectedItemIds: [],
      resolvedQuestions: [],
      depth: 2,
      utilityGain: 0.05,
      exhausted: false,
      createdAt: new Date().toISOString(),
    },
  ],
  newSeeds: [],
  memoryRevision: 8,
});

const checkpointStore = new VisionCheckpointStore();
for (const checkpoint of advanced.checkpoints) {
  checkpointStore.save(checkpoint);
}

const loopGuard = new VisionLoopGuard();
const loopDecision = loopGuard.checkAndRecord({
  visionId: dominant.id,
  contextRevision: 2,
  contextFingerprint: "context-atlas-routing",
  currentNodeId: "node-root",
  unresolvedQuestions: dominant.unresolvedQuestions,
  constraints: ensemble.task.constraints,
  progressScore: dominant.score,
  evidenceIds: dominant.supportingEvidenceIds,
});

const latest = checkpointStore.getLatest(dominant.id);
if (!loopDecision.allowed && latest !== null) {
  const current = advanced.ensemble.visions.find(
    (vision) => vision.id === dominant.id,
  )!;
  backtrackProgressiveVision(current, latest, new Date().toISOString());
}
