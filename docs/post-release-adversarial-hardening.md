# Post-Release Adversarial Hardening

This hardening pass starts from the immutable `v0.7.1` release and targets the
remaining failure modes that are easiest to expose only under hostile timing,
operating-system sharing semantics, malformed persistence metadata, and
resource-exhaustion inputs.

## Trigger

A post-merge Windows CI run preserved the core single-writer invariant but one
concurrent worker returned an aggregate lock-release error instead of the
expected optimistic-concurrency message. The journal still contained exactly
one event, but the result exposed two weaknesses:

1. Windows may reject lock deletion transiently while another process is
   reading the file;
2. the worker serialized only the top-level error message, hiding nested causes.

The failure is therefore treated as a real reliability signal rather than
re-run noise.

## Atomic lock retirement

Lock release and orphan recovery no longer perform a vulnerable
inspect-then-unlink sequence.

The exact lock entry is now:

1. inspected for the expected owner;
2. atomically renamed to a unique claimed path;
3. parsed and owner-checked again after the rename;
4. deleted with bounded retries for `EACCES`, `EBUSY`, and `EPERM`;
5. restored through an exclusive hard link when deletion cannot complete.

A replacement lock captured during the race is restored or preserved for
operator inspection. It is never silently deleted. This closes the path-swap
window between ownership verification and deletion.

## Concurrent-worker diagnostics

The multi-process writer helper now records:

- top-level error name;
- every nested `AggregateError` message;
- nested causes;
- filesystem error codes.

The race test asserts the real invariant:

- exactly one writer succeeds;
- exactly seven writers lose through optimistic concurrency;
- no aggregate lock-release failure is accepted;
- the journal contains one valid event from the winning writer.

Standard CI repeats the eight-process race five times per matrix job. The
scheduled reliability workflow repeats it one hundred times per operating
system and Node.js line by default.

## Deterministic timestamp boundary

Persisted timestamps now accept only the exact UTC millisecond representation
emitted by `Date.prototype.toISOString()`:

```text
YYYY-MM-DDTHH:mm:ss.sssZ
```

Date-only strings, timezone offsets, missing milliseconds, rollover dates, and
implementation-dependent `Date.parse` inputs are rejected before persistence.
This prevents two textual representations of one instant from entering hashes
and avoids cross-runtime parsing differences.

## Resource-exhaustion boundaries

Canonical JSON normalization now has explicit limits for:

- nesting depth;
- total normalized nodes;
- array length;
- object key count;
- string length.

`FileEventJournal` additionally bounds:

- events per append;
- serialized bytes per append;
- total journal bytes read or extended;
- lock metadata bytes parsed.

The defaults are intentionally generous for normal use while preventing a
single malformed input or filesystem artifact from forcing unbounded recursion
or memory allocation. Integrations can lower the limits for constrained
runtimes.

## Private filesystem defaults

New persistence directories are requested with mode `0700` and new journal,
lock, snapshot, backup, and restore-stage files with mode `0600` on POSIX
systems. Windows continues to rely on ACLs because POSIX mode bits are not the
security authority there.

These defaults reduce accidental cross-user disclosure. They do not replace
application-level access control, encryption at rest, or secure host policy.

## Permanent adversarial coverage

The new boundary suite covers:

- canonical-JSON depth, node, collection, and string bombs;
- ambiguous timestamps;
- oversized event batches and append payloads;
- oversized journals and lock metadata;
- POSIX persistence permissions;
- transient Windows sharing violations;
- successor-lock handoff;
- orphan-recovery path replacement;
- repeated eight-process same-stream races with full nested diagnostics.

## Security boundary

These controls defend against accidental corruption, malformed local inputs,
race conditions, and resource abuse within the documented process and
filesystem trust boundary. They do not make a writable local filesystem safe
against an administrator or attacker who can replace code, trusted heads,
backups, and every persistence artifact together.
