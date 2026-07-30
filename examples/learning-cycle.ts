import {
  analyzeEpisode,
  assessCapsuleAdmission,
  buildMemoryPreflight,
  compilePreflightContext,
  createPatternCandidate,
  extractEpisodeContrast,
  resolveMemoryVision,
  type InteractionEpisode,
} from "../src/index.js";

const episode: InteractionEpisode = {
  id: "episode-public-square",
  scope: { projectId: "project-atlas", workflowId: "shape-rendering" },
  initialRequest: {
    rawText: "Create a red square.",
    interpretedIntent: "render_square",
    target: "red square",
    expectedOutcome: "A red shape with equal width and height.",
    constraints: ["equal_dimensions", "red_fill"],
    forbiddenEffects: ["non_equal_dimensions"],
    environment: { renderer: "synthetic" },
  },
  attempts: [
    {
      id: "attempt-generic-rectangle",
      interpretation: "Render a generic red rectangle.",
      actions: ["set width to 80", "set height to 50"],
      result: {
        summary: "A red 80 by 50 rectangle.",
        properties: { width: 80, height: 50, fill: "red" },
        artifactIds: ["artifact-rectangle"],
      },
      userVerdict: "rejected",
      technicalEvidence: [],
      createdAt: "2026-07-30T12:00:00.000Z",
    },
    {
      id: "attempt-square",
      interpretation: "Preserve equal dimensions.",
      actions: ["set width to 60", "set height to 60"],
      result: {
        summary: "A red 60 by 60 square.",
        properties: { width: 60, height: 60, fill: "red" },
        artifactIds: ["artifact-square"],
      },
      userVerdict: "accepted",
      technicalEvidence: [
        {
          id: "test-equal-dimensions",
          type: "manual_test",
          description: "The accepted shape has equal dimensions.",
          passed: true,
          observedAt: "2026-07-30T12:05:00.000Z",
        },
      ],
      createdAt: "2026-07-30T12:05:00.000Z",
    },
  ],
  startedAt: "2026-07-30T11:55:00.000Z",
  completedAt: "2026-07-30T12:06:00.000Z",
};

const analysis = analyzeEpisode(episode);
const contrast = extractEpisodeContrast(episode);
const admission = assessCapsuleAdmission({
  analysis,
  contrast,
  claims: [],
});

console.log({ contrast, admission });

const pattern = createPatternCandidate(
  {
    reasoningFailures: ["Replace a requested subtype with its parent type."],
    triggeringSignals: ["specific subtype request"],
    lostOrRequiredConstraints: ["discriminating subtype property"],
    predictedConsequences: ["parent type produced, subtype requirement lost"],
    resolutionPrinciples: ["restore the discriminating property"],
    scopeKeys: [],
  },
  {
    name: "Subtype constraint loss",
    checks: ["Identify the property that distinguishes the requested subtype."],
    mustPreserve: ["The discriminating subtype property."],
    prohibitedShortcuts: ["Do not replace the subtype with its parent."],
  },
);

pattern.lifecycle.status = "active";

const vision = resolveMemoryVision({
  task: {
    intent: "render_square",
    target: "square",
    projectId: "project-atlas",
    workflowId: "shape-rendering",
    expectedOutcome: "Render equal dimensions.",
    operations: ["render_shape"],
    constraints: ["equal_dimensions"],
    forbiddenEffects: ["non_equal_dimensions"],
  },
  scope: { projectId: "project-atlas", workflowId: "shape-rendering" },
  branches: [
    {
      id: "branch-square",
      path: "/project-atlas/shape/square",
      scope: { projectId: "project-atlas" },
      requiredConstraints: ["equal_dimensions"],
      predictedEffects: [],
      patternIds: [pattern.id],
      priorUtility: 0.9,
      evidenceConfidence: 0.8,
    },
    {
      id: "branch-arbitrary-rectangle",
      path: "/project-atlas/shape/rectangle",
      scope: { projectId: "project-atlas" },
      requiredConstraints: [],
      predictedEffects: ["non_equal_dimensions"],
      patternIds: [],
      priorUtility: 0.95,
      evidenceConfidence: 0.9,
    },
  ],
  memoryRevision: 1,
});

const preflight = buildMemoryPreflight({
  task: vision.task,
  capsules: [],
  patterns: [{ pattern, confidence: 0.8 }],
  prunedApproaches: vision.excludedBranches.map(
    (branch) => `${branch.branchId}: ${branch.explanation}`,
  ),
});

console.log(compilePreflightContext(preflight));
