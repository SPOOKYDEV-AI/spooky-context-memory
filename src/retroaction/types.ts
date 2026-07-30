import type {
  AttentionCandidate,
  AttentionFeedback,
  MemoryAttentionField,
} from "../attention/types.js";
import type { ContextField } from "../contexts/types.js";
import type { EpistemicCore } from "../epistemic/types.js";
import type {
  CapsuleRefinementPlan,
  MemoryLinkObservation,
  PlasticMemoryGraph,
  PlasticityUpdateResult,
} from "../plasticity/types.js";
import type {
  AttentionViewVerdict,
  CrossViewTriageResult,
  RejectedViewLedger,
} from "../views/types.js";

export interface ViewOutcomeFeedback {
  id: string;
  viewId: string;
  verdict: AttentionViewVerdict;
  expectedOutcome: string;
  actualOutcome: string;
  confidence: number;
  independenceKey: string;
  contextFingerprint: string;
  discriminators: string[];
  revisitConditions: string[];
  capsuleIds: string[];
  linkObservations: MemoryLinkObservation[];
  observedAt: string;
}

export interface ApplyRetroactiveLearningInput {
  attentionField: MemoryAttentionField;
  contextField: ContextField;
  epistemicCore: EpistemicCore;
  memoryRevision: number;
  triage: CrossViewTriageResult;
  rejectedViewLedger: RejectedViewLedger;
  plasticMemoryGraph: PlasticMemoryGraph;
  outcome: ViewOutcomeFeedback;
}

export interface RetroactiveLearningSignals {
  attentionFeedback: AttentionFeedback[];
  newAttentionCandidates: AttentionCandidate[];
  invalidatedViewIds: string[];
  reconsideredViewIds: string[];
  generatedDiscriminators: string[];
}

export interface ApplyRetroactiveLearningResult {
  attentionField: MemoryAttentionField;
  rejectedViewLedger: RejectedViewLedger;
  plasticity: PlasticityUpdateResult;
  capsuleRefinementPlans: CapsuleRefinementPlan[];
  signals: RetroactiveLearningSignals;
}
