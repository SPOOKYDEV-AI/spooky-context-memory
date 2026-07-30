# Public and Private Memory Boundary

The repository is public. Runtime memory is not.

## Allowed in the repository

- generic TypeScript contracts;
- deterministic algorithms;
- synthetic projects such as Atlas and Aurora;
- artificial fixtures;
- benchmark scenarios without real user data.

## Forbidden in the repository

- real interaction traces;
- real user preferences or validation history;
- production paths and hostnames;
- customer or employer identifiers;
- private repository content;
- API keys, tokens, credentials, or personal data;
- real capsules, patterns, or Visions.

## Runtime layout

A private integration may use:

```text
.context-memory/private/
├── traces/
├── capsules/
├── patterns/
├── visions/
└── memory.db
```

The complete directory must be ignored by Git.

## Public fixture guard

`assertPublicData` accepts caller-defined forbidden identifiers and path fragments. CI or local tooling can use it before exporting synthetic fixtures.

The library cannot know every private identifier automatically. Integrators remain responsible for their own redaction policy.

## History note

Removing a sensitive value from the current branch does not remove it from Git history. Actual secret exposure requires credential rotation and history-rewrite procedures.
