import { clonePlainData } from "../utils/clone-plain-data.js";
import {
  normalizeText,
  uniqueNormalizedStrings,
  weightedJaccardSimilarity,
} from "../utils/normalized-set.js";
import { stableHash } from "../utils/stable-hash.js";
import type {
  ApplyUnderstandingObservationsInput,
  ApplyUnderstandingObservationsResult,
  CreateGlobalUnderstandingStateInput,
  GlobalRevisionDecision,
  GlobalUnderstandingModel,
  GlobalUnderstandingPolicy,
  GlobalUnderstandingPolicyOverrides,
  GlobalUnderstandingState,
  SemanticBackboneEdge,
  UnderstandingObservation,
} from "./types.js";

const DEFAULT_POLICY: GlobalUnderstandingPolicy = {
  minimumCoherence: 0.55,
  globalRevisionPressureThreshold: 0.68,
  localRevisionPressureThreshold: 0.34,
  minimumIndependentChallengesForGlobalRevision: 2,
  alternativePromotionMargin: 0.12,
  contextDriftWeight: 0.28,
  truthChangeWeight: 0.35,
  stabilityInertia: 0.72,
};

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function resolvePolicy(
  overrides: GlobalUnderstandingPolicyOverrides | undefined,
): GlobalUnderstandingPolicy {
  const policy = { ...DEFAULT_POLICY, ...overrides };
  for (const name of [
    "minimumCoherence",
    "globalRevisionPressureThreshold",
    "localRevisionPressureThreshold",
    "alternativePromotionMargin",
    "contextDriftWeight",
    "truthChangeWeight",
    "stabilityInertia",
  ] as const) {
    const value = policy[name];
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`${name} must be between 0 and 1.`);
    }
  }
  if (
    !Number.isInteger(policy.minimumIndependentChallengesForGlobalRevision) ||
    policy.minimumIndependentChallengesForGlobalRevision < 1
  ) {
    throw new Error("minimumIndependentChallengesForGlobalRevision must be a positive integer.");
  }
  return policy;
}

function normalizeModel(model: GlobalUnderstandingModel): GlobalUnderstandingModel {
  return {
    ...clonePlainData(model),
    invariantIds: uniqueNormalizedStrings(model.invariantIds),
    truthAnchorIds: uniqueNormalizedStrings(model.truthAnchorIds),
    corePatternIds: uniqueNormalizedStrings(model.corePatternIds),
    unresolvedQuestionIds: uniqueNormalizedStrings(model.unresolvedQuestionIds),
    semanticBackboneEdgeIds: uniqueNormalizedStrings(model.semanticBackboneEdgeIds),
    independentSupportKeys: uniqueNormalizedStrings(model.independentSupportKeys),
    independentChallengeKeys: uniqueNormalizedStrings(model.independentChallengeKeys),
    derivedFromModelIds: uniqueNormalizedStrings(model.derivedFromModelIds),
    claims: model.claims.map((claim) => ({
      ...clonePlainData(claim),
      key: normalizeText(claim.key),
      statement: claim.statement.trim(),
      confidence: clamp(claim.confidence),
      truthAnchorIds: uniqueNormalizedStrings(claim.truthAnchorIds),
      patternIds: uniqueNormalizedStrings(claim.patternIds),
      viewIds: uniqueNormalizedStrings(claim.viewIds),
      independentSupportKeys: uniqueNormalizedStrings(claim.independentSupportKeys),
      independentChallengeKeys: uniqueNormalizedStrings(claim.independentChallengeKeys),
    })),
    coherence: clamp(model.coherence),
    stability: clamp(model.stability),
    plasticity: clamp(model.plasticity),
    uncertainty: clamp(model.uncertainty),
    contextCoverage: clamp(model.contextCoverage),
    contradictionPressure: clamp(model.contradictionPressure),
    revisionPressure: clamp(model.revisionPressure),
  };
}

function normalizeBackboneEdge(edge: SemanticBackboneEdge): SemanticBackboneEdge {
  return {
    ...clonePlainData(edge),
    confidence: clamp(edge.confidence),
    independentSupportKeys: uniqueNormalizedStrings(edge.independentSupportKeys),
    independentChallengeKeys: uniqueNormalizedStrings(edge.independentChallengeKeys),
  };
}

export function createGlobalUnderstandingState(
  input: CreateGlobalUnderstandingStateInput,
): GlobalUnderstandingState {
  const now = input.createdAt ?? input.dominantModel.updatedAt;
  const dominant = normalizeModel({
    ...input.dominantModel,
    status: "dominant",
    updatedAt: now,
  });
  const alternatives = (input.alternativeModels ?? []).map((model) =>
    normalizeModel({ ...model, status: "alternative", updatedAt: now }),
  );
  return {
    revision: 1,
    dominantModelId: dominant.id,
    alternativeModelIds: alternatives.map((model) => model.id),
    models: [dominant, ...alternatives],
    semanticBackbone: (input.semanticBackbone ?? []).map(normalizeBackboneEdge),
    localRevisionCount: 0,
    globalRevisionCount: 0,
    updatedAt: now,
  };
}

function strongestIndependentPressure(
  observations: UnderstandingObservation[],
  effects: UnderstandingObservation["effect"][],
): { pressure: number; keys: string[] } {
  const strongest = new Map<string, number>();
  for (const observation of observations) {
    if (!effects.includes(observation.effect)) {
      continue;
    }
    strongest.set(
      observation.independenceKey,
      Math.max(strongest.get(observation.independenceKey) ?? 0, clamp(observation.weight)),
    );
  }
  let remaining = 1;
  for (const value of strongest.values()) {
    remaining *= 1 - value;
  }
  return { pressure: 1 - remaining, keys: [...strongest.keys()] };
}

function modelFitness(model: GlobalUnderstandingModel): number {
  return clamp(
    model.coherence * 0.32 +
      model.contextCoverage * 0.22 +
      model.stability * 0.18 +
      model.plasticity * 0.08 +
      (1 - model.uncertainty) * 0.12 +
      (1 - model.contradictionPressure) * 0.08,
  );
}

function contextDrift(model: GlobalUnderstandingModel, observations: UnderstandingObservation[]): number {
  const current = observations.filter((item) => item.kind === "context_shift");
  if (current.length === 0) {
    return 0;
  }
  const exact = current.filter(
    (item) => normalizeText(item.contextFingerprint) === normalizeText(model.contextFingerprint),
  );
  const pressure = strongestIndependentPressure(current, ["challenges", "supersedes"]).pressure;
  return clamp(pressure + (exact.length === 0 ? 0.25 : 0));
}

function observationsForModel(
  model: GlobalUnderstandingModel,
  observations: UnderstandingObservation[],
): UnderstandingObservation[] {
  const targetIds = new Set([
    model.id,
    ...model.invariantIds,
    ...model.truthAnchorIds,
    ...model.corePatternIds,
    ...model.claims.map((claim) => claim.id),
    ...model.semanticBackboneEdgeIds,
  ]);
  return observations.filter(
    (observation) =>
      observation.targetIds.length === 0 ||
      observation.targetIds.some((targetId) => targetIds.has(targetId)),
  );
}

function reviseModel(
  model: GlobalUnderstandingModel,
  observations: UnderstandingObservation[],
  policy: GlobalUnderstandingPolicy,
  updatedAt: string,
): { model: GlobalUnderstandingModel; affectedClaimIds: string[] } {
  const relevant = observationsForModel(model, observations);
  const support = strongestIndependentPressure(relevant, ["supports", "expands"]);
  const challenge = strongestIndependentPressure(relevant, ["challenges", "narrows", "supersedes"]);
  const drift = contextDrift(model, relevant);
  const truthPressure = strongestIndependentPressure(
    relevant.filter((item) => item.kind === "truth_change"),
    ["challenges", "supersedes", "narrows"],
  ).pressure;
  const revisionPressure = clamp(
    challenge.pressure * 0.48 +
      drift * policy.contextDriftWeight +
      truthPressure * policy.truthChangeWeight,
  );
  const contradictionPressure = clamp(
    model.contradictionPressure * 0.55 + challenge.pressure * 0.65 - support.pressure * 0.2,
  );
  const coherence = clamp(
    model.coherence * 0.72 +
      support.pressure * 0.28 -
      challenge.pressure * 0.24 -
      drift * 0.12,
  );
  const contextCoverage = clamp(
    model.contextCoverage * 0.7 +
      relevant.filter((item) => item.contextFingerprint === model.contextFingerprint).length * 0.06 +
      support.pressure * 0.12 -
      drift * 0.25,
  );
  const stability = clamp(
    model.stability * policy.stabilityInertia +
      coherence * (1 - policy.stabilityInertia) -
      revisionPressure * 0.22,
  );
  const plasticity = clamp(
    model.plasticity * 0.68 + revisionPressure * 0.32 + support.pressure * 0.08,
  );
  const uncertainty = clamp(
    model.uncertainty * 0.76 + challenge.pressure * 0.32 - support.pressure * 0.2,
  );
  const affectedClaimIds: string[] = [];
  const claims = model.claims.map((claim) => {
    const claimObservations = relevant.filter((observation) =>
      observation.targetIds.includes(claim.id),
    );
    if (claimObservations.length === 0) {
      return clonePlainData(claim);
    }
    affectedClaimIds.push(claim.id);
    const claimSupport = strongestIndependentPressure(claimObservations, ["supports", "expands"]);
    const claimChallenge = strongestIndependentPressure(
      claimObservations,
      ["challenges", "narrows", "supersedes"],
    );
    const status =
      claimChallenge.pressure >= 0.7
        ? "disputed"
        : claimObservations.some((item) => item.effect === "supersedes")
          ? "retired"
          : claim.status;
    return {
      ...clonePlainData(claim),
      status,
      confidence: clamp(
        claim.confidence + claimSupport.pressure * 0.18 - claimChallenge.pressure * 0.34,
      ),
      independentSupportKeys: uniqueNormalizedStrings([
        ...claim.independentSupportKeys,
        ...claimSupport.keys,
      ]),
      independentChallengeKeys: uniqueNormalizedStrings([
        ...claim.independentChallengeKeys,
        ...claimChallenge.keys,
      ]),
    };
  });
  return {
    model: {
      ...normalizeModel(model),
      revision: model.revision + (relevant.length > 0 ? 1 : 0),
      claims,
      coherence,
      stability,
      plasticity,
      uncertainty,
      contextCoverage,
      contradictionPressure,
      revisionPressure,
      independentSupportKeys: uniqueNormalizedStrings([
        ...model.independentSupportKeys,
        ...support.keys,
      ]),
      independentChallengeKeys: uniqueNormalizedStrings([
        ...model.independentChallengeKeys,
        ...challenge.keys,
      ]),
      updatedAt,
    },
    affectedClaimIds,
  };
}

function chooseAlternative(
  state: GlobalUnderstandingState,
  dominant: GlobalUnderstandingModel,
  policy: GlobalUnderstandingPolicy,
): GlobalUnderstandingModel | null {
  const candidates = state.models
    .filter((model) => state.alternativeModelIds.includes(model.id))
    .sort((left, right) => modelFitness(right) - modelFitness(left));
  const best = candidates[0];
  if (best === undefined) {
    return null;
  }
  return modelFitness(best) >= modelFitness(dominant) + policy.alternativePromotionMargin
    ? best
    : null;
}

function buildDecision(
  state: GlobalUnderstandingState,
  model: GlobalUnderstandingModel,
  observations: UnderstandingObservation[],
  policy: GlobalUnderstandingPolicy,
  replacementModel: GlobalUnderstandingModel | undefined,
): GlobalRevisionDecision {
  const relevant = observationsForModel(model, observations);
  const challenge = strongestIndependentPressure(
    relevant,
    ["challenges", "narrows", "supersedes"],
  );
  const alternative = chooseAlternative(state, model, policy);
  const triggers = relevant.map((item) => item.id);

  if (alternative !== null) {
    return {
      action: "promote_alternative",
      modelId: model.id,
      replacementModelId: alternative.id,
      confidence: clamp(modelFitness(alternative)),
      reasons: ["An alternative global model now explains the active context with a sufficient margin."],
      triggeringObservationIds: triggers,
      reversible: true,
    };
  }

  if (
    model.revisionPressure >= policy.globalRevisionPressureThreshold &&
    challenge.keys.length >= policy.minimumIndependentChallengesForGlobalRevision
  ) {
    return {
      action: "global_revision",
      modelId: model.id,
      replacementModelId: replacementModel?.id ?? null,
      confidence: clamp(model.revisionPressure),
      reasons: [
        "Independent contradictions exceeded the global revision pressure band.",
        replacementModel === undefined
          ? "The dominant model is challenged, but no replacement model was supplied."
          : "A replacement model is available for controlled promotion.",
      ],
      triggeringObservationIds: triggers,
      reversible: true,
    };
  }

  if (model.revisionPressure >= policy.localRevisionPressureThreshold) {
    return {
      action:
        model.coherence < policy.minimumCoherence ? "challenge_dominant" : "local_revision",
      modelId: model.id,
      replacementModelId: null,
      confidence: clamp(Math.max(model.revisionPressure, 1 - model.coherence)),
      reasons: [
        model.coherence < policy.minimumCoherence
          ? "Coherence fell below the protected global band."
          : "The evidence justifies a local revision without replacing the global model.",
      ],
      triggeringObservationIds: triggers,
      reversible: true,
    };
  }

  return {
    action: "maintain",
    modelId: model.id,
    replacementModelId: null,
    confidence: clamp(model.coherence * 0.6 + model.stability * 0.4),
    reasons: ["Local memory movement remains compatible with the current global understanding."],
    triggeringObservationIds: triggers,
    reversible: true,
  };
}

function updateBackbone(
  edges: SemanticBackboneEdge[],
  observations: UnderstandingObservation[],
  updatedAt: string,
): { edges: SemanticBackboneEdge[]; affectedIds: string[] } {
  const affectedIds: string[] = [];
  const next = edges.map((edge) => {
    const relevant = observations.filter((observation) =>
      observation.targetIds.includes(edge.id),
    );
    if (relevant.length === 0) {
      return clonePlainData(edge);
    }
    affectedIds.push(edge.id);
    const support = strongestIndependentPressure(relevant, ["supports", "expands"]);
    const challenge = strongestIndependentPressure(
      relevant,
      ["challenges", "narrows", "supersedes"],
    );
    const superseded = relevant.some((observation) => observation.effect === "supersedes");
    return {
      ...clonePlainData(edge),
      confidence: clamp(edge.confidence + support.pressure * 0.16 - challenge.pressure * 0.32),
      status: superseded
        ? "superseded"
        : challenge.pressure >= 0.65
          ? "disputed"
          : support.pressure >= 0.75
            ? "verified"
            : support.pressure > 0
              ? "supported"
              : edge.status,
      independentSupportKeys: uniqueNormalizedStrings([
        ...edge.independentSupportKeys,
        ...support.keys,
      ]),
      independentChallengeKeys: uniqueNormalizedStrings([
        ...edge.independentChallengeKeys,
        ...challenge.keys,
      ]),
      updatedAt,
    } as SemanticBackboneEdge;
  });
  return { edges: next, affectedIds };
}

export function applyUnderstandingObservations(
  input: ApplyUnderstandingObservationsInput,
): ApplyUnderstandingObservationsResult {
  const policy = resolvePolicy(input.policy);
  const updatedAt = input.updatedAt ?? input.state.updatedAt;
  const next = clonePlainData(input.state);
  const dominantIndex = next.models.findIndex(
    (model) => model.id === next.dominantModelId,
  );
  if (dominantIndex < 0) {
    throw new Error(`Unknown dominant global understanding model: ${next.dominantModelId}.`);
  }
  const revised = reviseModel(
    next.models[dominantIndex]!,
    input.observations,
    policy,
    updatedAt,
  );
  next.models[dominantIndex] = revised.model;
  const backbone = updateBackbone(next.semanticBackbone, input.observations, updatedAt);
  next.semanticBackbone = backbone.edges;
  let decision = buildDecision(
    next,
    revised.model,
    input.observations,
    policy,
    input.replacementModel,
  );

  if (decision.action === "promote_alternative" && decision.replacementModelId !== null) {
    const replacementIndex = next.models.findIndex(
      (model) => model.id === decision.replacementModelId,
    );
    if (replacementIndex >= 0) {
      next.models[dominantIndex] = {
        ...next.models[dominantIndex]!,
        status: "alternative",
        updatedAt,
      };
      next.models[replacementIndex] = {
        ...next.models[replacementIndex]!,
        status: "dominant",
        revision: next.models[replacementIndex]!.revision + 1,
        updatedAt,
      };
      next.dominantModelId = next.models[replacementIndex]!.id;
      next.alternativeModelIds = uniqueNormalizedStrings([
        ...next.alternativeModelIds.filter((id) => id !== next.dominantModelId),
        revised.model.id,
      ]);
      next.globalRevisionCount += 1;
    }
  } else if (decision.action === "global_revision") {
    next.models[dominantIndex] = {
      ...next.models[dominantIndex]!,
      status: "challenged",
      updatedAt,
    };
    if (input.replacementModel !== undefined) {
      const replacement = normalizeModel({
        ...input.replacementModel,
        status: "dominant",
        revision: Math.max(1, input.replacementModel.revision),
        derivedFromModelIds: uniqueNormalizedStrings([
          ...input.replacementModel.derivedFromModelIds,
          revised.model.id,
        ]),
        updatedAt,
      });
      const existingIndex = next.models.findIndex((model) => model.id === replacement.id);
      if (existingIndex >= 0) {
        next.models[existingIndex] = replacement;
      } else {
        next.models.push(replacement);
      }
      next.dominantModelId = replacement.id;
      next.alternativeModelIds = uniqueNormalizedStrings([
        ...next.alternativeModelIds.filter((id) => id !== replacement.id),
        revised.model.id,
      ]);
      next.globalRevisionCount += 1;
      decision = { ...decision, replacementModelId: replacement.id };
    }
  } else if (["local_revision", "challenge_dominant"].includes(decision.action)) {
    next.localRevisionCount += 1;
    if (decision.action === "challenge_dominant") {
      next.models[dominantIndex] = {
        ...next.models[dominantIndex]!,
        status: "challenged",
        updatedAt,
      };
    }
  }

  next.revision += input.observations.length > 0 ? 1 : 0;
  next.updatedAt = updatedAt;
  return {
    state: next,
    decision,
    affectedModelIds: input.observations.length > 0 ? [revised.model.id] : [],
    affectedClaimIds: revised.affectedClaimIds,
    affectedBackboneEdgeIds: backbone.affectedIds,
  };
}

export function globalUnderstandingSimilarity(
  left: GlobalUnderstandingModel,
  right: GlobalUnderstandingModel,
): number {
  const identity =
    normalizeText(left.identity.primaryGoal) === normalizeText(right.identity.primaryGoal)
      ? 1
      : 0;
  return clamp(
    identity * 0.35 +
      weightedJaccardSimilarity(left.invariantIds, right.invariantIds) * 0.25 +
      weightedJaccardSimilarity(left.truthAnchorIds, right.truthAnchorIds) * 0.2 +
      weightedJaccardSimilarity(left.corePatternIds, right.corePatternIds) * 0.2,
  );
}

export function createGlobalUnderstandingModelId(input: {
  identity: GlobalUnderstandingModel["identity"];
  scope: GlobalUnderstandingModel["scope"];
  contextFingerprint: string;
}): string {
  return `understanding-${stableHash({
    identity: input.identity,
    scope: input.scope,
    contextFingerprint: normalizeText(input.contextFingerprint),
  })}`;
}
