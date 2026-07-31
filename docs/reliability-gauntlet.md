# Reliability Gauntlet

## Purpose

The v0.7.1 reliability campaign treats persistence as a hostile environment rather than a happy-path feature.

The test strategy does not rely on a raw test count alone. It combines:

- deterministic generated cases;
- model-based state-machine scenarios;
- journal mutation matrices;
- fault injection at durable I/O boundaries;
- lock-ownership, remote-host, orphan-recovery, and real multi-process writer tests;
- exclusive concurrent snapshot publication;
- backup path, anchor, checksum, overlap, and restore equivalence;
- cross-platform and cross-version CI;
- a permanent synthetic regression corpus.

## Generated property campaign

`tests/persistence-property-gauntlet.test.ts` uses a deterministic PRNG and records the seed and case index in every failure.

The daily workflow runs four independent shards. Each shard executes 250,000 generated JSON cases by default, for at least one million property cases per campaign.

Every generated value verifies:

- canonical serialization is independent of object key insertion order;
- a JSON round trip preserves the persistence hash;
- an intentional mutation changes the hash;
- unsupported values are rejected before persistence.

The campaign can be scaled manually:

```bash
SPOOKY_GAUNTLET_CASES=1000000 \
SPOOKY_GAUNTLET_SHARD=7 \
npx vitest run tests/persistence-property-gauntlet.test.ts
```

## Model-based state machine

`tests/persistence-model-gauntlet.test.ts` compares the real filesystem implementation with a deliberately smaller reference model.

Generated operations include:

- single and batch appends;
- correct and stale expected sequences;
- verified snapshots;
- restart replay;
- repeated deterministic replay checks.

The model is intentionally not a copy of the production implementation. It stores only the observable counter state, sequence, and latest event hash.

## Mutation resistance

`tests/persistence-mutation-gauntlet.test.ts` mutates valid persisted history and verifies detection of:

- payload changes;
- event-hash changes;
- previous-hash changes;
- sequence changes;
- stream mixing;
- type changes;
- missing or additional envelope fields;
- derived event-identity changes;
- reordering;
- middle-event deletion;
- duplication.

Semantic corruption in a complete event is never classified as recoverable trailing damage.

## Fault injection

The production adapters accept an optional `PersistenceFaultInjector`.

Fault points cover lock acquisition and release, event preparation, append, fsync, snapshot write, snapshot fsync, rename, backup copy and manifest publication, backup replacement, staged restore verification, and restore replacement. Pre-publication failures must leave the previous destination untouched; post-publication failures must leave a fully verifiable new destination and an observable ambiguous-success result.

Durability boundaries flush both written files and their parent directories when supported. The gauntlet also replaces journal files, snapshot files, and their storage directories with symbolic links and requires the adapters to refuse them.

`ScriptedPersistenceFaultInjector` makes a failure reproducible by point and occurrence. It is a test facility, not an excuse to weaken production error handling.

## Release gates

A release is blocked when any of these invariants fails:

- journal corruption detection rate is below 100%;
- two independent replays disagree;
- a stale writer commits successfully;
- an active lock can be removed as orphaned;
- a malformed lock with unknowable ownership can be auto-removed;
- another owner's replacement lock can be deleted;
- a corrupted backup reaches the restore target;
- middle-of-stream corruption is truncated;
- concurrent snapshot publishers can overwrite one another;
- a snapshot sequence can be silently rewritten;
- an unanchored snapshot enters a verified backup;
- a journal, snapshot, or backup record resolves through a symbolic link;
- a persistence storage directory is not a real directory;
- a backup or restore target overlaps its source, including through symbolic-link parents or path components beginning with `..`;
- a private runtime artifact is staged for Git.

## Regression corpus

Every minimized failure becomes a synthetic corpus entry under `tests/corpus/`.

Each entry records:

- stable identifier;
- original deterministic seed;
- failure class;
- expected invariant.

Real runtime memory and customer data are forbidden in the corpus.

## Integrity threat-model boundary

SHA-256 chains and checksummed manifests detect accidental corruption, partial writes, internal inconsistency, and mutations that do not also rewrite every dependent hash. They do not authenticate the writer.

A malicious actor with full write access can rewrite journal data and recompute its hashes. A complete suffix deletion also leaves a self-consistent shorter chain unless a trusted external head, verified backup, replicated checkpoint, or signed anchor records the expected tip.

The gauntlet therefore treats verified external backups as part of the operational safety model and never describes checksums as confidentiality or authenticity controls.
