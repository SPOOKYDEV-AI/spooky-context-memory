import type { CompleteAdaptiveMemoryEvolutionResult } from "../orchestration/adaptive-memory-evolution-cycle.js";
import { clonePlainData } from "../utils/clone-plain-data.js";
import { normalizeCanonicalJson } from "./canonical-json.js";
import { GENESIS_EVENT_HASH } from "./checksums.js";
import { PersistenceMigrationRegistry } from "./migrations.js";
import { replayMemoryStream } from "./replay.js";
import { isCanonicalUtcTimestamp } from "./timestamps.js";
import type {
  AdaptiveMemoryDomainEvent,
  AdaptiveMemoryDurableState,
  AdaptiveMemoryPersistencePolicy,
  EventJournal,
  MemorySnapshot,
  PersistedMemoryEvent,
  ProjectedMemoryEvent,
  SnapshotStore,
  UncommittedMemoryEvent,
} from "./types.js";

export const DEFAULT_ADAPTIVE_MEMORY_PERSISTENCE_POLICY: AdaptiveMemoryPersistencePolicy = {
  schemaVersion: 1,
  snapshotEveryEvents: 50,
  maximumSnapshots: 4,
  classification: "private",
};

export type AdaptiveMemoryPersistencePolicyOverrides =
  Partial<AdaptiveMemoryPersistencePolicy>;

export interface CommitAdaptiveCycleInput {
  result: CompleteAdaptiveMemoryEvolutionResult;
  memoryRevision: number;
  contextFingerprint: string;
  outcomeId: string;
  trajectoryId: string;
  occurredAt: string;
  actor?: string;
  correlationId?: string;
  causationId?: string;
  expectedSequence?: number;
}

export interface PersistentAdaptiveMemoryOptions {
  streamId: string;
  journal: EventJournal;
  snapshots: SnapshotStore;
  migrations?: PersistenceMigrationRegistry;
  policy?: AdaptiveMemoryPersistencePolicyOverrides;
}

export interface PersistentAdaptiveMemoryCommitResult {
  events: PersistedMemoryEvent[];
  state: AdaptiveMemoryDurableState;
  snapshot: MemorySnapshot<AdaptiveMemoryDurableState> | null;
}

function normalizedPolicy(
  overrides: AdaptiveMemoryPersistencePolicyOverrides = {},
): AdaptiveMemoryPersistencePolicy {
  const policy = {
    ...DEFAULT_ADAPTIVE_MEMORY_PERSISTENCE_POLICY,
    ...overrides,
  };
  if (!Number.isSafeInteger(policy.schemaVersion) || policy.schemaVersion < 1) {
    throw new Error("Persistence schema version must be a positive integer.");
  }
  if (
    !Number.isSafeInteger(policy.snapshotEveryEvents) ||
    policy.snapshotEveryEvents < 1
  ) {
    throw new Error("snapshotEveryEvents must be a positive integer.");
  }
  if (
    !Number.isSafeInteger(policy.maximumSnapshots) ||
    policy.maximumSnapshots < 1
  ) {
    throw new Error("maximumSnapshots must be a positive integer.");
  }
  return policy;
}

function upsertById<T extends { id: string }>(values: T[], value: T): T[] {
  return [...values.filter((candidate) => candidate.id !== value.id), clonePlainData(value)]
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function createEmptyAdaptiveMemoryDurableState(
  createdAt = "1970-01-01T00:00:00.000Z",
): AdaptiveMemoryDurableState {
  return {
    revision: 0,
    memoryRevision: 0,
    nodes: [],
    links: [],
    globalUnderstanding: null,
    reflectiveMemory: null,
    adaptiveUnlearning: null,
    lastContextFingerprint: null,
    lastOutcomeId: null,
    updatedAt: createdAt,
  };
}

export function validateAdaptiveMemoryDurableState(
  state: AdaptiveMemoryDurableState,
): void {
  if (!Number.isSafeInteger(state.revision) || state.revision < 0) {
    throw new Error("Durable state revision must be a non-negative integer.");
  }
  if (!Number.isSafeInteger(state.memoryRevision) || state.memoryRevision < 0) {
    throw new Error("Durable memory revision must be a non-negative integer.");
  }
  if (
    typeof state.updatedAt !== "string" ||
    !isCanonicalUtcTimestamp(state.updatedAt)
  ) {
    throw new Error("Durable state updatedAt must be a valid timestamp.");
  }
  const nodeIds = new Set<string>();
  for (const node of state.nodes) {
    if (node.id.trim().length === 0) {
      throw new Error("Durable memory node id cannot be empty.");
    }
    if (nodeIds.has(node.id)) {
      throw new Error(`Duplicate durable memory node "${node.id}".`);
    }
    nodeIds.add(node.id);
  }
  for (const node of state.nodes) {
    if (!node.path.startsWith("/")) {
      throw new Error(`Durable memory node "${node.id}" must use an absolute path.`);
    }
    if (node.parentId !== null && !nodeIds.has(node.parentId)) {
      throw new Error(
        `Durable memory node "${node.id}" references unknown parent "${node.parentId}".`,
      );
    }
  }
  const parents = new Map(
    state.nodes.map((node) => [node.id, node.parentId] as const),
  );
  for (const node of state.nodes) {
    const visited = new Set<string>([node.id]);
    let parentId = node.parentId;
    while (parentId !== null) {
      if (visited.has(parentId)) {
        throw new Error(`Durable memory parent cycle detected at "${parentId}".`);
      }
      visited.add(parentId);
      parentId = parents.get(parentId) ?? null;
    }
  }
  const linkIds = new Set<string>();
  for (const link of state.links) {
    if (link.id.trim().length === 0) {
      throw new Error("Durable memory link id cannot be empty.");
    }
    if (linkIds.has(link.id)) {
      throw new Error(`Duplicate durable memory link "${link.id}".`);
    }
    linkIds.add(link.id);
    if (!nodeIds.has(link.sourceNodeId) || !nodeIds.has(link.targetNodeId)) {
      throw new Error(
        `Durable memory link "${link.id}" references an unknown node.`,
      );
    }
    if (!Number.isFinite(link.weight)) {
      throw new Error(`Durable memory link "${link.id}" has invalid weight.`);
    }
  }
}

export function reduceAdaptiveMemoryEvent(
  state: AdaptiveMemoryDurableState,
  event: ProjectedMemoryEvent,
): AdaptiveMemoryDurableState {
  const next = clonePlainData(state);
  const domainEvent = {
    type: event.source.type,
    payload: event.payload,
  } as AdaptiveMemoryDomainEvent;
  switch (domainEvent.type) {
    case "memory.node_upserted":
      next.nodes = upsertById(next.nodes, domainEvent.payload.node);
      break;
    case "memory.node_removed":
      next.nodes = next.nodes.filter(
        (node) => node.id !== domainEvent.payload.nodeId,
      );
      next.links = next.links.filter(
        (link) =>
          link.sourceNodeId !== domainEvent.payload.nodeId &&
          link.targetNodeId !== domainEvent.payload.nodeId,
      );
      break;
    case "memory.link_upserted":
      next.links = upsertById(next.links, domainEvent.payload.link);
      break;
    case "memory.link_removed":
      next.links = next.links.filter(
        (link) => link.id !== domainEvent.payload.linkId,
      );
      break;
    case "adaptive.cycle_committed":
      next.memoryRevision = domainEvent.payload.memoryRevision;
      next.globalUnderstanding = clonePlainData(
        domainEvent.payload.globalUnderstanding,
      );
      next.reflectiveMemory = clonePlainData(
        domainEvent.payload.reflectiveMemory,
      );
      next.adaptiveUnlearning = clonePlainData(
        domainEvent.payload.adaptiveUnlearning,
      );
      next.lastContextFingerprint = domainEvent.payload.contextFingerprint;
      next.lastOutcomeId = domainEvent.payload.outcomeId;
      break;
    case "adaptive.state_imported": {
      const imported = clonePlainData(domainEvent.payload.state);
      imported.revision = event.source.sequence;
      imported.updatedAt = event.source.occurredAt;
      validateAdaptiveMemoryDurableState(imported);
      return imported;
    }
    default: {
      const exhaustive: never = domainEvent;
      throw new Error(
        `Unsupported adaptive-memory event: ${JSON.stringify(exhaustive)}`,
      );
    }
  }
  next.revision = event.source.sequence;
  next.updatedAt = event.source.occurredAt;
  validateAdaptiveMemoryDurableState(next);
  return next;
}

export function buildAdaptiveCycleCommittedEvent(
  input: CommitAdaptiveCycleInput,
  schemaVersion: number,
  classification: AdaptiveMemoryPersistencePolicy["classification"],
): UncommittedMemoryEvent<
  "adaptive.cycle_committed",
  Extract<AdaptiveMemoryDomainEvent, { type: "adaptive.cycle_committed" }>["payload"]
> {
  return {
    type: "adaptive.cycle_committed",
    schemaVersion,
    occurredAt: input.occurredAt,
    ...(input.actor === undefined ? {} : { actor: input.actor }),
    ...(input.correlationId === undefined
      ? {}
      : { correlationId: input.correlationId }),
    ...(input.causationId === undefined
      ? {}
      : { causationId: input.causationId }),
    contextFingerprint: input.contextFingerprint,
    classification,
    payload: {
      memoryRevision: input.memoryRevision,
      globalUnderstanding: clonePlainData(input.result.globalUnderstanding),
      reflectiveMemory: clonePlainData(input.result.reflectiveMemory),
      adaptiveUnlearning: clonePlainData(input.result.adaptiveUnlearning),
      contextFingerprint: input.contextFingerprint,
      outcomeId: input.outcomeId,
      trajectoryId: input.trajectoryId,
      globalRevisionAction: input.result.globalRevisionDecision.action,
      unlearningDecisionId: input.result.unlearningDecision?.id ?? null,
    },
  };
}

export class PersistentAdaptiveMemory {
  private readonly streamId: string;
  private readonly journal: EventJournal;
  private readonly snapshots: SnapshotStore;
  private readonly migrations: PersistenceMigrationRegistry;
  private readonly policy: AdaptiveMemoryPersistencePolicy;

  public constructor(options: PersistentAdaptiveMemoryOptions) {
    if (options.streamId.trim().length === 0) {
      throw new Error("Persistent adaptive-memory stream id cannot be empty.");
    }
    this.streamId = options.streamId;
    this.journal = options.journal;
    this.snapshots = options.snapshots;
    this.migrations = options.migrations ?? new PersistenceMigrationRegistry();
    this.policy = normalizedPolicy(options.policy);
  }

  public async hydrate(): Promise<{
    state: AdaptiveMemoryDurableState;
    sequence: number;
    eventHash: string;
    replayedEventCount: number;
    snapshotId: string | null;
  }> {
    const replay = await replayMemoryStream({
      streamId: this.streamId,
      journal: this.journal,
      snapshots: this.snapshots,
      targetSchemaVersion: this.policy.schemaVersion,
      initialState: createEmptyAdaptiveMemoryDurableState(),
      reducer: reduceAdaptiveMemoryEvent,
      migrateEvent: (event, targetVersion) =>
        this.migrations.projectEvent(event, targetVersion),
      migrateSnapshot: (snapshot, targetVersion) =>
        this.migrations.projectSnapshot<AdaptiveMemoryDurableState>(
          snapshot,
          targetVersion,
        ),
      validateState: validateAdaptiveMemoryDurableState,
    });
    return {
      state: replay.state,
      sequence: replay.finalSequence,
      eventHash: replay.finalEventHash,
      replayedEventCount: replay.replayedEventCount,
      snapshotId: replay.usedSnapshotId,
    };
  }

  public async append(
    events: ReadonlyArray<UncommittedMemoryEvent>,
    expectedSequence?: number,
  ): Promise<PersistentAdaptiveMemoryCommitResult> {
    const before = await this.hydrate();
    if (
      expectedSequence !== undefined &&
      expectedSequence !== before.sequence
    ) {
      throw new Error(
        `Optimistic concurrency conflict for stream "${this.streamId}": expected sequence ${expectedSequence}, actual ${before.sequence}.`,
      );
    }

    let candidateState = clonePlainData(before.state);
    for (const [index, event] of events.entries()) {
      const normalized = normalizeCanonicalJson(event) as unknown as UncommittedMemoryEvent;
      const source: PersistedMemoryEvent = {
        ...normalized,
        eventId: `evt_${"0".repeat(32)}`,
        streamId: this.streamId,
        sequence: before.sequence + index + 1,
        recordedAt: normalized.occurredAt,
        previousHash: GENESIS_EVENT_HASH,
        payloadHash: "0".repeat(64),
        eventHash: "0".repeat(64),
      };
      const projected = this.migrations.projectEvent(
        source,
        this.policy.schemaVersion,
      );
      candidateState = reduceAdaptiveMemoryEvent(candidateState, projected);
    }
    validateAdaptiveMemoryDurableState(candidateState);

    const persisted = await this.journal.append(this.streamId, events, {
      expectedSequence: before.sequence,
    });
    const hydrated = await this.hydrate();
    const snapshot = await this.maybeCheckpoint(
      hydrated.state,
      hydrated.sequence,
      hydrated.eventHash,
    );
    return {
      events: persisted,
      state: hydrated.state,
      snapshot,
    };
  }

  public async commitAdaptiveCycle(
    input: CommitAdaptiveCycleInput,
  ): Promise<PersistentAdaptiveMemoryCommitResult> {
    return this.append(
      [
        buildAdaptiveCycleCommittedEvent(
          input,
          this.policy.schemaVersion,
          this.policy.classification,
        ),
      ],
      input.expectedSequence,
    );
  }

  public async checkpoint(): Promise<MemorySnapshot<AdaptiveMemoryDurableState>> {
    const hydrated = await this.hydrate();
    return this.saveSnapshot(
      hydrated.state,
      hydrated.sequence,
      hydrated.eventHash,
    );
  }

  public async importState(
    state: AdaptiveMemoryDurableState,
    occurredAt: string,
    expectedSequence?: number,
  ): Promise<PersistentAdaptiveMemoryCommitResult> {
    validateAdaptiveMemoryDurableState(state);
    return this.append(
      [
        {
          type: "adaptive.state_imported",
          schemaVersion: this.policy.schemaVersion,
          occurredAt,
          classification: this.policy.classification,
          payload: { state: clonePlainData(state) },
        },
      ],
      expectedSequence,
    );
  }

  private async maybeCheckpoint(
    state: AdaptiveMemoryDurableState,
    sequence: number,
    eventHash: string,
  ): Promise<MemorySnapshot<AdaptiveMemoryDurableState> | null> {
    if (sequence === 0) {
      return null;
    }
    const latestSnapshot = await this.snapshots.loadLatest(this.streamId);
    const latestSnapshotSequence = latestSnapshot?.sequence ?? 0;
    if (
      sequence - latestSnapshotSequence < this.policy.snapshotEveryEvents
    ) {
      return null;
    }
    return this.saveSnapshot(state, sequence, eventHash);
  }

  private async saveSnapshot(
    state: AdaptiveMemoryDurableState,
    sequence: number,
    eventHash: string,
  ): Promise<MemorySnapshot<AdaptiveMemoryDurableState>> {
    const snapshot = await this.snapshots.save({
      streamId: this.streamId,
      sequence,
      eventHash: sequence === 0 ? GENESIS_EVENT_HASH : eventHash,
      schemaVersion: this.policy.schemaVersion,
      state,
      createdAt: state.updatedAt,
    });
    await this.snapshots.prune(this.streamId, this.policy.maximumSnapshots);
    return snapshot;
  }
}
