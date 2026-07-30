export type PatternLifecycleStatus =
  | "hypothesis"
  | "candidate"
  | "active"
  | "disputed"
  | "narrowed"
  | "superseded";

export interface CausalSignature {
  reasoningFailures: string[];
  triggeringSignals: string[];
  lostOrRequiredConstraints: string[];
  predictedConsequences: string[];
  resolutionPrinciples: string[];
  scopeKeys: string[];
}

export interface PatternContextEvidence {
  capsuleId: string;
  projectId?: string;
  workflowId?: string;
  environmentKey: string;
  confidence: number;
}

export interface PatternSupport {
  totalEpisodes: number;
  independentProjects: number;
  independentWorkflows: number;
  independentEnvironments: number;
  supportingCapsuleIds: string[];
  contradictingCapsuleIds: string[];
}

export type PatternRelationType =
  | "derived_from"
  | "extends"
  | "narrows"
  | "supersedes"
  | "contradicts"
  | "duplicates";

export interface PatternRelationRecord {
  type: PatternRelationType;
  patternId: string;
  reason: string;
}

export interface ExperiencePattern {
  id: string;
  version: number;
  name: string;
  prototype: CausalSignature;
  prevention: {
    checks: string[];
    mustPreserve: string[];
    questionsToResolve: string[];
    prohibitedShortcuts: string[];
  };
  contexts: PatternContextEvidence[];
  relations: PatternRelationRecord[];
  support: PatternSupport;
  confidence: number;
  lifecycle: {
    status: PatternLifecycleStatus;
    supersededBy: string | null;
  };
}

export type PatternRelationship =
  | "duplicate"
  | "instance_of_pattern"
  | "extends"
  | "narrows"
  | "contradicts"
  | "new_pattern";

export interface PatternMatch {
  patternId: string | null;
  relationship: PatternRelationship;
  score: number;
  componentScores: {
    reasoning: number;
    triggers: number;
    constraints: number;
    consequences: number;
    resolution: number;
    scope: number;
  };
  reasons: string[];
}
