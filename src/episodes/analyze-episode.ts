import type {
  EpisodeAnalysis,
  InteractionEpisode,
  OutcomeVerdict,
} from "./types.js";

export class EpisodeValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "EpisodeValidationError";
  }
}

function requireNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new EpisodeValidationError(`${field} must not be empty.`);
  }
}

function classifyAttempts(
  episode: InteractionEpisode,
  verdict: OutcomeVerdict,
): string[] {
  return episode.attempts
    .filter((attempt) => attempt.userVerdict === verdict)
    .map((attempt) => attempt.id);
}

export function analyzeEpisode(episode: InteractionEpisode): EpisodeAnalysis {
  requireNonEmpty(episode.id, "episode.id");
  requireNonEmpty(
    episode.initialRequest.interpretedIntent,
    "episode.initialRequest.interpretedIntent",
  );
  requireNonEmpty(episode.initialRequest.target, "episode.initialRequest.target");
  requireNonEmpty(
    episode.initialRequest.expectedOutcome,
    "episode.initialRequest.expectedOutcome",
  );

  if (episode.attempts.length === 0) {
    throw new EpisodeValidationError("episode.attempts must not be empty.");
  }

  const ids = new Set<string>();
  let totalPassingEvidence = 0;
  let totalFailingEvidence = 0;

  for (const attempt of episode.attempts) {
    requireNonEmpty(attempt.id, "episode.attempts[].id");
    requireNonEmpty(
      attempt.interpretation,
      `episode.attempts[${attempt.id}].interpretation`,
    );
    requireNonEmpty(
      attempt.result.summary,
      `episode.attempts[${attempt.id}].result.summary`,
    );

    if (ids.has(attempt.id)) {
      throw new EpisodeValidationError(
        `Interaction attempt id "${attempt.id}" is duplicated.`,
      );
    }

    ids.add(attempt.id);

    for (const evidence of attempt.technicalEvidence) {
      if (evidence.passed) {
        totalPassingEvidence += 1;
      } else {
        totalFailingEvidence += 1;
      }
    }
  }

  const acceptedAttemptIds = classifyAttempts(episode, "accepted");
  const rejectedAttemptIds = classifyAttempts(episode, "rejected");
  const partiallyAcceptedAttemptIds = classifyAttempts(
    episode,
    "partially_accepted",
  );
  const unknownAttemptIds = classifyAttempts(episode, "unknown");

  return {
    episodeId: episode.id,
    acceptedAttemptIds,
    rejectedAttemptIds,
    partiallyAcceptedAttemptIds,
    unknownAttemptIds,
    latestAcceptedAttemptId:
      acceptedAttemptIds[acceptedAttemptIds.length - 1] ?? null,
    hasOutcomeContrast:
      acceptedAttemptIds.length > 0 && rejectedAttemptIds.length > 0,
    totalPassingEvidence,
    totalFailingEvidence,
  };
}
