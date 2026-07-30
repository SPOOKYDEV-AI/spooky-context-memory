import type { EpisodeAnalysis, EpisodeContrast } from "../episodes/types.js";
import type { MemoryClaim } from "../claims/types.js";

export type AdmissionDecision =
  | "create_candidate"
  | "extend_existing"
  | "keep_raw_trace"
  | "request_more_evidence"
  | "reject";

export interface CapsuleAdmissionInput {
  analysis: EpisodeAnalysis;
  contrast: EpisodeContrast;
  claims: MemoryClaim[];
  matchingPatternId?: string;
}

export interface CapsuleAdmissionScores {
  reusableValue: number;
  diagnosticValue: number;
  evidenceQuality: number;
  contextCompleteness: number;
  contaminationRisk: number;
  total: number;
}

export interface CapsuleAdmissionAssessment {
  decision: AdmissionDecision;
  scores: CapsuleAdmissionScores;
  reasons: string[];
  matchingPatternId: string | null;
}
