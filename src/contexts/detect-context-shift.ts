import type {
  ContextField,
  ContextFrame,
  ContextShiftAssessment,
  ContextSignal,
} from "./types.js";

function terms(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 3),
  );
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) {
    return 1;
  }

  let intersection = 0;
  for (const item of left) {
    if (right.has(item)) {
      intersection += 1;
    }
  }

  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function scopeSimilarity(
  left: ContextFrame["scope"],
  right: ContextSignal["scope"],
): number {
  const comparableKeys = ["userId", "projectId", "workflowId", "taskId"] as const;
  let compared = 0;
  let matched = 0;

  for (const key of comparableKeys) {
    const leftValue = left[key];
    const rightValue = right[key];

    if (leftValue === undefined && rightValue === undefined) {
      continue;
    }

    compared += 1;
    if (leftValue !== undefined && leftValue === rightValue) {
      matched += 1;
    }
  }

  return compared === 0 ? 0.5 : matched / compared;
}

function frameSimilarity(frame: ContextFrame, signal: ContextSignal): number {
  const topicScore = jaccard(terms(frame.topic), terms(signal.topic));
  const intentScore = jaccard(
    terms(frame.intent ?? ""),
    terms(signal.intent ?? ""),
  );
  const scopeScore = scopeSimilarity(frame.scope, signal.scope);

  return topicScore * 0.55 + intentScore * 0.25 + scopeScore * 0.2;
}

export function detectContextShift(
  field: ContextField,
  signal: ContextSignal,
  continuationThreshold = 0.7,
  overlapThreshold = 0.34,
): ContextShiftAssessment {
  if (signal.returnToContextId !== undefined) {
    const target = field.frames.find(
      (frame) => frame.id === signal.returnToContextId,
    );

    return target
      ? {
          kind: "return_to_previous",
          matchedContextId: target.id,
          similarity: 1,
          reasons: ["The signal explicitly reactivates a previous context."],
        }
      : {
          kind: "new_context",
          matchedContextId: null,
          similarity: 0,
          reasons: ["The requested previous context does not exist."],
        };
  }

  if (field.frames.length === 0) {
    return {
      kind: "new_context",
      matchedContextId: null,
      similarity: 0,
      reasons: ["No context exists yet."],
    };
  }

  const ranked = field.frames
    .map((frame) => ({ frame, score: frameSimilarity(frame, signal) }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];

  if (signal.explicitShift === true) {
    return {
      kind: "new_context",
      matchedContextId: best?.frame.id ?? null,
      similarity: best?.score ?? 0,
      reasons: ["The user explicitly introduced a new context."],
    };
  }

  if (best === undefined) {
    return {
      kind: "new_context",
      matchedContextId: null,
      similarity: 0,
      reasons: ["No context candidate could be evaluated."],
    };
  }

  if (best.score >= continuationThreshold) {
    return {
      kind: "continuation",
      matchedContextId: best.frame.id,
      similarity: best.score,
      reasons: ["Topic, intent, and scope strongly match an active context."],
    };
  }

  if (best.score >= overlapThreshold) {
    return {
      kind: "overlap",
      matchedContextId: best.frame.id,
      similarity: best.score,
      reasons: ["The new subject overlaps an existing context without replacing it."],
    };
  }

  return {
    kind: "new_context",
    matchedContextId: best.frame.id,
    similarity: best.score,
    reasons: ["The signal is structurally distant from existing contexts."],
  };
}
