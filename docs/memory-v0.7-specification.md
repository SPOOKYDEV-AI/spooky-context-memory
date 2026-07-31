# Memory v0.7 Specification

## Name

**Persistent Adaptive Memory and Deterministic Replay**

## Purpose

v0.7 converts the cognitive architecture from a volatile set of projections into a durable system whose history can be inspected, replayed, migrated, checkpointed, and recovered.

## Complete cycle

```text
Context and current durable state
→ attention and multi-View exploration
→ action and observed outcome
→ world, reflective, and unlearning updates
→ adaptive-cycle domain event
→ append-only journal
→ deterministic durable projection
→ verified snapshot
→ future replay and reconstruction
```

## Components

### Persistence contracts

- `EventJournal`;
- `SnapshotStore`;
- `MemorySnapshot`;
- `PersistedMemoryEvent`;
- `ReplayResult`;
- schema migration contracts.

### Reference journal

`FileEventJournal` provides:

- JSONL persistence;
- SHA-256 payload and event hashes;
- previous-hash chaining;
- contiguous sequences;
- optimistic concurrency;
- per-stream lock files;
- inspection and explicit trailing recovery.

### Reference snapshots

`FileSnapshotStore` provides:

- atomic temporary-file replacement;
- state and envelope checksums;
- latest-valid fallback;
- explicit retention pruning.

### Replay

- complete integrity verification before projection;
- snapshot anchoring;
- sequential event and snapshot migrations;
- deterministic state hashing;
- double-replay verification.

### Adaptive-memory runtime

`PersistentAdaptiveMemory` persists stable projections from the v0.6 adaptive cycle while avoiding automatic persistence of every temporary View.

### Logical compaction

Snapshots reduce replay cost. Journal history is preserved. Physical archival is recommended but not performed automatically.

## Failure protections

- stale expected sequence rejects the write;
- invalid hash rejects replay;
- corrupted snapshot falls back to an earlier valid snapshot;
- snapshot/journal disagreement rejects hydration;
- migration gaps reject projection;
- unknown adaptive event rejects the reducer;
- invalid node or link references reject durable state;
- non-trailing journal corruption refuses automatic recovery.

## Privacy

The public repository contains only synthetic fixtures. Real journal files, snapshots, lock files, backups, exported states, and recovery reports are private runtime artifacts.

## Deferred work

- SQLite and remote adapters behind the same contracts;
- encrypted-at-rest adapter;
- physical segmented-journal archival;
- multi-process distributed leases;
- backup replication and restore tooling;
- human-facing audit and correction UI.
