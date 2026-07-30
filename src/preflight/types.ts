import type { ExperienceCapsule } from "../capsules/types.js";
import type { TaskSignature } from "../domain/types.js";
import type { ExperiencePattern } from "../patterns/types.js";

export type KnowledgeState = "known" | "partially_known" | "unknown";

export type PreflightUsage =
  | "applicable"
  | "preventive"
  | "diagnostic_reference";

export interface PreflightCapsuleInput {
  capsule: ExperienceCapsule;
  usage: PreflightUsage;
  applicabilityConfidence: number;
}

export interface PreflightPatternInput {
  pattern: ExperiencePattern;
  confidence: number;
}

export interface BuildPreflightInput {
  task: TaskSignature;
  capsules: PreflightCapsuleInput[];
  patterns: PreflightPatternInput[];
  prunedApproaches?: string[];
  unresolvedUnknowns?: string[];
  maxItemsPerSection?: number;
}

export interface MemoryPreflight {
  knowledgeState: KnowledgeState;
  mustPreserve: string[];
  knownFailureModes: string[];
  prunedApproaches: string[];
  verifyBeforeActing: string[];
  unresolvedUnknowns: string[];
  sourceCapsuleIds: string[];
  sourcePatternIds: string[];
}

export interface CompilePreflightOptions {
  maxCharacters?: number;
  heading?: string;
}
