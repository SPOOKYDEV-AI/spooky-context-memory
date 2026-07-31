# Operational Recovery

## Safety posture

Operational commands are read-only by default. Destructive or state-changing recovery commands require explicit confirmation.

The installed package exposes the CLI as:

```bash
spooky-memory help
```

A repository checkout may use `spooky-memory help` after `npm run build`.

## Read-only commands

```bash
spooky-memory inspect --root <runtime-root> --stream <stream-id>
spooky-memory verify --root <runtime-root> --stream <stream-id>
spooky-memory replay --root <runtime-root> --stream <stream-id>
spooky-memory health --root <runtime-root> --stream <stream-id>
spooky-memory verify-backup --backup <backup-directory>
```

## Backup

```bash
spooky-memory backup \
  --root <runtime-root> \
  --stream <stream-id> \
  --backup <backup-directory>
```

A backup contains:

```text
backup-directory/
├── manifest.json
├── checksums.json
├── journals/
└── snapshots/
```

The manifest records event counts, latest sequence and event hash, snapshot hashes, state hashes, file lengths, file checksums, creation time, and source package version.

A stream with journal corruption, invalid or unanchored snapshot artifacts, unsafe record paths, symbolic-link records, or source/destination overlap cannot be backed up as healthy. Replacing an existing backup requires both `--replace` and `--confirm`.

Backup creation fsyncs copied files, manifest files, staging directories, and the destination parent before publication where supported. Restore applies the same rule to its staging tree and atomic target replacement. Pre-existing symbolic-link or non-regular journal and snapshot paths are refused before backup.

## Restore

Restore verifies every checksum and reconstructs journal integrity in a staging directory before replacing the target.

```bash
spooky-memory restore \
  --backup <backup-directory> \
  --target <runtime-root> \
  --confirm
```

Replacing an existing target additionally requires `--replace`. The previous directory is moved aside and returned in the restore result.

A damaged backup never reaches the restore target.

## Trailing recovery

Only a partial trailing record can be truncated automatically, and only through an explicit command:

```bash
spooky-memory recover-trailing \
  --root <runtime-root> \
  --stream <stream-id> \
  --confirm
```

Hash mismatches, sequence gaps, stream mixing, and other complete semantic corruption are never treated as a partial trailing write.

## Lock recovery

Locks contain a structured owner record:

- format version;
- stream id;
- random owner id;
- PID;
- hostname;
- creation time;
- heartbeat time.

A live owner lock cannot be removed. A lock created on another hostname remains conservatively active because local PID checks cannot prove that its remote owner is dead. An orphaned or expired-unknown local lock requires explicit recovery. A malformed lock is never removed automatically because its owner cannot be established; preserve it for inspection and use an operator-controlled filesystem procedure only after all writers are stopped:

```bash
spooky-memory recover-lock \
  --root <runtime-root> \
  --stream <stream-id> \
  --owner <previous-owner-id> \
  --confirm
```

The owner id is rechecked immediately before deletion. If ownership changed, recovery aborts.

## Snapshot temporary files

A pre-rename crash may leave a temporary snapshot artifact. It is visible in snapshot inspection and can be removed explicitly:

```bash
spooky-memory cleanup-snapshot-temp \
  --root <runtime-root> \
  --stream <stream-id> \
  --confirm
```

## Required operator sequence

```text
stop writers
→ inspect journal, snapshots, and lock
→ create or preserve a filesystem backup
→ verify backup
→ recover only the explicitly classified issue
→ replay twice
→ compare sequence, event hash, and state hash
→ resume writes with expected sequence
```

## Integrity versus authenticity

Checksums and hash chains are corruption-detection mechanisms. They do not encrypt data, authenticate an operator, or prevent a writer with full filesystem access from recomputing hashes. Keep verified backups or signed external anchors when complete history truncation or hostile filesystem access is in scope.
