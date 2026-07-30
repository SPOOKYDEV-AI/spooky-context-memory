# Spooky Context Memory

**Scope-aware experiential memory and context dynamics for reliable AI agents.**

Spooky Context Memory is a TypeScript library for agents that must learn from accepted and rejected outcomes without turning every past event into a universal rule or carrying an entire conversation forever.

The engine combines:

- hierarchical scope isolation and typed graph links;
- contextual incident matching;
- deterministic experience-capsule compilation;
- explicit separation between user outcome validation and technical claims;
- contrastive analysis of rejected and accepted attempts;
- causal claims with evidence and contradiction tracking;
- admission gates that prevent low-value traces from becoming active memory;
- pattern detection across independent contexts;
- **Context Dynamics** with progressive activation, overlap, inertia, and reactivation;
- **Situational Memory** with phase contracts and controlled handoffs;
- capsule accumulation during the discussion rather than only after it;
- context release gates based on verified transfer, not age;
- **Visions** that prune impossible branches before graph search;
- incremental Vision updates instead of global rescoring;
- A*-style heuristic routing inside the allowed subgraph;
- selective memory reconstruction and compact preventive preflight context.

## Core idea

A conversation is a flow, not a static prompt.

```text
Conversation stream
    ↓
Context frames with progressive activation
    ↓
Situation and protected context contract
    ↓
Rejected and accepted trajectories
    ↓
Capsule accumulator
    ↓
Admission and validation
    ↓
Persistent capsule and recurring patterns
    ↓
Vision-guided selective reconstruction
```

The initial context must survive long enough to orient exploration, implementation, and validation. It leaves the active working set only when its useful value has been transferred into persistent, traceable structures.

> No eviction without proof of transfer.

## Context as a viscous flow

A new topic does not instantly erase the previous one. Contexts can coexist for several turns:

```text
Context A dominant
    ↓
Context B introduced
    ↓
A and B overlap
    ↓
B becomes dominant
    ↓
A moves to background or dormant memory
```

Each frame has activation, relevance, inertia, activation state, and retention state. Old context can remain critical; recent context can remain secondary. Retention is therefore based on goal dependency, constraints, unresolved work, validation importance, reuse value, and redundancy rather than age alone.

## Situation and phase contracts

A `ContextContract` preserves the information that must not degrade across phases:

- initial need;
- current goal;
- invariants;
- discriminating properties;
- forbidden effects;
- acceptance criteria;
- accepted decisions;
- rejected trajectories;
- unresolved questions.

```text
Exploration
→ Convergence
→ Implementation
→ Validation
→ Closed
```

Each phase transition emits a `PhaseHandoff`. The amount of raw context may shrink while fidelity to the initial need remains stable.

## Capsule accumulation

A capsule is not merely a summary created at the end. A `CapsuleAccumulator` receives useful deposits throughout the situation:

- initial need;
- observations;
- rejected trajectories;
- accepted decisions;
- claims;
- evidence;
- context and transition provenance.

The accumulator can become `ready`, but it never activates memory automatically. It must still pass admission, validation, and explicit consolidation rules.

## Controlled context release

A context frame moves from active memory to background, compacted, dormant, archived, or deletion-eligible only after a `ContextReleaseGate` verifies that:

- the initial need was preserved;
- important constraints were preserved;
- accepted decisions and useful rejected paths were transferred;
- provenance and uncertainty remain available;
- no active dependency still requires the frame;
- permanent deletion has a consolidated capsule destination.

Forgetting normally means **stop injecting automatically**, not **destroy immediately**.

## Memory reconstruction

Persistent storage makes selective recall possible. A remembered situation is reconstructed from the current task plus applicable capsules, patterns, contexts, and transition paths.

```text
Current task
    ↓
Vision and hard exclusions
    ↓
Relevant dormant context
    ↓
Applicable capsules and patterns
    ↓
Compact reconstructed memory
```

The agent receives only what must influence the present action. Raw transcripts are not injected by default.

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

## Context flow example

```ts
import {
  createEmptyContextField,
  pinContextFrame,
  updateContextField,
} from "@spooky-ai/context-memory";

let field = createEmptyContextField(new Date().toISOString());

field = updateContextField(field, {
  topic: "Design contextual memory",
  intent: "design_memory",
  scope: { projectId: "project-atlas" },
  turnId: "turn-1",
  observedAt: new Date().toISOString(),
}).field;

field = pinContextFrame(
  field,
  field.frames[0]!.id,
  "The initial need must survive final validation.",
);
```

## Public/private boundary

This repository contains only:

- generic engine code;
- synthetic examples;
- public fixtures;
- deterministic tests.

Real transcripts, context frames, transitions, situations, accumulators, capsules, patterns, Visions, preferences, private repositories, paths, customer names, and project identifiers must be stored outside the public source tree.

Recommended ignored paths:

```text
.context-memory/private/
*.memory.db
*.context.private.json
*.transition.private.json
*.situation.private.json
*.accumulator.private.json
*.vision.private.json
*.capsule.private.json
*.trace.private.json
```

See [`docs/privacy-boundary.md`](docs/privacy-boundary.md).

## Architecture

```text
src/
├── domain/          Generic memory graph contracts
├── storage/         Storage interfaces and in-memory adapter
├── traversal/       BFS, DFS and path policies
├── retrieval/       Scope-aware best-first retrieval
├── incidents/       Historical incident applicability
├── capsules/        Candidate compilation and controlled activation
├── episodes/        User-outcome episodes and contrast extraction
├── claims/          Evidence-aware causal claims
├── admission/       Capsule admission decisions
├── patterns/        Cross-context pattern detection and support
├── contexts/        Context flow, inertia, retention and transitions
├── situations/      Context contracts and phase handoffs
├── accumulation/    Progressive capsule accumulation
├── release/         Proof-based context release gates
├── reconstruction/  Selective memory reconstruction
├── visions/         Contextual subgraph plans and incremental updates
├── routing/         A* routing, frontier cache and belief updates
├── preflight/       Minimal preventive context compilation
├── privacy/         Public-fixture boundary checks
└── evaluation/      Retrieval, contamination and phase-intensity metrics
```

## Invariants

1. User approval validates the final outcome by default, not the root cause.
2. Unknown causes remain unknown.
3. Semantic similarity never grants authority.
4. Hard scope and forbidden-effect exclusions run before heuristic search.
5. Capsules preserve episodes; patterns preserve recurring mechanisms.
6. Multiple events from the same source are not counted as independent proof.
7. A new context does not instantly erase the previous one.
8. The initial need remains pinned until safe transfer is proven.
9. No context is released merely because it is old or large.
10. No eviction occurs without proof of transfer.
11. Visited memory and injected memory are separate sets.
12. A stored capsule is not the same thing as a reconstructed memory.
13. Private runtime data never belongs in the public repository.
14. Persistence must not freeze an unstable semantic model.

## Status

`v0.2.0` provides experiential capsules, patterns, Visions, heuristic routing, and preventive preflight. The current development milestone adds the `v0.3` Context Dynamics and Situational Memory foundation without yet publishing a `v0.3.0` package release.

See:

- [`docs/memory-v0.2-specification.md`](docs/memory-v0.2-specification.md)
- [`docs/memory-v0.3-specification.md`](docs/memory-v0.3-specification.md)
- [`docs/context-dynamics.md`](docs/context-dynamics.md)
- [`docs/situational-memory.md`](docs/situational-memory.md)
- [`docs/context-retention.md`](docs/context-retention.md)
- [`docs/memory-reconstruction.md`](docs/memory-reconstruction.md)
- [`docs/capsules.md`](docs/capsules.md)
- [`docs/patterns.md`](docs/patterns.md)
- [`docs/visions.md`](docs/visions.md)
- [`docs/roadmap.md`](docs/roadmap.md)

## License

MIT
