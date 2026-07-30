import type {
  IncidentMatch,
  IncidentMemory,
  TaskSignature,
} from "../domain/types.js";
import { evaluateCondition } from "./condition-evaluator.js";

function normalizedEquals(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) {
    return false;
  }

  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function overlapRatio(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const normalizedRight = new Set(right.map((item) => item.toLowerCase()));
  const matches = left.filter((item) =>
    normalizedRight.has(item.toLowerCase()),
  ).length;

  return matches / Math.max(left.length, right.length);
}

function buildFacts(task: TaskSignature): Record<string, unknown> {
  return {
    task,
    intent: task.intent,
    target: task.target,
    projectId: task.projectId,
    workflowId: task.workflowId,
    expectedOutcome: task.expectedOutcome,
    operations: task.operations,
    constraints: task.constraints,
    forbiddenEffects: task.forbiddenEffects,
    environment: task.environment ?? {},
    symptoms: task.observedSymptoms ?? [],
  };
}

export function matchIncident(
  incident: IncidentMemory,
  task: TaskSignature,
): IncidentMatch {
  const reasons: string[] = [];
  const failedRequirements: string[] = [];
  const activeExclusions: string[] = [];
  const facts = buildFacts(task);

  const intentMatch = normalizedEquals(
    incident.originalTask.intent,
    task.intent,
  )
    ? 1
    : 0;

  const targetMatch = normalizedEquals(
    incident.originalTask.target,
    task.target,
  )
    ? 1
    : 0;

  const projectMatch = normalizedEquals(
    incident.originalTask.projectId,
    task.projectId,
  )
    ? 1
    : 0;

  const workflowMatch = normalizedEquals(
    incident.originalTask.workflowId,
    task.workflowId,
  )
    ? 1
    : 0;

  const operationMatch = overlapRatio(
    incident.originalTask.operations,
    task.operations,
  );

  const symptomMatch = overlapRatio(
    incident.symptoms,
    task.observedSymptoms ?? [],
  );

  for (const condition of [
    ...incident.triggerConditions.required,
    ...incident.applicability.appliesWhen,
  ]) {
    if (!evaluateCondition(condition, facts)) {
      failedRequirements.push(condition.field);
    }
  }

  for (const condition of [
    ...incident.triggerConditions.absent,
    ...incident.applicability.doesNotApplyWhen,
  ]) {
    if (evaluateCondition(condition, facts)) {
      activeExclusions.push(condition.field);
    }
  }

  const requirementScore =
    failedRequirements.length === 0
      ? 1
      : 1 /
        (1 +
          failedRequirements.length +
          activeExclusions.length * 2);

  const score = Math.max(
    0,
    Math.min(
      1,
      intentMatch * 0.25 +
        targetMatch * 0.15 +
        projectMatch * 0.15 +
        workflowMatch * 0.15 +
        operationMatch * 0.1 +
        symptomMatch * 0.05 +
        requirementScore * 0.15 -
        activeExclusions.length * 0.25,
    ),
  );

  if (intentMatch) reasons.push("Same task intent.");
  if (targetMatch) reasons.push("Same target.");
  if (projectMatch) reasons.push("Same project.");
  if (workflowMatch) reasons.push("Same workflow.");
  if (operationMatch > 0) reasons.push("Operations overlap.");
  if (symptomMatch > 0) reasons.push("Symptoms overlap.");
  if (failedRequirements.length === 0) {
    reasons.push("All required applicability conditions are satisfied.");
  }

  let usage: IncidentMatch["usage"];

  if (
    score >= 0.75 &&
    failedRequirements.length === 0 &&
    activeExclusions.length === 0 &&
    incident.status === "resolved"
  ) {
    usage = "applicable";
  } else if (
    score >= 0.35 &&
    activeExclusions.length === 0 &&
    incident.status !== "obsolete"
  ) {
    usage = "diagnostic_reference";
  } else {
    usage = "out_of_scope";
  }

  return {
    usage,
    score,
    reasons,
    failedRequirements,
    activeExclusions,
  };
}
