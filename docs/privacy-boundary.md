# Public and Private Memory Boundary

The repository is public. Runtime memory is not.

## Allowed in the repository

- generic TypeScript contracts;
- deterministic algorithms;
- synthetic projects such as Atlas and Aurora;
- artificial fixtures;
- benchmark scenarios without real user data.

## Forbidden in the repository

- real interaction transcripts;
- real context frames or transition paths;
- real situations or phase handoffs;
- capsule accumulators built from user conversations;
- real user preferences or validation history;
- production paths and hostnames;
- customer or employer identifiers;
- private repository content;
- API keys, tokens, credentials, or personal data;
- real truth anchors, global-understanding models, semantic backbones, attention fields, attention focuses, Views, rejected-View traces, cognitive trajectories, reflective capsules, cognitive policies, habits, inhibition records, recovery conditions, relearning plans, plastic links, equilibrium snapshots, capsules, patterns, reconstructions, Vision ensembles, or checkpoints.

## Runtime layout

A private integration may use:

```text
.context-memory/private/
├── truths/
├── understanding/
├── semantic-backbone/
├── contexts/
├── transitions/
├── situations/
├── attentions/
├── attention-views/
├── rejected-views/
├── plastic-links/
├── equilibrium/
├── cognitive-trajectories/
├── reflective-capsules/
├── cognitive-policies/
├── habits/
├── inhibitions/
├── recovery/
├── relearning/
├── accumulators/
├── traces/
├── capsules/
├── patterns/
├── visions/
├── vision-ensembles/
├── vision-checkpoints/
├── reconstructions/
├── journals/
├── snapshots/
├── recovery-reports/
├── backups/
└── memory.db
```

The complete directory must be ignored by Git.

Journal files, snapshots, temporary snapshot files, lock files, backups, exports, migration reports, and recovery reports may contain the same sensitive data as live memory. They must follow the same access, encryption, retention, and deletion policy as the private runtime itself.

A checksum proves integrity, not confidentiality. The v0.7 reference file adapter does not encrypt data at rest.

## Public fixture guard

`assertPublicData` accepts caller-defined forbidden identifiers and path fragments. CI or local tooling can use it before exporting synthetic fixtures.

The library cannot know every private identifier automatically. Integrators remain responsible for their own redaction policy.

## History note

Removing a sensitive value from the current branch does not remove it from Git history. Actual secret exposure requires credential rotation and history-rewrite procedures.
