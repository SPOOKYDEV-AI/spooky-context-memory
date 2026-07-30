import type { MemoryScope } from "../domain/types.js";
import type { ValidationEvidence } from "../capsules/types.js";

export type OutcomeVerdict =
  | "accepted"
  | "rejected"
  | "partially_accepted"
  | "unknown";

export interface UserRequestSnapshot {
  rawText?: string;
  interpretedIntent: string;
  target: string;
  expectedOutcome: string;
  constraints: string[];
  forbiddenEffects: string[];
  environment: Record<string, string>;
}

export interface ResultFingerprint {
  summary: string;
  properties: Record<string, unknown>;
  artifactIds: string[];
}

export interface InteractionAttempt {
  id: string;
  interpretation: string;
  actions: string[];
  result: ResultFingerprint;
  userVerdict: OutcomeVerdict;
  technicalEvidence: ValidationEvidence[];
  createdAt: string;
  decisionTags?: string[];
  experienceUnitId?: string;
}

export interface InteractionEpisode {
  id: string;
  scope: MemoryScope;
  initialRequest: UserRequestSnapshot;
  attempts: InteractionAttempt[];
  startedAt: string;
  completedAt?: string;
}

export interface EpisodeAnalysis {
  episodeId: string;
  acceptedAttemptIds: string[];
  rejectedAttemptIds: string[];
  partiallyAcceptedAttemptIds: string[];
  unknownAttemptIds: string[];
  latestAcceptedAttemptId: string | null;
  hasOutcomeContrast: boolean;
  totalPassingEvidence: number;
  totalFailingEvidence: number;
}

export interface PropertyDifference {
  propertyPath: string;
  rejectedValue: unknown;
  acceptedValue: unknown;
  rejectedAttemptId: string;
  acceptedAttemptId: string;
}

export interface InferredDiscriminatingProperty {
  propertyPath: string;
  acceptedValue: unknown;
  confidence: number;
  supportingAttemptIds: string[];
  contradictingAttemptIds: string[];
  status: "candidate" | "supported";
}

export interface EpisodeContrast {
  episodeId: string;
  acceptedAttemptId: string | null;
  rejectedAttemptIds: string[];
  differences: PropertyDifference[];
  inferredDiscriminators: InferredDiscriminatingProperty[];
  unresolvedReasons: string[];
}
