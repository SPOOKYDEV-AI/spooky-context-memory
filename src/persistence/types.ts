import type { MemoryLink, MemoryNode } from "../domain/types.js";
import type { ReflectiveMemoryState } from "../reflection/types.js";
import type { GlobalUnderstandingState } from "../understanding/types.js";
import type { AdaptiveUnlearningState } from "../unlearning/types.js";

export type PersistenceDataClassification =
  | "public"
  | "private"
  | "restricted";

export interface UncommittedMemoryEvent<
  TType extends string = string,
  TPayload = unknown,
> {
  type: TType;
  payload: TPayload;
  schemaVersion: number;
  occurredAt: string;
  actor?: string;
  causationId?: string;
  correlationId?: string;
  contextFingerprint?: string;
  classification?: PersistenceDataClassification;
}

export interface PersistedMemoryEvent<
  TType extends string = string,
  TPayload = unknown,
> extends UncommittedMemoryEvent<TType, TPayload> {
  eventId: string;
  streamId: string;
  sequence: number;
  recordedAt: string;
  previousHash: string;
  payloadHash: string;
  eventHash: string;
}

export interface AppendEventsOptions {
  expectedSequence?: number;
  recordedAt?: string;
}

export interface ReadEventsOptions {
  fromSequence?: number;
  toSequence?: number;
}

export type JournalIntegrityIssueKind =
  | "parse_error"
  | "stream_mismatch"
  | "sequence_gap"
  | "payload_hash_mismatch"
  | "previous_hash_mismatch"
  | "event_hash_mismatch"
  | "unsupported_record";

export interface JournalIntegrityIssue {
  kind: JournalIntegrityIssueKind;
  line: number;
  byteOffset: number;
  sequence: number | null;
  message: string;
  recoverableByTrailingTruncation: boolean;
}

export interface JournalInspection {
  streamId: string;
  events: PersistedMemoryEvent[];
  validThroughSequence: number;
  validThroughHash: string;
  validByteLength: number;
  totalByteLength: number;
  endsWithRecordTerminator?: boolean;
  issue: JournalIntegrityIssue | null;
}

export interface JournalRecoveryResult {
  streamId: string;
  recovered: boolean;
  previousByteLength: number;
  recoveredByteLength: number;
  validThroughSequence: number;
  reason: string;
}

export interface EventJournal {
  append<TType extends string, TPayload>(
    streamId: string,
    events: ReadonlyArray<UncommittedMemoryEvent<TType, TPayload>>,
    options?: AppendEventsOptions,
  ): Promise<PersistedMemoryEvent<TType, TPayload>[]>;
  read(
    streamId: string,
    options?: ReadEventsOptions,
  ): Promise<PersistedMemoryEvent[]>;
  inspect(streamId: string): Promise<JournalInspection>;
}

export interface MemorySnapshot<TState = unknown> {
  snapshotId: string;
  streamId: string;
  sequence: number;
  eventHash: string;
  schemaVersion: number;
  state: TState;
  stateHash: string;
  snapshotHash: string;
  createdAt: string;
}

export interface SaveSnapshotInput<TState> {
  streamId: string;
  sequence: number;
  eventHash: string;
  schemaVersion: number;
  state: TState;
  createdAt?: string;
}

export interface SnapshotInspection {
  snapshotId: string;
  valid: boolean;
  reason: string;
}

export interface SnapshotStore {
  save<TState>(input: SaveSnapshotInput<TState>): Promise<MemorySnapshot<TState>>;
  loadLatest<TState>(streamId: string): Promise<MemorySnapshot<TState> | null>;
  list(streamId: string): Promise<MemorySnapshot[]>;
  inspect(streamId: string): Promise<SnapshotInspection[]>;
  prune(streamId: string, keepLatest: number): Promise<string[]>;
}

export interface ProjectedMemoryEvent<TPayload = unknown> {
  source: PersistedMemoryEvent;
  schemaVersion: number;
  payload: TPayload;
}

export interface ProjectedSnapshot<TState = unknown> {
  source: MemorySnapshot;
  schemaVersion: number;
  state: TState;
}

export interface EventMigration {
  fromVersion: number;
  toVersion: number;
  migrate(payload: unknown): unknown;
}

export interface SnapshotMigration {
  fromVersion: number;
  toVersion: number;
  migrate(state: unknown): unknown;
}

export interface ReplayResult<TState> {
  streamId: string;
  state: TState;
  finalSequence: number;
  finalEventHash: string;
  stateHash: string;
  usedSnapshotId: string | null;
  snapshotSequence: number;
  replayedEventCount: number;
  elapsedMs: number;
}

export interface ReplayOptions<TState> {
  streamId: string;
  journal: EventJournal;
  snapshots?: SnapshotStore;
  targetSchemaVersion: number;
  initialState: TState;
  reducer: (
    state: TState,
    event: ProjectedMemoryEvent,
  ) => TState;
  migrateEvent?: (event: PersistedMemoryEvent, targetVersion: number) => ProjectedMemoryEvent;
  migrateSnapshot?: (
    snapshot: MemorySnapshot,
    targetVersion: number,
  ) => ProjectedSnapshot<TState>;
  validateState?: (state: TState) => void;
}

export interface DeterministicReplayVerification<TState> {
  deterministic: boolean;
  first: ReplayResult<TState>;
  second: ReplayResult<TState>;
  reason: string;
}

export interface AdaptiveMemoryDurableState {
  revision: number;
  memoryRevision: number;
  nodes: MemoryNode[];
  links: MemoryLink[];
  globalUnderstanding: GlobalUnderstandingState | null;
  reflectiveMemory: ReflectiveMemoryState | null;
  adaptiveUnlearning: AdaptiveUnlearningState | null;
  lastContextFingerprint: string | null;
  lastOutcomeId: string | null;
  updatedAt: string;
}

export type AdaptiveMemoryDomainEvent =
  | {
      type: "memory.node_upserted";
      payload: { node: MemoryNode };
    }
  | {
      type: "memory.node_removed";
      payload: { nodeId: string };
    }
  | {
      type: "memory.link_upserted";
      payload: { link: MemoryLink };
    }
  | {
      type: "memory.link_removed";
      payload: { linkId: string };
    }
  | {
      type: "adaptive.cycle_committed";
      payload: {
        memoryRevision: number;
        globalUnderstanding: GlobalUnderstandingState;
        reflectiveMemory: ReflectiveMemoryState;
        adaptiveUnlearning: AdaptiveUnlearningState;
        contextFingerprint: string;
        outcomeId: string;
        trajectoryId: string;
        globalRevisionAction: string;
        unlearningDecisionId: string | null;
      };
    }
  | {
      type: "adaptive.state_imported";
      payload: { state: AdaptiveMemoryDurableState };
    };

export interface AdaptiveMemoryPersistencePolicy {
  schemaVersion: number;
  snapshotEveryEvents: number;
  maximumSnapshots: number;
  classification: PersistenceDataClassification;
}



export interface PersistenceLockMetadata {
  formatVersion: 1;
  streamId: string;
  ownerId: string;
  pid: number;
  hostname: string;
  createdAt: string;
  heartbeatAt: string;
}

export type PersistenceLockStatus =
  | "absent"
  | "active"
  | "orphaned"
  | "expired_unknown_owner"
  | "invalid";

export interface PersistenceLockInspection {
  streamId: string;
  path: string;
  status: PersistenceLockStatus;
  metadata: PersistenceLockMetadata | null;
  ageMs: number | null;
  ownerAlive: boolean | null;
  reason: string;
}

export interface RecoverOrphanedLockOptions {
  confirm: boolean;
  expectedOwnerId?: string;
}

export interface PersistenceLockRecoveryResult {
  streamId: string;
  recovered: boolean;
  previousStatus: PersistenceLockStatus;
  reason: string;
}

export interface BackupFileRecord {
  relativePath: string;
  byteLength: number;
  sha256: string;
}

export interface BackupSnapshotRecord extends BackupFileRecord {
  snapshotId: string;
  sequence: number;
  eventHash: string;
  stateHash: string;
  snapshotHash: string;
}

export interface BackupStreamRecord {
  streamId: string;
  journal: BackupFileRecord | null;
  eventCount: number;
  latestSequence: number;
  latestEventHash: string;
  snapshots: BackupSnapshotRecord[];
}

export interface PersistenceBackupManifest {
  format: "spooky-context-memory-backup";
  formatVersion: 1;
  createdAt: string;
  sourcePackageVersion: string;
  streams: BackupStreamRecord[];
  manifestHash: string;
}

export interface PersistenceBackupVerification {
  valid: boolean;
  manifest: PersistenceBackupManifest | null;
  checkedFileCount: number;
  errors: string[];
  warnings: string[];
}

export type PersistenceOperationalStatus =
  | "healthy"
  | "degraded_but_readable"
  | "recovery_required"
  | "unsafe_to_write"
  | "corrupted";

export interface PersistenceHealthReport {
  streamId: string;
  status: PersistenceOperationalStatus;
  journalIntegrity: "healthy" | "recoverable" | "corrupted";
  deterministicReplay: boolean | null;
  snapshotCoverage: number;
  replayEventCount: number | null;
  staleLockCount: number;
  backupAgeMs?: number;
  recoveryRequired: boolean;
  safeToWrite: boolean;
  blockingReasons: string[];
  warnings: string[];
}

export interface LogicalCompactionPolicy {
  snapshotAfterEvents: number;
  retainSnapshots: number;
  archiveRecommendationAfterEvents: number;
}

export type LogicalCompactionAction =
  | "none"
  | "create_snapshot"
  | "prune_snapshots"
  | "create_snapshot_and_prune"
  | "archive_recommended";

export interface LogicalCompactionPlan {
  streamId: string;
  action: LogicalCompactionAction;
  latestSequence: number;
  latestSnapshotSequence: number;
  eventsAfterSnapshot: number;
  snapshotCount: number;
  retainSnapshots: number;
  physicalDeletionAllowed: false;
  reasons: string[];
}

export interface PersistenceHealthMetrics {
  streamId: string;
  integrityValid: boolean;
  validThroughSequence: number;
  totalEvents: number;
  snapshotCount: number;
  latestSnapshotSequence: number;
  replayedEventCount: number;
  snapshotCoverageRatio: number;
  replayEfficiency: number;
  deterministicReplay: boolean;
  recoveryRequired: boolean;
}
