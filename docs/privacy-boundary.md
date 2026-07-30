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
- real truth anchors, attention fields, attention focuses, Views, rejected-View traces, plastic links, equilibrium snapshots, capsules, patterns, reconstructions, Vision ensembles, or checkpoints.

## Runtime layout

A private integration may use:

```text
.context-memory/private/
├── truths/
├── contexts/
├── transitions/
├── situations/
├── attentions/
├── attention-views/
├── rejected-views/
├── plastic-links/
├── equilibrium/
├── accumulators/
├── traces/
├── capsules/
├── patterns/
├── visions/
├── vision-ensembles/
├── vision-checkpoints/
├── reconstructions/
└── memory.db
```

The complete directory must be ignored by Git.

## Public fixture guard

`assertPublicData` accepts caller-defined forbidden identifiers and path fragments. CI or local tooling can use it before exporting synthetic fixtures.

The library cannot know every private identifier automatically. Integrators remain responsible for their own redaction policy.

## History note

Removing a sensitive value from the current branch does not remove it from Git history. Actual secret exposure requires credential rotation and history-rewrite procedures.
