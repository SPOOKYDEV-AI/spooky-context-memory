import { clonePlainData } from "../utils/clone-plain-data.js";
import { uniqueNormalizedStrings } from "../utils/normalized-set.js";
import { stableHash } from "../utils/stable-hash.js";
import type { ContextContract } from "./types.js";

export interface CreateContextContractInput {
  situationId: string;
  initialNeed: string;
  currentGoal: string;
  invariants: string[];
  discriminatingProperties: string[];
  forbiddenEffects: string[];
  acceptanceCriteria: string[];
  acceptedDecisions?: string[];
  rejectedTrajectories?: string[];
  unresolvedQuestions: string[];
  sourceContextIds: string[];
  createdAt: string;
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${field} must not be empty.`);
  }
  return normalized;
}

export function createContextContract(
  input: CreateContextContractInput,
): ContextContract {
  const initialNeed = requireText(input.initialNeed, "initialNeed");
  const currentGoal = requireText(input.currentGoal, "currentGoal");
  const id = `contract-${stableHash({
    situationId: input.situationId,
    initialNeed,
    createdAt: input.createdAt,
  })}`;

  return {
    id,
    version: 1,
    situationId: input.situationId,
    initialNeed,
    currentGoal,
    invariants: uniqueNormalizedStrings(input.invariants),
    discriminatingProperties: uniqueNormalizedStrings(
      input.discriminatingProperties,
    ),
    forbiddenEffects: uniqueNormalizedStrings(input.forbiddenEffects),
    acceptanceCriteria: uniqueNormalizedStrings(input.acceptanceCriteria),
    acceptedDecisions: uniqueNormalizedStrings(input.acceptedDecisions ?? []),
    rejectedTrajectories: uniqueNormalizedStrings(
      input.rejectedTrajectories ?? [],
    ),
    unresolvedQuestions: uniqueNormalizedStrings(input.unresolvedQuestions),
    sourceContextIds: Array.from(new Set(input.sourceContextIds)),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

export interface UpdateContextContractInput {
  currentGoal?: string;
  acceptedDecisions?: string[];
  rejectedTrajectories?: string[];
  unresolvedQuestions?: string[];
  resolvedQuestions?: string[];
  sourceContextIds?: string[];
  updatedAt: string;
}

export function updateContextContract(
  contract: ContextContract,
  input: UpdateContextContractInput,
): ContextContract {
  const next = clonePlainData(contract);

  if (input.currentGoal !== undefined) {
    next.currentGoal = requireText(input.currentGoal, "currentGoal");
  }
  next.acceptedDecisions = uniqueNormalizedStrings([
    ...next.acceptedDecisions,
    ...(input.acceptedDecisions ?? []),
  ]);
  next.rejectedTrajectories = uniqueNormalizedStrings([
    ...next.rejectedTrajectories,
    ...(input.rejectedTrajectories ?? []),
  ]);

  const resolved = new Set(
    (input.resolvedQuestions ?? []).map((value) => value.trim().toLowerCase()),
  );
  next.unresolvedQuestions = uniqueNormalizedStrings([
    ...next.unresolvedQuestions.filter(
      (question) => !resolved.has(question.trim().toLowerCase()),
    ),
    ...(input.unresolvedQuestions ?? []),
  ]);
  next.sourceContextIds = Array.from(
    new Set([...next.sourceContextIds, ...(input.sourceContextIds ?? [])]),
  );
  next.version += 1;
  next.updatedAt = input.updatedAt;

  return next;
}
