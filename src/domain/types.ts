export type MemoryNodeType =
  | "namespace"
  | "project"
  | "workflow"
  | "topic"
  | "fact"
  | "decision"
  | "procedure"
  | "incident"
  | "artifact"
  | "summary"
  | "hypothesis"
  | "episode"
  | "capsule"
  | "pattern"
  | "context"
  | "transition"
  | "situation"
  | "accumulator"
  | "reconstruction"
  | "vision"
  | "vision_ensemble"
  | "vision_checkpoint"
  | "truth_anchor"
  | "attention_field"
  | "attention_focus"
  | "attention_view"
  | "rejected_view_trace"
  | "plastic_memory_link"
  | "equilibrium_snapshot"
  | "retroaction_event"
  | "global_understanding"
  | "understanding_model"
  | "semantic_backbone"
  | "cognitive_trajectory"
  | "reflective_capsule"
  | "cognitive_policy"
  | "cognitive_habit"
  | "habit_inhibition"
  | "habit_recovery"
  | "counterfactual_view"
  | "unlearning_event"
  | "relearning_plan"
  | "durable_memory_state"
  | "event_journal"
  | "memory_snapshot"
  | "schema_migration"
  | "persistence_recovery";

export type MemoryNodeStatus =
  | "active"
  | "superseded"
  | "deprecated"
  | "quarantined";

export type MemoryLinkType =
  | "uses"
  | "depends_on"
  | "derived_from"
  | "supersedes"
  | "contradicts"
  | "related_to"
  | "validated_by"
  | "instance_of"
  | "extends"
  | "narrows"
  | "duplicates"
  | "flows_to"
  | "protects"
  | "compacted_into"
  | "reactivated_by"
  | "belongs_to_situation"
  | "accumulated_into"
  | "reconstructed_from"
  | "split_into"
  | "merged_into"
  | "checkpointed_at"
  | "backtracked_to"
  | "attends_to"
  | "generates_view"
  | "constrained_by_truth"
  | "challenges"
  | "rejected_as"
  | "revisitable_when"
  | "reinforces"
  | "refines"
  | "invalidates"
  | "stabilizes"
  | "revises"
  | "reflects_on"
  | "forms_habit"
  | "inhibits"
  | "reactivates"
  | "learns_from_view"
  | "constrained_by_understanding"
  | "counterfactual_to"
  | "transfers_into"
  | "persisted_as"
  | "replayed_from"
  | "migrated_from"
  | "recovered_from";

export type SourceType =
  | "user"
  | "repository"
  | "tool"
  | "test"
  | "agent"
  | "documentation"
  | "conversation";

export interface MemoryScope {
  userId?: string;
  projectId?: string;
  workflowId?: string;
  sessionId?: string;
  taskId?: string;
  environment?: Record<string, string>;
}

export interface MemoryNode {
  id: string;
  parentId: string | null;
  path: string;
  type: MemoryNodeType;
  status: MemoryNodeStatus;
  title: string;
  summary: string;
  content?: string;
  scope: MemoryScope;
  metadata: {
    confidence: number;
    sourceTrust: number;
    createdAt: string;
    updatedAt: string;
    validUntil?: string;
  };
  provenance: {
    sourceType: SourceType;
    sourceId?: string;
    createdBy: string;
  };
}

export interface MemoryLink {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: MemoryLinkType;
  weight: number;
}

export interface TraversalPolicy {
  maxNodes: number;
  maxDepth: number;
  minimumScore: number;
  allowedPathPrefixes: string[];
  deniedPathPrefixes: string[];
  allowedLinkTypes: MemoryLinkType[];
}

export interface RetrievalRequest {
  query: string;
  anchorNodeIds: string[];
  currentScope: MemoryScope;
  traversal: TraversalPolicy;
  semanticScores?: Readonly<Record<string, number>>;
  now?: string;
}

export interface RetrievalScore {
  semanticRelevance: number;
  scopeMatch: number;
  pathProximity: number;
  confidence: number;
  freshness: number;
  sourceTrust: number;
  contaminationPenalty: number;
  total: number;
}

export interface RetrievedMemory {
  node: MemoryNode;
  depth: number;
  score: RetrievalScore;
  reachedThrough?: MemoryLinkType | "parent" | "child" | "anchor";
}

export interface RetrievalResult {
  nodes: RetrievedMemory[];
  rejectedNodeIds: string[];
}

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "exists"
  | "greater_than"
  | "matches";

export interface Condition {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
}

export interface TaskSignature {
  intent: string;
  target: string;
  projectId?: string;
  workflowId?: string;
  expectedOutcome: string;
  operations: string[];
  constraints: string[];
  forbiddenEffects: string[];
  environment?: Record<string, string>;
  observedSymptoms?: string[];
}

export interface IncidentMemory {
  id: string;
  originalTask: TaskSignature;
  triggerConditions: {
    required: Condition[];
    optional: Condition[];
    absent: Condition[];
  };
  symptoms: string[];
  rootCause: string;
  failedAttempts: string[];
  resolution: {
    description: string;
    preserves: string[];
    introduces: string[];
    risks: string[];
  };
  applicability: {
    appliesWhen: Condition[];
    doesNotApplyWhen: Condition[];
    unknownWhen: Condition[];
  };
  validationEvidence: string[];
  status:
    | "observed"
    | "diagnosed"
    | "resolved"
    | "partially_resolved"
    | "not_reproducible"
    | "obsolete";
}

export type IncidentUsage =
  | "applicable"
  | "diagnostic_reference"
  | "out_of_scope";

export interface IncidentMatch {
  usage: IncidentUsage;
  score: number;
  reasons: string[];
  failedRequirements: string[];
  activeExclusions: string[];
}
