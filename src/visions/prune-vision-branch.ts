import { normalizeText } from "../utils/normalized-set.js";
import type {
  ExcludedVisionBranch,
  ResolveVisionInput,
  VisionBranchCandidate,
  VisionFrontier,
} from "./types.js";

export interface VisionBranchAssessment {
  excluded: ExcludedVisionBranch | null;
  frontier: VisionFrontier | null;
}

function intersects(left: readonly string[], right: readonly string[]): boolean {
  const rightSet = new Set(right.map(normalizeText));
  return left.some((value) => rightSet.has(normalizeText(value)));
}

export function assessVisionBranch(
  branch: VisionBranchCandidate,
  input: Pick<ResolveVisionInput, "scope" | "task">,
): VisionBranchAssessment {
  const currentProject = input.scope.projectId ?? input.task.projectId;
  const branchProject = branch.scope.projectId;

  if (
    currentProject &&
    branchProject &&
    currentProject !== branchProject &&
    !branch.sharedAcrossProjects
  ) {
    return {
      excluded: {
        branchId: branch.id,
        reason: "scope_mismatch",
        explanation: "The branch belongs to a different project scope.",
        reconsiderWhen: ["The branch is explicitly marked as cross-project."],
      },
      frontier: null,
    };
  }

  if (intersects(branch.predictedEffects, input.task.forbiddenEffects)) {
    return {
      excluded: {
        branchId: branch.id,
        reason: "forbidden_effect",
        explanation:
          "The branch predicts an effect explicitly forbidden by the current task.",
        reconsiderWhen: ["The current forbidden-effect contract changes."],
      },
      frontier: null,
    };
  }

  if (branch.contradicted) {
    return {
      excluded: {
        branchId: branch.id,
        reason: "contradicted",
        explanation: "The branch is backed by contradicted knowledge.",
        reconsiderWhen: ["New evidence resolves the contradiction."],
      },
      frontier: null,
    };
  }

  const currentConstraints = new Set(input.task.constraints.map(normalizeText));
  const missingConstraintCount = branch.requiredConstraints.filter(
    (constraint) => !currentConstraints.has(normalizeText(constraint)),
  ).length;
  const uncertainty = Math.min(
    1,
    missingConstraintCount / Math.max(1, branch.requiredConstraints.length),
  );
  const estimatedCost =
    1 + uncertainty * 3 + (1 - branch.evidenceConfidence) * 2;
  const estimatedUtility = Math.max(
    0,
    Math.min(1, branch.priorUtility * (1 - uncertainty * 0.5)),
  );

  return {
    excluded: null,
    frontier: {
      branchId: branch.id,
      estimatedUtility,
      estimatedCost,
      uncertainty,
      state: uncertainty > 0.5 ? "deferred" : "queued",
    },
  };
}
