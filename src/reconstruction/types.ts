import type { ExperienceCapsule } from "../capsules/types.js";
import type { ContextFrame, ContextTransition } from "../contexts/types.js";
import type { TaskSignature } from "../domain/types.js";
import type { ExperiencePattern } from "../patterns/types.js";

export interface ReconstructionCapsuleInput {
  capsule: ExperienceCapsule;
  applicabilityConfidence: number;
}

export interface ReconstructionPatternInput {
  pattern: ExperiencePattern;
  confidence: number;
}

export interface ReconstructMemoryInput {
  task: TaskSignature;
  contexts: ContextFrame[];
  transitions: ContextTransition[];
  capsuleInputs: ReconstructionCapsuleInput[];
  patternInputs: ReconstructionPatternInput[];
  fromContextId?: string;
  toContextId?: string;
  maxItemsPerSection?: number;
  maxCharacters?: number;
}

export interface ReconstructedMemoryContext {
  currentNeed: string;
  reactivatedContextIds: string[];
  mustPreserve: string[];
  historicalWarnings: string[];
  priorRejectedTrajectories: string[];
  relevantDecisions: string[];
  transitionPath: string[];
  unresolvedUnknowns: string[];
  provenance: {
    capsuleIds: string[];
    patternIds: string[];
    contextIds: string[];
    transitionIds: string[];
  };
  compiledText: string;
}
