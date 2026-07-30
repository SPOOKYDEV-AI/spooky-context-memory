import { describe, expect, it } from "vitest";
import {
  attachExperienceToPattern,
  buildEnvironmentKey,
  createPatternCandidate,
  detectExperiencePattern,
  type CausalSignature,
} from "../src/index.js";

const signature: CausalSignature = {
  reasoningFailures: [
    "Replace a requested subtype with a broader parent category.",
  ],
  triggeringSignals: ["specific subtype requested"],
  lostOrRequiredConstraints: ["preserve discriminating property"],
  predictedConsequences: ["result belongs to parent type but violates subtype"],
  resolutionPrinciples: ["restore the discriminating property"],
  scopeKeys: ["synthetic-shape-domain"],
};

describe("pattern memory", () => {
  it("recognizes the same causal mechanism across a different scope", () => {
    const pattern = createPatternCandidate(signature, {
      name: "Subtype constraint loss",
      checks: ["Identify the property that distinguishes the requested subtype."],
      mustPreserve: ["The discriminating subtype property."],
    });
    const crossScopeSignature: CausalSignature = {
      ...signature,
      scopeKeys: ["synthetic-workflow-domain"],
    };

    const match = detectExperiencePattern(crossScopeSignature, [pattern]);

    expect(match.patternId).toBe(pattern.id);
    expect(match.relationship).toBe("instance_of_pattern");
    expect(match.score).toBeGreaterThan(0.7);
  });

  it("uses independent contexts instead of counting duplicate episodes as independent proof", () => {
    let pattern = createPatternCandidate(signature, {
      name: "Subtype constraint loss",
      confidence: 0.5,
    });

    pattern = attachExperienceToPattern(pattern, {
      capsuleId: "capsule-a",
      projectId: "project-atlas",
      workflowId: "shape-rendering",
      environmentKey: buildEnvironmentKey({ runtime: "browser" }),
      confidence: 0.8,
    });
    pattern = attachExperienceToPattern(pattern, {
      capsuleId: "capsule-b",
      projectId: "project-atlas",
      workflowId: "shape-rendering",
      environmentKey: buildEnvironmentKey({ runtime: "browser" }),
      confidence: 0.85,
    });

    expect(pattern.support.totalEpisodes).toBe(2);
    expect(pattern.support.independentProjects).toBe(1);
    expect(pattern.support.independentWorkflows).toBe(1);
    expect(pattern.lifecycle.status).toBe("candidate");

    pattern = attachExperienceToPattern(pattern, {
      capsuleId: "capsule-c",
      projectId: "project-aurora",
      workflowId: "manual-execution",
      environmentKey: buildEnvironmentKey({ runtime: "node" }),
      confidence: 0.9,
    });

    expect(pattern.support.independentProjects).toBe(2);
    expect(pattern.lifecycle.status).toBe("active");
  });
});
