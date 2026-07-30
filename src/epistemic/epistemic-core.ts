import { clonePlainData } from "../utils/clone-plain-data.js";
import { normalizeText, uniqueNormalizedStrings } from "../utils/normalized-set.js";
import { stableHash } from "../utils/stable-hash.js";
import type {
  EpistemicCore,
  EpistemicState,
  TruthAnchor,
  TruthAnchorInput,
  TruthAnchorSource,
  TruthChallenge,
  TruthChallengeDecision,
} from "./types.js";

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function stateAuthority(state: EpistemicState): number {
  switch (state) {
    case "authoritative":
      return 1;
    case "verified":
      return 0.92;
    case "supported":
      return 0.78;
    case "observed":
      return 0.68;
    case "inferred":
      return 0.55;
    case "hypothetical":
      return 0.35;
    case "disputed":
      return 0.28;
    case "refuted":
      return 0.08;
    case "unknown":
      return 0.15;
  }
}

function createAnchor(input: TruthAnchorInput, now: string): TruthAnchor {
  const id =
    input.id ??
    `truth-${stableHash({
      statement: normalizeText(input.statement),
      scope: input.scope,
      validFrom: input.validFrom,
    })}`;

  return {
    id,
    statement: input.statement.trim(),
    state: input.state,
    status: "active",
    scope: clonePlainData(input.scope),
    sourceIds: uniqueNormalizedStrings(input.sourceIds),
    confidence: clamp(input.confidence),
    revision: 1,
    validFrom: input.validFrom,
    validUntil: input.validUntil ?? null,
    supersededById: null,
    contradictionIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createEpistemicCore(
  anchors: TruthAnchorInput[],
  sources: TruthAnchorSource[],
  createdAt = new Date().toISOString(),
): EpistemicCore {
  const sourceIds = new Set(sources.map((source) => source.id));

  for (const anchor of anchors) {
    const missing = anchor.sourceIds.filter((id) => !sourceIds.has(id));
    if (missing.length > 0) {
      throw new Error(
        `Truth anchor references unknown source ids: ${missing.join(", ")}.`,
      );
    }
  }

  return {
    revision: 1,
    anchors: anchors.map((anchor) => createAnchor(anchor, createdAt)),
    sources: clonePlainData(sources),
    updatedAt: createdAt,
  };
}

export function upsertTruthAnchor(
  core: EpistemicCore,
  input: TruthAnchorInput,
  updatedAt = new Date().toISOString(),
): EpistemicCore {
  const next = clonePlainData(core);
  const id =
    input.id ??
    `truth-${stableHash({
      statement: normalizeText(input.statement),
      scope: input.scope,
      validFrom: input.validFrom,
    })}`;
  const existingIndex = next.anchors.findIndex((anchor) => anchor.id === id);

  if (existingIndex < 0) {
    next.anchors.push(createAnchor({ ...input, id }, updatedAt));
  } else {
    const existing = next.anchors[existingIndex]!;
    next.anchors[existingIndex] = {
      ...existing,
      statement: input.statement.trim(),
      state: input.state,
      status: "active",
      scope: clonePlainData(input.scope),
      sourceIds: uniqueNormalizedStrings(input.sourceIds),
      confidence: clamp(input.confidence),
      revision: existing.revision + 1,
      validFrom: input.validFrom,
      validUntil: input.validUntil ?? null,
      updatedAt,
    };
  }

  next.revision += 1;
  next.updatedAt = updatedAt;
  return next;
}

function strongestIndependentWeight(
  challenges: TruthChallenge[],
  kind: TruthChallenge["kind"],
): number {
  const strongest = new Map<string, number>();

  for (const challenge of challenges) {
    if (challenge.kind !== kind) {
      continue;
    }
    const current = strongest.get(challenge.independenceKey) ?? 0;
    strongest.set(challenge.independenceKey, Math.max(current, clamp(challenge.weight)));
  }

  let remaining = 1;
  for (const weight of strongest.values()) {
    remaining *= 1 - weight;
  }
  return 1 - remaining;
}

export function applyTruthChallenges(
  core: EpistemicCore,
  anchorId: string,
  challenges: TruthChallenge[],
  updatedAt = new Date().toISOString(),
): { core: EpistemicCore; decision: TruthChallengeDecision } {
  const anchor = core.anchors.find((item) => item.id === anchorId);
  if (anchor === undefined) {
    throw new Error(`Unknown truth anchor: ${anchorId}.`);
  }

  const relevant = challenges.filter((challenge) => challenge.anchorId === anchorId);
  const support = strongestIndependentWeight(relevant, "supports");
  const contradiction = strongestIndependentWeight(relevant, "contradicts");
  const supersession = strongestIndependentWeight(relevant, "supersedes");
  const stale = strongestIndependentWeight(relevant, "marks_stale");
  const requiredChallenge = Math.max(0.55, stateAuthority(anchor.state) * 0.8);
  const next = clonePlainData(core);
  const targetIndex = next.anchors.findIndex((item) => item.id === anchorId);
  const target = next.anchors[targetIndex]!;
  const reasons: string[] = [];
  let createdAnchorId: string | null = null;

  if (support > 0) {
    target.confidence = clamp(target.confidence + support * 0.15);
    reasons.push("Independent support increased confidence without changing authority class.");
  }

  if (contradiction > 0) {
    target.contradictionIds = uniqueNormalizedStrings([
      ...target.contradictionIds,
      ...relevant
        .filter((challenge) => challenge.kind === "contradicts")
        .map((challenge) => challenge.id),
    ]);
    target.confidence = clamp(target.confidence - contradiction * 0.45);

    if (contradiction >= requiredChallenge) {
      target.state = "disputed";
      reasons.push("Contradiction strength was proportional to the anchor authority.");
    } else {
      reasons.push("Contradiction was recorded but was insufficient to displace the anchor.");
    }
  }

  const supersedingChallenge = relevant
    .filter((challenge) => challenge.kind === "supersedes" && challenge.replacement !== undefined)
    .sort((left, right) => right.weight - left.weight)[0];

  if (
    supersedingChallenge !== undefined &&
    supersession >= requiredChallenge &&
    supersedingChallenge.replacement !== undefined
  ) {
    const replacement = createAnchor(supersedingChallenge.replacement, updatedAt);
    target.status = "superseded";
    target.validUntil = updatedAt;
    target.supersededById = replacement.id;
    next.anchors.push(replacement);
    createdAnchorId = replacement.id;
    reasons.push("A sufficiently authoritative replacement superseded the previous scoped truth.");
  } else if (stale >= requiredChallenge) {
    target.status = "stale";
    reasons.push("The anchor was marked stale in its declared scope and time range.");
  }

  target.revision += 1;
  target.updatedAt = updatedAt;
  next.revision += 1;
  next.updatedAt = updatedAt;

  return {
    core: next,
    decision: {
      accepted:
        support > 0 || contradiction > 0 || supersession >= requiredChallenge || stale >= requiredChallenge,
      anchorId,
      resultingState: target.state,
      resultingStatus: target.status,
      confidence: target.confidence,
      createdAnchorId,
      reasons,
    },
  };
}

export function activeTruthAnchors(core: EpistemicCore, now: string): TruthAnchor[] {
  const timestamp = Date.parse(now);
  return core.anchors.filter((anchor) => {
    if (anchor.status !== "active") {
      return false;
    }
    if (Date.parse(anchor.validFrom) > timestamp) {
      return false;
    }
    return anchor.validUntil === null || Date.parse(anchor.validUntil) >= timestamp;
  });
}
