# Spooky Context Memory

**Scope-aware hierarchical memory and incident retrieval for reliable AI coding agents.**

Spooky Context Memory is an open-source TypeScript library for agents that must remember technical decisions, failures, and fixes **without applying old information outside its original scope**.

It combines:

- a hierarchical memory tree for project and workflow isolation;
- typed cross-links for controlled graph navigation;
- BFS, DFS, and best-first traversal;
- allow/deny path policies;
- task-scoped retrieval;
- provenance, confidence, freshness, and status metadata;
- contextual incident memories;
- explicit `appliesWhen` and `doesNotApplyWhen` conditions;
- classification of historical incidents as applicable, diagnostic-only, or out of scope.

## Why this project exists

Global semantic search can retrieve information that looks relevant but belongs to:

- another project;
- another workflow;
- an obsolete implementation;
- a different runtime or operating system;
- a different initial user need.

This project treats semantic similarity as **one ranking signal**, never as the authority that defines the search perimeter.

```text
Current task
    ↓
Select trusted anchor branches
    ↓
Build an allowed context cone
    ↓
Traverse only authorized nodes
    ↓
Rank candidates inside that perimeter
    ↓
Validate scope, freshness, and applicability
    ↓
Compile minimal context for the agent
```

## Core principle

An incident is not stored as:

```text
Error X → Fix Y
```

It is stored as:

```text
For objective B,
inside workflow W,
under conditions C,
error X occurred because of cause R.
Resolution Y produced outcome Z,
and must not be reused when exclusions E are true.
```

## Installation

```bash
npm install @spooky-ai/context-memory
```

For local development:

```bash
npm install
npm run check
```

## Quick example

```ts
import {
  InMemoryMemoryStore,
  retrieveContext,
  type MemoryNode,
} from "@spooky-ai/context-memory";

const store = new InMemoryMemoryStore();

const root: MemoryNode = {
  id: "asr",
  parentId: null,
  path: "/projects/asr",
  type: "project",
  status: "active",
  title: "ASR",
  summary: "Document automation project.",
  scope: { projectId: "asr" },
  metadata: {
    confidence: 1,
    sourceTrust: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  provenance: {
    sourceType: "user",
    createdBy: "maintainer",
  },
};

store.addNode(root);

const result = retrieveContext(store, {
  query: "Fix the ASR runtime uninstall workflow",
  anchorNodeIds: ["asr"],
  currentScope: { projectId: "asr" },
  traversal: {
    maxNodes: 12,
    maxDepth: 4,
    minimumScore: 0.35,
    allowedPathPrefixes: ["/projects/asr", "/shared-skills/powershell"],
    deniedPathPrefixes: ["/projects/other", "/personal"],
    allowedLinkTypes: ["depends_on", "validated_by", "supersedes"],
  },
});

console.log(result.nodes);
```

See [`examples/incident-applicability.ts`](examples/incident-applicability.ts) for a complete incident-matching example.

## Architecture

```text
src/
├── domain/         # Public types and contracts
├── storage/        # Storage adapters
├── traversal/      # BFS, DFS and best-first traversal
├── retrieval/      # Context cone, scoring and compilation
└── incidents/      # Applicability and exclusion logic
```

The storage contract is intentionally small. PostgreSQL, SQLite, Neo4j, document stores, and vector databases can be added without changing the domain model.

## Retrieval safeguards

Denied paths always win over allowed paths.

```ts
{
  allowedPathPrefixes: ["/projects/asr", "/shared-skills/powershell"],
  deniedPathPrefixes: ["/projects/asr/secrets", "/personal"]
}
```

A historical incident is never automatically treated as a valid fix. It is classified as:

- `applicable`;
- `diagnostic_reference`;
- `out_of_scope`.

## Research direction

The repository is also an experimental foundation for comparing:

1. global semantic retrieval;
2. tree-scoped retrieval;
3. tree-scoped retrieval with typed cross-links;
4. best-first traversal with contextual incident applicability.

Planned evaluation metrics include:

- irrelevant-context rate;
- wrong-fix reuse rate;
- task success rate;
- model calls and token consumption;
- correction iterations;
- deterministic test success;
- human intervention rate.

See [`docs/research-protocol.md`](docs/research-protocol.md).

## Project status

This is an early public MVP. The public API may evolve before `1.0.0`.

## Contributing

Contributions, reproducible incident examples, storage adapters, benchmarks, and retrieval-policy proposals are welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Security

Please do not publish secrets, private repositories, production data, or unresolved vulnerabilities in issues. See [`SECURITY.md`](SECURITY.md).

## License

MIT
