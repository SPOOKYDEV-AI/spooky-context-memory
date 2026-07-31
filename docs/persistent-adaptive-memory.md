# Persistent Adaptive Memory

## Objective

The v0.7 persistence layer makes adaptive memory durable without turning the latest in-memory projection into the only source of truth.

```text
Domain decision
→ append-only event
→ hash-chained journal
→ deterministic reducer
→ durable projection
→ verified snapshot
→ bounded replay
```

The journal preserves how memory changed. A snapshot only accelerates reconstruction.

## Persistence boundary

The reference implementation persists:

- durable memory nodes and links;
- global-understanding state and model lineage;
- reflective memory and grounded cognitive trajectories;
- cognitive policies and bias signals;
- adaptive-unlearning state, inhibition, recovery, and relearning plans;
- compact adaptive-cycle outcomes.

Temporary attention Views, progressive search frontiers, and injected prompt context are not automatically promoted to durable truth.

## Event journal

`FileEventJournal` writes one JSON event per line. Each event contains:

- stream id and contiguous sequence;
- event and schema identity;
- occurrence and recording timestamps;
- causation, correlation, and context identifiers when supplied;
- data classification;
- payload hash;
- previous event hash;
- complete event hash.

The previous-hash chain detects mutation, deletion, reordering, and accidental stream mixing.

Writes use optimistic concurrency and a per-stream lock. A batch is serialized into one append operation. Cross-process use remains single-writer by stream.

## Recovery

Journal inspection stops at the first invalid record. Recovery is explicit:

```text
inspect
→ identify last valid byte
→ verify corruption is trailing
→ request truncation
→ inspect again
```

Middle-of-stream corruption is never silently removed. It requires operator intervention or restoration from a trusted backup.

## Snapshots

`FileSnapshotStore` writes checksummed snapshots through temporary-file replacement. A snapshot records the sequence and event hash it represents.

Replay accepts a snapshot only when:

- the snapshot checksum is valid;
- its state hash is valid;
- its sequence exists in the journal;
- its event hash matches the journal anchor.

A corrupted newest snapshot is skipped in favor of the newest earlier valid snapshot.

## Schema migrations

`PersistenceMigrationRegistry` applies sequential read-time projections:

```text
stored schema 1
→ migration 1 to 2
→ migration 2 to 3
→ current projection 3
```

Stored event envelopes and their integrity hashes are never rewritten by migration. Migrations operate on cloned payloads or states and must remain deterministic.

## Adaptive-memory projection

`AdaptiveMemoryDurableState` is reconstructed through `reduceAdaptiveMemoryEvent`. It contains:

- memory revision;
- durable nodes and links;
- global understanding;
- reflective memory;
- adaptive-unlearning state;
- last context fingerprint and outcome id.

`PersistentAdaptiveMemory` coordinates append, hydrate, import, automatic checkpointing, and snapshot retention.

## Compaction

v0.7 implements logical compaction:

- replay starts from the latest verified snapshot;
- old snapshots can be pruned explicitly;
- event deletion remains forbidden;
- large journals receive an archival recommendation.

Physical journal segmentation or destructive prefix removal is intentionally deferred until archival, backup, and cross-segment hash rules are standardized.

## Invariants

1. The journal is append-only during normal operation.
2. Snapshots are accelerators, not authority.
3. Replay must produce the same state hash from the same inputs.
4. Migrations never rewrite persisted history.
5. Recovery is explicit and provenance-preserving.
6. Optimistic concurrency prevents silent lost updates.
7. Ephemeral Views do not become durable truth merely because they existed.
8. Unlearning history and recovery conditions remain reconstructable.
9. No physical deletion occurs during logical compaction.
10. Private runtime data stays outside the public repository.
