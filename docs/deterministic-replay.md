# Deterministic Replay and Recovery

## Deterministic reconstruction

A durable memory state is a projection:

```text
initial state
+ latest verified snapshot
+ ordered migrated events after the snapshot
= reconstructed state
```

`replayMemoryStream` verifies the complete journal first, validates the snapshot anchor, projects schemas, applies a pure reducer, validates the result, and returns a stable state hash.

`verifyDeterministicReplay` performs two independent replays. Determinism requires equality of:

- final sequence;
- final event hash;
- final state hash.

A mismatch means that a reducer, migration, or validation dependency uses unstable input such as wall-clock time, randomness, mutable global state, unordered external data, or network access.

## Reducer requirements

A replay reducer must:

- be pure;
- clone or immutably replace state;
- depend only on the prior state and projected event;
- avoid current time and random identifiers;
- normalize order where arrays represent sets;
- reject unknown event kinds;
- validate references before accepting the next state.

## Snapshot anchor

A snapshot at sequence `N` must contain the hash of journal event `N`. Sequence zero uses the genesis hash.

```text
snapshot.sequence = N
snapshot.eventHash = journal[N].eventHash
```

A checksum-valid snapshot with a wrong anchor is still rejected.

## Crash model

A process may stop:

- before append: no event exists;
- after complete append: the batch is replayable;
- during append: inspection detects the partial trailing record;
- during snapshot write: the temporary file is ignored;
- after snapshot rename: the snapshot is independently verified.

The system never guesses that an incomplete event should be completed.

## Recovery workflow

```text
1. stop writers
2. inspect journal and snapshots
3. preserve a backup copy
4. recover only trailing corruption
5. replay twice
6. compare state hashes
7. resume writes with expected sequence
```

## Auditability

Each event may carry:

- `causationId` for the triggering event;
- `correlationId` for one broader operation;
- `contextFingerprint` for applicability;
- `classification` for storage policy;
- `actor` for runtime attribution.

These fields do not prove truth. They preserve the chain explaining why the memory changed.
