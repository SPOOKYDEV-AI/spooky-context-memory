import { clonePlainData } from "../utils/clone-plain-data.js";
import { stableHash } from "../utils/stable-hash.js";
import type {
  ExperiencePattern,
  PatternContextEvidence,
  PatternLifecycleStatus,
} from "./types.js";

function countDistinct(
  contexts: readonly PatternContextEvidence[],
  selector: (context: PatternContextEvidence) => string,
): number {
  return new Set(contexts.map(selector).filter(Boolean)).size;
}

function resolveLifecycle(
  contexts: readonly PatternContextEvidence[],
  contradictionCount: number,
): PatternLifecycleStatus {
  if (contradictionCount > 0 && contexts.length > 0) {
    return "disputed";
  }

  const projects = countDistinct(contexts, (context) => context.projectId ?? "");
  const workflows = countDistinct(
    contexts,
    (context) => context.workflowId ?? "",
  );
  const environments = countDistinct(
    contexts,
    (context) => context.environmentKey,
  );
  const independentContexts = Math.max(projects, workflows, environments);

  if (contexts.length >= 3 && independentContexts >= 2) {
    return "active";
  }

  if (contexts.length >= 2) {
    return "candidate";
  }

  return "hypothesis";
}

export function attachExperienceToPattern(
  pattern: ExperiencePattern,
  context: PatternContextEvidence,
): ExperiencePattern {
  const next = clonePlainData(pattern);

  if (!next.contexts.some((item) => item.capsuleId === context.capsuleId)) {
    next.contexts.push(clonePlainData(context));
  }

  const supportingCapsuleIds = Array.from(
    new Set(next.contexts.map((item) => item.capsuleId)),
  );
  const independentProjects = countDistinct(
    next.contexts,
    (item) => item.projectId ?? "",
  );
  const independentWorkflows = countDistinct(
    next.contexts,
    (item) => item.workflowId ?? "",
  );
  const independentEnvironments = countDistinct(
    next.contexts,
    (item) => item.environmentKey,
  );
  const averageConfidence =
    next.contexts.length === 0
      ? 0
      : next.contexts.reduce((sum, item) => sum + item.confidence, 0) /
        next.contexts.length;
  const diversityBoost = Math.min(
    0.2,
    (independentProjects + independentWorkflows + independentEnvironments) *
      0.025,
  );

  next.support = {
    totalEpisodes: next.contexts.length,
    independentProjects,
    independentWorkflows,
    independentEnvironments,
    supportingCapsuleIds,
    contradictingCapsuleIds: Array.from(
      new Set(next.support.contradictingCapsuleIds),
    ),
  };
  next.confidence = Math.min(0.99, averageConfidence * 0.8 + diversityBoost);
  next.lifecycle.status = resolveLifecycle(
    next.contexts,
    next.support.contradictingCapsuleIds.length,
  );
  next.version += 1;

  return next;
}

export function buildEnvironmentKey(
  environment: Readonly<Record<string, string>>,
): string {
  return stableHash(environment);
}
