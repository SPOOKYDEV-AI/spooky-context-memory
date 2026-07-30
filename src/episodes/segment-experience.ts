import { clonePlainData } from "../utils/clone-plain-data.js";
import type { InteractionEpisode } from "./types.js";

/**
 * Splits one interaction episode into deterministic experience units.
 * Attempts without an explicit experienceUnitId remain in the episode's default unit.
 */
export function segmentInteractionEpisode(
  episode: InteractionEpisode,
): InteractionEpisode[] {
  const grouped = new Map<string, InteractionEpisode["attempts"]>();

  for (const attempt of episode.attempts) {
    const unitId = attempt.experienceUnitId?.trim() || "default";
    const attempts = grouped.get(unitId) ?? [];
    attempts.push(clonePlainData(attempt));
    grouped.set(unitId, attempts);
  }

  return Array.from(grouped.entries()).map(([unitId, attempts]) => {
    const segment: InteractionEpisode = {
      id: `${episode.id}:${unitId}`,
      scope: clonePlainData(episode.scope),
      initialRequest: clonePlainData(episode.initialRequest),
      attempts,
      startedAt: episode.startedAt,
    };

    if (episode.completedAt) {
      segment.completedAt = episode.completedAt;
    }

    return segment;
  });
}
