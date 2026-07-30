import {
  advanceMemoryAttentionField,
  createMemoryAttentionField,
} from "../attention/attention-field.js";
import type {
  AttentionCandidate,
  AttentionFeedback,
  AttentionPortfolioPolicyOverrides,
  MemoryAttentionField,
} from "../attention/types.js";
import type { ContextField } from "../contexts/types.js";
import type { MemoryScope, TaskSignature } from "../domain/types.js";
import { evaluateDynamicEquilibrium } from "../equilibrium/dynamic-equilibrium-controller.js";
import type {
  DynamicEquilibriumPolicyOverrides,
  DynamicEquilibriumResult,
  EquilibriumObservation,
  EquilibriumSnapshot,
} from "../equilibrium/types.js";
import type { EpistemicCore } from "../epistemic/types.js";
import {
  generateAndTriageAttentionViews,
} from "../views/cross-view-triage.js";
import { attentionViewSignature } from "../views/attention-view-generator.js";
import { canRevisitRejectedView } from "../views/rejected-view-ledger.js";
import type {
  AttentionViewEvidence,
  AttentionViewProposal,
  CrossViewTriageResult,
  RejectedViewLedger,
  ViewTriagePolicyOverrides,
} from "../views/types.js";
import type { VisionBranchCandidate } from "../visions/types.js";

export interface RunAttentionDrivenMemoryCycleInput {
  task: TaskSignature;
  scope: MemoryScope;
  contextField: ContextField;
  epistemicCore: EpistemicCore;
  memoryRevision: number;
  previousAttentionField?: MemoryAttentionField;
  attentionCandidates: AttentionCandidate[];
  attentionFeedback?: AttentionFeedback[];
  viewProposals: AttentionViewProposal[];
  viewEvidence?: AttentionViewEvidence[];
  branches: VisionBranchCandidate[];
  rejectedViewLedger?: RejectedViewLedger;
  contextFingerprint?: string;
  satisfiedRevisitConditions?: string[];
  equilibriumObservation: EquilibriumObservation;
  previousEquilibriumSnapshot?: EquilibriumSnapshot;
  attentionPolicy?: AttentionPortfolioPolicyOverrides;
  viewPolicy?: ViewTriagePolicyOverrides;
  equilibriumPolicy?: DynamicEquilibriumPolicyOverrides;
  now?: string;
}

export interface AttentionDrivenMemoryCycleResult {
  attentionField: MemoryAttentionField;
  triage: CrossViewTriageResult;
  equilibrium: DynamicEquilibriumResult;
  blockedProposalIds: string[];
}

export function runAttentionDrivenMemoryCycle(
  input: RunAttentionDrivenMemoryCycleInput,
): AttentionDrivenMemoryCycleResult {
  const now = input.now ?? input.contextField.updatedAt;
  const attentionField =
    input.previousAttentionField === undefined
      ? createMemoryAttentionField({
          contextField: input.contextField,
          epistemicCore: input.epistemicCore,
          memoryRevision: input.memoryRevision,
          candidates: input.attentionCandidates,
          ...(input.attentionPolicy === undefined ? {} : { policy: input.attentionPolicy }),
          createdAt: now,
        })
      : advanceMemoryAttentionField({
          previous: input.previousAttentionField,
          contextField: input.contextField,
          epistemicCore: input.epistemicCore,
          memoryRevision: input.memoryRevision,
          candidates: input.attentionCandidates,
          feedback: input.attentionFeedback ?? [],
          updatedAt: now,
        }).field;
  const blockedProposalIds: string[] = [];
  const proposals = input.viewProposals.filter((proposal) => {
    if (
      input.rejectedViewLedger === undefined ||
      input.contextFingerprint === undefined
    ) {
      return true;
    }
    const decision = canRevisitRejectedView({
      ledger: input.rejectedViewLedger,
      signature: attentionViewSignature(proposal),
      contextFingerprint: input.contextFingerprint,
      satisfiedConditions: input.satisfiedRevisitConditions ?? [],
    });
    if (!decision.allowed) {
      blockedProposalIds.push(proposal.id);
    }
    return decision.allowed;
  });
  const triage = generateAndTriageAttentionViews({
    task: input.task,
    scope: input.scope,
    attentionField,
    epistemicCore: input.epistemicCore,
    branches: input.branches,
    proposals,
    ...(input.viewEvidence === undefined ? {} : { evidence: input.viewEvidence }),
    ...(input.viewPolicy === undefined ? {} : { policy: input.viewPolicy }),
    generatedAt: now,
  });
  const equilibrium = evaluateDynamicEquilibrium({
    attentionField,
    triage,
    observation: input.equilibriumObservation,
    ...(input.previousEquilibriumSnapshot === undefined
      ? {}
      : { previousSnapshot: input.previousEquilibriumSnapshot }),
    ...(input.equilibriumPolicy === undefined
      ? {}
      : { policy: input.equilibriumPolicy }),
    evaluatedAt: now,
  });
  return { attentionField, triage, equilibrium, blockedProposalIds };
}
