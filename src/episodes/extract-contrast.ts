import { stableStringify } from "../utils/stable-hash.js";
import type {
  EpisodeContrast,
  InferredDiscriminatingProperty,
  InteractionAttempt,
  InteractionEpisode,
  PropertyDifference,
} from "./types.js";
import { analyzeEpisode } from "./analyze-episode.js";

function flattenProperties(
  value: unknown,
  prefix = "",
  target: Map<string, unknown> = new Map(),
): Map<string, unknown> {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    const entries = Object.entries(value as Record<string, unknown>);

    if (entries.length === 0 && prefix.length > 0) {
      target.set(prefix, value);
    }

    for (const [key, nestedValue] of entries) {
      const nextPrefix = prefix.length > 0 ? `${prefix}.${key}` : key;
      flattenProperties(nestedValue, nextPrefix, target);
    }

    return target;
  }

  if (prefix.length > 0) {
    target.set(prefix, value);
  }

  return target;
}

function findAttempt(
  episode: InteractionEpisode,
  attemptId: string,
): InteractionAttempt {
  const attempt = episode.attempts.find((item) => item.id === attemptId);

  if (!attempt) {
    throw new Error(`Attempt "${attemptId}" was not found in the episode.`);
  }

  return attempt;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function collectDifferences(
  rejected: InteractionAttempt,
  accepted: InteractionAttempt,
): PropertyDifference[] {
  const rejectedProperties = flattenProperties(rejected.result.properties);
  const acceptedProperties = flattenProperties(accepted.result.properties);
  const paths = new Set([
    ...rejectedProperties.keys(),
    ...acceptedProperties.keys(),
  ]);
  const differences: PropertyDifference[] = [];

  for (const propertyPath of paths) {
    const rejectedValue = rejectedProperties.get(propertyPath);
    const acceptedValue = acceptedProperties.get(propertyPath);

    if (valuesEqual(rejectedValue, acceptedValue)) {
      continue;
    }

    differences.push({
      propertyPath,
      rejectedValue,
      acceptedValue,
      rejectedAttemptId: rejected.id,
      acceptedAttemptId: accepted.id,
    });
  }

  return differences;
}

function inferDiscriminators(
  differences: readonly PropertyDifference[],
  rejectedAttemptIds: readonly string[],
  acceptedAttemptId: string,
): InferredDiscriminatingProperty[] {
  const byProperty = new Map<string, PropertyDifference[]>();

  for (const difference of differences) {
    const current = byProperty.get(difference.propertyPath) ?? [];
    current.push(difference);
    byProperty.set(difference.propertyPath, current);
  }

  const result: InferredDiscriminatingProperty[] = [];

  for (const [propertyPath, items] of byProperty) {
    const acceptedValues = new Set(
      items.map((item) => stableStringify(item.acceptedValue)),
    );

    if (acceptedValues.size !== 1) {
      continue;
    }

    const supportingAttemptIds = Array.from(
      new Set(items.map((item) => item.rejectedAttemptId)),
    );
    const supportRatio =
      rejectedAttemptIds.length === 0
        ? 0
        : supportingAttemptIds.length / rejectedAttemptIds.length;
    const confidence = Math.min(0.95, 0.45 + supportRatio * 0.45);

    result.push({
      propertyPath,
      acceptedValue: items[0]?.acceptedValue,
      confidence,
      supportingAttemptIds: [...supportingAttemptIds, acceptedAttemptId],
      contradictingAttemptIds: rejectedAttemptIds.filter(
        (id) => !supportingAttemptIds.includes(id),
      ),
      status: supportRatio >= 0.75 ? "supported" : "candidate",
    });
  }

  return result.sort((left, right) => right.confidence - left.confidence);
}

function inferRelationalDiscriminators(
  episode: InteractionEpisode,
  acceptedAttempt: InteractionAttempt,
  rejectedAttemptIds: readonly string[],
): InferredDiscriminatingProperty[] {
  const acceptedProperties = Array.from(
    flattenProperties(acceptedAttempt.result.properties).entries(),
  ).filter((entry): entry is [string, number] => typeof entry[1] === "number");
  const boundedProperties = acceptedProperties.slice(0, 64);
  const result: InferredDiscriminatingProperty[] = [];

  for (let leftIndex = 0; leftIndex < boundedProperties.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < boundedProperties.length;
      rightIndex += 1
    ) {
      const left = boundedProperties[leftIndex];
      const right = boundedProperties[rightIndex];

      if (!left || !right || left[1] !== right[1]) {
        continue;
      }

      const supportingAttemptIds: string[] = [];
      const contradictingAttemptIds: string[] = [];

      for (const attemptId of rejectedAttemptIds) {
        const rejectedProperties = flattenProperties(
          findAttempt(episode, attemptId).result.properties,
        );
        const rejectedLeft = rejectedProperties.get(left[0]);
        const rejectedRight = rejectedProperties.get(right[0]);

        if (
          typeof rejectedLeft === "number" &&
          typeof rejectedRight === "number" &&
          rejectedLeft !== rejectedRight
        ) {
          supportingAttemptIds.push(attemptId);
        } else {
          contradictingAttemptIds.push(attemptId);
        }
      }

      if (supportingAttemptIds.length === 0) {
        continue;
      }

      const supportRatio =
        supportingAttemptIds.length / Math.max(1, rejectedAttemptIds.length);

      result.push({
        propertyPath: `$relation:${left[0]}==${right[0]}`,
        acceptedValue: true,
        confidence: Math.min(0.97, 0.55 + supportRatio * 0.4),
        supportingAttemptIds: [
          ...supportingAttemptIds,
          acceptedAttempt.id,
        ],
        contradictingAttemptIds,
        status: supportRatio >= 0.75 ? "supported" : "candidate",
      });
    }
  }

  return result;
}

export function extractEpisodeContrast(
  episode: InteractionEpisode,
): EpisodeContrast {
  const analysis = analyzeEpisode(episode);
  const acceptedAttemptId = analysis.latestAcceptedAttemptId;

  if (!acceptedAttemptId) {
    return {
      episodeId: episode.id,
      acceptedAttemptId: null,
      rejectedAttemptIds: analysis.rejectedAttemptIds,
      differences: [],
      inferredDiscriminators: [],
      unresolvedReasons: [
        "No accepted user outcome is available for contrastive analysis.",
      ],
    };
  }

  const acceptedAttempt = findAttempt(episode, acceptedAttemptId);
  const differences = analysis.rejectedAttemptIds.flatMap((attemptId) =>
    collectDifferences(findAttempt(episode, attemptId), acceptedAttempt),
  );
  const inferredDiscriminators = [
    ...inferRelationalDiscriminators(
      episode,
      acceptedAttempt,
      analysis.rejectedAttemptIds,
    ),
    ...inferDiscriminators(
      differences,
      analysis.rejectedAttemptIds,
      acceptedAttemptId,
    ),
  ].sort((left, right) => right.confidence - left.confidence);
  const unresolvedReasons: string[] = [];

  if (analysis.rejectedAttemptIds.length === 0) {
    unresolvedReasons.push(
      "The result was accepted, but there is no rejected attempt to isolate a discriminating change.",
    );
  }

  if (
    analysis.rejectedAttemptIds.length > 0 &&
    inferredDiscriminators.length === 0
  ) {
    unresolvedReasons.push(
      "Rejected and accepted attempts differ, but no stable discriminating property could be isolated.",
    );
  }

  return {
    episodeId: episode.id,
    acceptedAttemptId,
    rejectedAttemptIds: analysis.rejectedAttemptIds,
    differences,
    inferredDiscriminators,
    unresolvedReasons,
  };
}
