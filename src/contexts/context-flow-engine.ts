import { clonePlainData } from "../utils/clone-plain-data.js";
import { stableHash } from "../utils/stable-hash.js";
import { detectContextShift } from "./detect-context-shift.js";
import type {
  ContextActivationState,
  ContextField,
  ContextFlowPolicy,
  ContextFlowUpdate,
  ContextFrame,
  ContextRetentionState,
  ContextSignal,
  ContextTransition,
  ContextTransitionTrigger,
} from "./types.js";

const DEFAULT_POLICY: ContextFlowPolicy = {
  continuationThreshold: 0.7,
  overlapThreshold: 0.34,
  activationBoost: 0.28,
  explicitShiftBoost: 0.46,
  decayRate: 0.18,
  backgroundThreshold: 0.28,
  dormantThreshold: 0.1,
  minimumPinnedActivation: 0.34,
  maxNonDormantFrames: 5,
};

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function classifyActivation(
  activation: number,
  isDominant: boolean,
  policy: ContextFlowPolicy,
): ContextActivationState {
  if (isDominant) {
    return "dominant";
  }
  if (activation >= policy.backgroundThreshold + 0.18) {
    return "overlapping";
  }
  if (activation >= policy.dormantThreshold) {
    return "background";
  }
  return "dormant";
}

function retentionFromActivation(
  frame: ContextFrame,
  activationState: ContextActivationState,
): ContextRetentionState {
  if (frame.retentionState === "pinned") {
    return "pinned";
  }
  if (activationState === "dominant" || activationState === "overlapping") {
    return "active";
  }
  if (activationState === "background") {
    return frame.retentionState === "compacted" ? "compacted" : "background";
  }
  if (
    frame.retentionState === "archived" ||
    frame.retentionState === "eligible_for_deletion"
  ) {
    return frame.retentionState;
  }
  return frame.retentionState === "compacted" ? "compacted" : "dormant";
}

function transitionTrigger(
  signal: ContextSignal,
  kind: ContextFlowUpdate["shift"]["kind"],
): ContextTransitionTrigger {
  if (signal.transitionTrigger !== undefined) {
    return signal.transitionTrigger;
  }
  if (kind === "return_to_previous") {
    return "return_to_previous";
  }
  if (kind === "continuation") {
    return "continuation";
  }
  if (signal.explicitShift === true) {
    return "explicit_topic_change";
  }
  if (kind === "overlap") {
    return "association";
  }
  return "new_event";
}

function createFrame(signal: ContextSignal, activation: number): ContextFrame {
  const id = `context-${stableHash({
    topic: signal.topic,
    intent: signal.intent ?? null,
    scope: signal.scope,
    observedAt: signal.observedAt,
    turnId: signal.turnId,
  })}`;

  return {
    id,
    topic: signal.topic.trim(),
    intent: signal.intent?.trim() || null,
    summary: signal.summary?.trim() || signal.topic.trim(),
    scope: clonePlainData(signal.scope),
    activation: clamp(activation),
    relevance: clamp(signal.relevance ?? 0.75),
    inertia: 0.58,
    activationState: "dominant",
    retentionState: "active",
    introducedAt: signal.observedAt,
    lastReactivatedAt: signal.observedAt,
    parentFrameIds: [...(signal.relatedContextIds ?? [])],
    sourceTurnIds: [signal.turnId],
    protectedReasons: [],
  };
}

function updateExistingFrame(
  frame: ContextFrame,
  signal: ContextSignal,
  boost: number,
): void {
  frame.activation = clamp(frame.activation + boost);
  frame.relevance = clamp(
    frame.relevance * 0.55 + (signal.relevance ?? frame.relevance) * 0.45,
  );
  frame.lastReactivatedAt = signal.observedAt;
  frame.topic = signal.topic.trim() || frame.topic;

  if (signal.intent !== undefined && signal.intent.trim().length > 0) {
    frame.intent = signal.intent.trim();
  }
  if (signal.summary !== undefined && signal.summary.trim().length > 0) {
    frame.summary = signal.summary.trim();
  }
  if (!frame.sourceTurnIds.includes(signal.turnId)) {
    frame.sourceTurnIds.push(signal.turnId);
  }
  for (const parentId of signal.relatedContextIds ?? []) {
    if (!frame.parentFrameIds.includes(parentId)) {
      frame.parentFrameIds.push(parentId);
    }
  }
}

function makeTransition(
  fromContextId: string,
  toContextId: string,
  signal: ContextSignal,
  trigger: ContextTransitionTrigger,
  confidence: number,
): ContextTransition {
  return {
    id: `transition-${stableHash({
      fromContextId,
      toContextId,
      trigger,
      turnId: signal.turnId,
      observedAt: signal.observedAt,
    })}`,
    fromContextId,
    toContextId,
    trigger,
    bridge: signal.bridge?.trim() || `Context moved from ${fromContextId} to ${toContextId}.`,
    confidence: clamp(confidence),
    createdAt: signal.observedAt,
  };
}

export function createEmptyContextField(createdAt: string): ContextField {
  return {
    frames: [],
    transitions: [],
    revision: 0,
    updatedAt: createdAt,
  };
}

export function updateContextField(
  current: ContextField,
  signal: ContextSignal,
  policyOverrides: Partial<ContextFlowPolicy> = {},
): ContextFlowUpdate {
  const policy: ContextFlowPolicy = {
    ...DEFAULT_POLICY,
    ...policyOverrides,
  };
  const field = clonePlainData(current);
  const previousDominant = [...field.frames]
    .sort((left, right) => right.activation - left.activation)[0]?.id ?? null;
  const shift = detectContextShift(
    field,
    signal,
    policy.continuationThreshold,
    policy.overlapThreshold,
  );
  const changed = new Set<string>();
  const deactivated = new Set<string>();
  let target: ContextFrame | undefined;
  let createdContextId: string | null = null;

  if (
    shift.kind === "continuation" ||
    shift.kind === "overlap" ||
    shift.kind === "return_to_previous"
  ) {
    target = field.frames.find((frame) => frame.id === shift.matchedContextId);
  }

  if (target === undefined) {
    const boost = signal.explicitShift === true
      ? policy.explicitShiftBoost
      : policy.activationBoost + 0.12;
    target = createFrame(signal, 0.48 + boost);
    field.frames.push(target);
    createdContextId = target.id;
    changed.add(target.id);
  } else {
    const boost = shift.kind === "continuation"
      ? policy.activationBoost
      : policy.activationBoost * 0.82;
    updateExistingFrame(target, signal, boost);
    changed.add(target.id);
  }

  if (signal.explicitShift === true || shift.kind === "return_to_previous") {
    target.activation = Math.max(target.activation, 0.88);
    target.relevance = Math.max(target.relevance, 0.95);
  }

  for (const frame of field.frames) {
    if (frame.id === target.id) {
      continue;
    }

    const before = frame.activation;
    const shiftPressure = signal.explicitShift === true ? 1.3 : 1;
    const retainedFraction = Math.max(0.2, frame.inertia);
    const decay = policy.decayRate * shiftPressure * (1 - retainedFraction * 0.55);
    frame.activation = clamp(frame.activation - decay);

    if (frame.retentionState === "pinned") {
      frame.activation = Math.max(
        frame.activation,
        policy.minimumPinnedActivation,
      );
    }

    if (Math.abs(before - frame.activation) > 0.0001) {
      changed.add(frame.id);
    }
    if (before >= policy.dormantThreshold && frame.activation < policy.dormantThreshold) {
      deactivated.add(frame.id);
    }
  }

  const ranked = [...field.frames].sort(
    (left, right) =>
      right.activation * right.relevance - left.activation * left.relevance,
  );
  const dominantContextId = ranked[0]?.id ?? null;
  const nonDormantCandidates = ranked.filter(
    (frame) => frame.activation >= policy.dormantThreshold,
  );
  const forcedDormantIds = new Set(
    nonDormantCandidates
      .slice(policy.maxNonDormantFrames)
      .filter((frame) => frame.retentionState !== "pinned")
      .map((frame) => frame.id),
  );

  for (const frame of field.frames) {
    if (forcedDormantIds.has(frame.id)) {
      frame.activation = Math.min(frame.activation, policy.dormantThreshold * 0.8);
      deactivated.add(frame.id);
    }

    frame.activationState = classifyActivation(
      frame.activation,
      frame.id === dominantContextId,
      policy,
    );
    frame.retentionState = retentionFromActivation(frame, frame.activationState);
  }

  if (
    previousDominant !== null &&
    previousDominant !== target.id &&
    !field.transitions.some(
      (transition) =>
        transition.fromContextId === previousDominant &&
        transition.toContextId === target.id &&
        transition.createdAt === signal.observedAt,
    )
  ) {
    field.transitions.push(
      makeTransition(
        previousDominant,
        target.id,
        signal,
        transitionTrigger(signal, shift.kind),
        Math.max(0.55, shift.similarity),
      ),
    );
  }

  field.revision += 1;
  field.updatedAt = signal.observedAt;

  return {
    field,
    dominantContextId,
    changedFrameIds: [...changed],
    deactivatedFrameIds: [...deactivated],
    createdContextId,
    shift,
  };
}

export function pinContextFrame(
  field: ContextField,
  contextId: string,
  reason: string,
): ContextField {
  const next = clonePlainData(field);
  const frame = next.frames.find((item) => item.id === contextId);

  if (frame === undefined) {
    throw new Error(`Unknown context frame "${contextId}".`);
  }

  frame.retentionState = "pinned";
  frame.activation = Math.max(frame.activation, DEFAULT_POLICY.minimumPinnedActivation);
  if (!frame.protectedReasons.includes(reason)) {
    frame.protectedReasons.push(reason);
  }
  next.revision += 1;
  return next;
}

export function compactContextFrame(
  field: ContextField,
  contextId: string,
  summary: string,
): ContextField {
  const next = clonePlainData(field);
  const frame = next.frames.find((item) => item.id === contextId);

  if (frame === undefined) {
    throw new Error(`Unknown context frame "${contextId}".`);
  }
  if (frame.retentionState === "pinned") {
    throw new Error(`Pinned context frame "${contextId}" cannot be compacted.`);
  }

  frame.summary = summary.trim() || frame.summary;
  frame.retentionState = "compacted";
  frame.activationState = "background";
  frame.activation = Math.min(frame.activation, DEFAULT_POLICY.backgroundThreshold);
  next.revision += 1;
  return next;
}

export function reactivateContextFrame(
  field: ContextField,
  contextId: string,
  turnId: string,
  observedAt: string,
): ContextField {
  const frame = field.frames.find((item) => item.id === contextId);

  if (frame === undefined) {
    throw new Error(`Unknown context frame "${contextId}".`);
  }

  return updateContextField(field, {
    topic: frame.topic,
    ...(frame.intent === null ? {} : { intent: frame.intent }),
    summary: frame.summary,
    scope: frame.scope,
    turnId,
    observedAt,
    returnToContextId: contextId,
    transitionTrigger: "return_to_previous",
    bridge: `Reactivated previous context ${contextId}.`,
  }).field;
}

export interface UnpinContextFrameInput {
  transferVerified: boolean;
  reason?: string;
  updatedAt: string;
}

export function unpinContextFrame(
  field: ContextField,
  contextId: string,
  input: UnpinContextFrameInput,
): ContextField {
  if (!input.transferVerified) {
    throw new Error("Pinned context cannot be released without verified transfer.");
  }

  const next = clonePlainData(field);
  const frame = next.frames.find((item) => item.id === contextId);
  if (frame === undefined) {
    throw new Error(`Unknown context frame "${contextId}".`);
  }

  if (input.reason === undefined) {
    frame.protectedReasons = [];
  } else {
    const normalizedReason = input.reason.trim().toLowerCase();
    frame.protectedReasons = frame.protectedReasons.filter(
      (reason) => reason.trim().toLowerCase() !== normalizedReason,
    );
  }

  if (frame.protectedReasons.length === 0) {
    frame.retentionState = frame.activationState === "dormant" ? "dormant" : "active";
  }
  next.revision += 1;
  next.updatedAt = input.updatedAt;
  return next;
}
