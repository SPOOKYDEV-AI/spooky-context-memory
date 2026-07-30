# Spooky Context Memory

**Scope-aware experiential memory for reliable AI agents.**

Spooky Context Memory is a TypeScript library for agents that must learn from accepted and rejected outcomes without turning every past event into a universal rule.

The engine combines:

- hierarchical scope isolation and typed graph links;
- contextual incident matching;
- deterministic experience-capsule compilation;
- explicit separation between user outcome validation and technical claims;
- contrastive analysis of rejected and accepted attempts;
- causal claims with evidence and contradiction tracking;
- admission gates that prevent low-value traces from becoming active memory;
- pattern detection across independent contexts;
- **Visions** that prune impossible branches before graph search;
- A*-style heuristic routing inside the allowed subgraph;
- compact preventive preflight context for the agent.

## Core idea

The user normally validates the final result, not the technical explanation.

```text
Initial request
    ↓
Attempt rejected by the user
    ↓
Corrected attempt accepted by the user
    ↓
Contrastive analysis
    ↓
Candidate causal claims
    ↓
Experience capsule
    ↓
Pattern detection
    ↓
Preventive memory for future tasks
```

A user saying “yes” confirms that the result matches the requested outcome. It does not automatically prove the inferred root cause, the optimality of the implementation, or a universal rule.

## Why a Vision exists

The complete memory graph must not be traversed for every request.

```text
Current task signature
    ↓
Hard scope and forbidden-effect checks
    ↓
Vision resolution
    ↓
Deterministic branch pruning
    ↓
A* routing over the remaining subgraph
    ↓
Minimal Memory Preflight
```

A Vision is a contextual search plan. It contains anchors, allowed branches, exclusions, deferred frontiers, likely patterns, and a traversal budget. It is not a copy of the memory and it does not contain private project data in this public repository.

## Installation

```bash
npm install @spooky-ai/context-memory
```

For local development:

```bash
npm install
npm run check
```

Node.js 20 or later is required.

## Public/private boundary

This repository contains only:

- generic engine code;
- synthetic examples;
- public fixtures;
- deterministic tests.

Real traces, capsules, patterns, Visions, user preferences, private repositories, paths, customer names, and project identifiers must be stored outside the public source tree.

Recommended ignored paths:

```text
.context-memory/private/
*.memory.db
*.vision.private.json
*.capsule.private.json
*.trace.private.json
```

See [`docs/privacy-boundary.md`](docs/privacy-boundary.md).

## Capsule example

```ts
import {
  activateCapsule,
  compileCapsuleCandidate,
  type ExecutionTrace,
} from "@spooky-ai/context-memory";

const candidate = compileCapsuleCandidate(trace, {
  createdBy: "maintainer",
  confidence: 0.8,
});

const active = activateCapsule(candidate, {
  approval: {
    approved: true,
    approvedBy: "maintainer",
    approvedAt: new Date().toISOString(),
    scope: {
      outcomeAccepted: true,
      reusableAsMemory: true,
    },
  },
});

console.log(active.lifecycle.status); // active
```

The user outcome claim becomes verified. A root-cause claim remains unverified until independent evidence supports it.

## Contrastive episode example

```ts
import {
  analyzeEpisode,
  extractEpisodeContrast,
} from "@spooky-ai/context-memory";

const analysis = analyzeEpisode(episode);
const contrast = extractEpisodeContrast(episode);

console.log(analysis.hasOutcomeContrast);
console.log(contrast.inferredDiscriminators);
```

The analyzer can identify that an accepted square has equal width and height after a generic rectangle was rejected. It records this as a supported discriminator, not as a universal truth.

## Vision and heuristic routing

```ts
import {
  resolveMemoryVision,
  routeMemoryWithVision,
} from "@spooky-ai/context-memory";

const vision = resolveMemoryVision({
  task,
  scope,
  branches,
  memoryRevision: 12,
});

const routing = routeMemoryWithVision({
  vision,
  nodes,
  edges,
  startNodeIds: vision.anchors,
});
```

Hard exclusions are applied before heuristic scoring. A semantically attractive branch that predicts a forbidden effect is removed, not merely given a lower score.

## Memory Preflight

```ts
import {
  buildMemoryPreflight,
  compilePreflightContext,
} from "@spooky-ai/context-memory";

const preflight = buildMemoryPreflight({
  task,
  capsules: applicableCapsules,
  patterns: preventivePatterns,
});

const context = compilePreflightContext(preflight, {
  maxCharacters: 1_500,
});
```

The model receives only:

- what must be preserved;
- known failure modes;
- approaches already pruned;
- facts that must be verified;
- unresolved unknowns.

Exploring a capsule never implies injecting the complete capsule.

## Architecture

```text
src/
├── domain/       Generic memory graph contracts
├── storage/      Storage interfaces and in-memory adapter
├── traversal/    BFS, DFS and path policies
├── retrieval/    Scope-aware best-first retrieval
├── incidents/    Historical incident applicability
├── capsules/     Candidate compilation and controlled activation
├── episodes/     User-outcome episodes and contrast extraction
├── claims/       Evidence-aware causal claims
├── admission/    Capsule admission decisions
├── patterns/     Cross-context pattern detection and support
├── visions/      Contextual subgraph plans and cache
├── routing/      A* routing, frontier cache and belief updates
├── preflight/    Minimal preventive context compilation
├── privacy/      Public-fixture boundary checks
└── evaluation/   Retrieval and contamination metrics
```

## Invariants

1. User approval validates the final outcome by default, not the root cause.
2. Unknown causes remain unknown.
3. Semantic similarity never grants authority.
4. Hard scope and forbidden-effect exclusions run before heuristic search.
5. Capsules preserve episodes; patterns preserve recurring mechanisms.
6. Multiple events from the same source are not counted as independent proof.
7. A Vision limits traversal before graph exploration.
8. Visited memory and injected memory are separate sets.
9. Private runtime data never belongs in the public repository.
10. Persistence must not freeze an unstable semantic model.

## Status

The repository is an early research implementation. The next milestones focus on benchmarks, false-pruning analysis, pattern quality, and only then persistent adapters.

See:

- [`docs/memory-v0.2-specification.md`](docs/memory-v0.2-specification.md)
- [`docs/capsules.md`](docs/capsules.md)
- [`docs/patterns.md`](docs/patterns.md)
- [`docs/visions.md`](docs/visions.md)
- [`docs/research-protocol.md`](docs/research-protocol.md)
- [`docs/roadmap.md`](docs/roadmap.md)

## License

MIT
