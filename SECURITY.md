# Security Policy

## Supported versions

Security fixes are currently applied to the latest minor release.

## Reporting a vulnerability

Do not create a public issue for a vulnerability that could place users at risk.

Contact the maintainer privately through the security-reporting method published on the GitHub repository profile. Include:

- affected version;
- reproducible steps;
- impact;
- suggested mitigation if available.

Never include API keys, private repository contents, personal data, or production credentials.

## Threat model

The project assumes that memory content can be incorrect, obsolete, malicious, or out of scope. Applications integrating this library should:

- validate provenance;
- enforce allow/deny path policies;
- isolate secrets from retrievable memory;
- use deterministic checks for high-risk actions;
- require human approval for destructive operations;
- treat model-generated claims as unverified until proven.

## Persistence-specific safeguards

The reference filesystem adapter applies defense in depth for local durable
memory:

- append-only hash-chained journals and immutable snapshots;
- explicit ownership checks for lock release and recovery;
- atomic claim-before-delete lock retirement;
- bounded retries for transient Windows sharing violations;
- canonical UTC timestamps and canonical JSON;
- configurable resource limits for normalization, appends, journals, and lock metadata;
- owner-only POSIX modes for newly created persistence artifacts;
- closed-world backup verification and staged restore.

These controls do not provide encryption or authenticity against an attacker
with unrestricted filesystem and process control. Use OS ACLs, encrypted
storage, trusted external heads, signed checkpoints, and independent backups
when the host or storage layer is outside the trust boundary.
