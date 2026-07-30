import { clonePlainData } from "../utils/clone-plain-data.js";
import { stableHash } from "../utils/stable-hash.js";
import type { CausalSignature, ExperiencePattern } from "./types.js";

export interface CreatePatternCandidateOptions {
  id?: string;
  name: string;
  confidence?: number;
  checks?: string[];
  mustPreserve?: string[];
  questionsToResolve?: string[];
  prohibitedShortcuts?: string[];
}

function clamp(value: number | undefined): number {
  return Math.max(0, Math.min(1, value ?? 0.4));
}

export function createPatternCandidate(
  signature: CausalSignature,
  options: CreatePatternCandidateOptions,
): ExperiencePattern {
  const name = options.name.trim();

  if (name.length === 0) {
    throw new Error("Pattern name must not be empty.");
  }

  return {
    id: options.id?.trim() || `pattern-${stableHash({ name, signature })}`,
    version: 1,
    name,
    prototype: clonePlainData(signature),
    prevention: {
      checks: [...(options.checks ?? [])],
      mustPreserve: [...(options.mustPreserve ?? [])],
      questionsToResolve: [...(options.questionsToResolve ?? [])],
      prohibitedShortcuts: [...(options.prohibitedShortcuts ?? [])],
    },
    contexts: [],
    relations: [],
    support: {
      totalEpisodes: 0,
      independentProjects: 0,
      independentWorkflows: 0,
      independentEnvironments: 0,
      supportingCapsuleIds: [],
      contradictingCapsuleIds: [],
    },
    confidence: clamp(options.confidence),
    lifecycle: {
      status: "hypothesis",
      supersededBy: null,
    },
  };
}
