# Spooky Context Memory

**Scope-aware experiential memory with global coherence, reflective learning, adaptive unlearning, and deterministic persistence for reliable AI agents.**

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
- **Progressive Vision Ensembles** with bounded micro-Visions, beam selection, splitting, merging, checkpoints, and backtracking;
- loop guards that allow context-aware revisits but block circular exploration;
- A*-style heuristic routing inside each allowed local subgraph;
- a sourced, scoped, and versioned **Epistemic Core**;
- bounded **Distributed Memory Attention** across goals, constraints, unknowns, experience, challenges, transitions, and risks;
- many cheap attention-driven Views with hard truth and scope triage;
- cross-View consensus, divergence, and coverage-gap extraction;
- compact rejected-View traces with explicit revisit conditions;
- continuous evidence-aware memory-link plasticity;
- dynamic equilibrium bands, hysteresis, and exploration debt;
- a retroactive learning loop that changes future attention, Views, links, capsules, and patterns;
- a slower **Global Understanding** layer that stabilizes meaning while local memory moves;
- a semantic backbone and controlled global-revision gate;
- **Reflective Learning** from grounded cognitive trajectories and successful View strategies;
- self-bias detection for confirmation, inertia, contradiction neglect, and outcome-cause conflation;
- **Adaptive Unlearning** that inhibits, narrows, weakens, quarantines, or supersedes habits without deleting history;
- counterfactual Views, relearning plans, and explicit recovery conditions;
- append-only, hash-chained persistence journals with optimistic concurrency;
- atomic snapshots, schema migrations, deterministic replay, and explicit crash recovery;
- logical compaction that reduces replay cost without deleting journal history;
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
Epistemic Core and distributed attention
    ↓
Many cheap Views and cross-View triage
    ↓
Progressive micro-Visions and bounded beam
    ↓
Action, outcome, and retroactive plasticity
    ↓
Reflective learning and adaptive unlearning
    ↓
Global-understanding revision gate
    ↓
Append-only event journal and verified snapshot
    ↓
Deterministic replay and durable reconstruction
    ↓
Vision-guided selective reconstruction
```

The initial context must survive long enough to orient exploration, implementation, and validation. It leaves the active working set only when its useful value has been transferred into persistent, traceable structures.

> No eviction without proof of transfer.


## Persistent adaptive memory

v0.7 adds a durable event-sourced boundary around the cognitive engine.

```text
Adaptive memory decision
    ↓
Hash-chained JSONL event
    ↓
Deterministic reducer
    ↓
Durable state projection
    ↓
Atomic verified snapshot
    ↓
Bounded replay after restart
```

The event journal is the historical source. Snapshots accelerate replay but never replace or rewrite history. Every event carries a contiguous sequence, payload hash, previous-event hash, full event hash, schema version, timestamps, and optional context, correlation, causation, actor, and classification metadata.

`FileEventJournal` provides a Node.js 20-compatible reference adapter without runtime dependencies. `FileSnapshotStore` provides atomic checksummed snapshots. `PersistenceMigrationRegistry` performs deterministic read-time migrations without changing stored hashes. `PersistentAdaptiveMemory` persists durable projections from the adaptive evolution cycle while temporary Views and search frontiers remain non-authoritative by default.

Recovery is explicit. A partial trailing write may be truncated only after inspection identifies the last valid byte. Middle-of-stream corruption is never silently repaired.

## Persistence Reliability Gauntlet

v0.7.1 hardens the durable boundary through deterministic fault injection, explicit lock ownership, exclusive snapshot publication, verified backup and restore, operational health states, multi-process writer races, and cross-platform stress campaigns.

```text
valid history
→ intentional crash or mutation
→ deterministic inspection
→ explicit health classification
→ safe refusal or bounded recovery
→ replay equivalence check
```

The daily reliability workflow executes at least one million generated canonicalization and hashing cases across four deterministic shards. Stateful filesystem scenarios then exercise Windows and Linux on Node.js 20, 22, and 24. Every minimized failure is retained as a synthetic regression corpus entry.

Operational tooling is compiled with the package:

```bash
spooky-memory inspect --root <runtime-root> --stream <stream-id>
spooky-memory health --root <runtime-root> --stream <stream-id>
spooky-memory backup --root <runtime-root> --stream <stream-id> --backup <directory>
```

The package exposes `spooky-memory` through its npm `bin` metadata. Repository checkouts may use `node dist/cli/spooky-memory.js` directly after `npm run build`.

State-changing recovery requires explicit `--confirm`. A corrupted backup, active or remote-host lock, ownership change, non-trailing journal mutation, unanchored snapshot, overlapping backup path, or divergent replay blocks the operation.

Journal, lock, snapshot, backup, and staged-restore publication flushes both file content and parent-directory metadata where the platform supports directory fsync. Pre-existing symbolic-link or non-regular journal and snapshot paths are rejected so the reference adapters do not silently follow persistence artifacts outside their runtime root.

Integrity hashes detect accidental mutation and inconsistent history; they are not authentication. A malicious actor with write access can recompute hashes, and complete suffix truncation cannot be proven from the remaining hash chain alone without a trusted external head, backup, or checkpoint. Operators must preserve verified backups for that threat model.

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

## Progressive Vision Ensemble

One broad Vision can preserve a stale interpretation for too long. The progressive router therefore creates several short-lived micro-Visions, each representing one local search hypothesis.

```text
Context delta
    ↓
Revalidate existing micro-Visions
    ↓
Prune invalid or stale hypotheses
    ↓
Spawn, split, or merge Visions
    ↓
Explore a bounded active beam
    ↓
Checkpoint before deeper traversal
    ↓
Backtrack, defer, supersede, or deepen
```

A micro-Vision records its context revision, context anchors, branch set, evidence, unresolved questions, visited nodes, frontier nodes, injected items, score, lifecycle state, and local budget.

The beam keeps one defeasible dominant Vision and a small number of active or deferred alternatives. Equivalent Visions merge. Broad Visions split into smaller branch groups. Dominated, contradicted, context-stale, or exhausted Visions leave the active beam without deleting the underlying memory.

`VisionLoopGuard` blocks repeated states when context, evidence, unresolved questions, constraints, and progress have not changed. Revisiting after a real context or evidence change remains allowed.

`VisionCheckpointStore` and `backtrackProgressiveVision` restore an earlier frontier after a dead end instead of restarting from the memory root.

## Epistemic Core

Dynamic Views are constrained by a stable but versioned reference layer. An `EpistemicCore` distinguishes authoritative truths, verified results, supported claims, observations, inferences, hypotheses, disputes, refutations, and unknowns.

```text
sourced scoped truth
    ↓ constrains
attention and Views
    ↓ may challenge with proportional evidence
versioned supersession rather than history rewrite
```

A weak contradictory signal is recorded without automatically displacing an authoritative project source. A stronger, independent, and appropriately authoritative replacement can supersede it inside the same scope and validity interval.

## Distributed Memory Attention

A `MemoryAttentionField` maintains several bounded points of attention. Default roles cover:

- goal;
- constraint;
- uncertainty;
- experience;
- challenge;
- transition;
- risk;
- exploration.

Redundant focuses merge before budget allocation. Pinned attention protects the initial need. Fast attention can appear after a contradiction, unexpected outcome, or context transition. Dormant attention can reactivate when the context returns.

```text
Memory and context
    ↓
Attention portfolio
    ↓
Many local Views
    ↓
Bounded progressive Vision seeds
```

## Cross-View triage

The engine may generate many cheap Views. Incorrect Views are acceptable when they are explicitly hypothetical, receive small budgets, and produce reusable rejection reasons.

Hard scope, forbidden effects, and truth conflicts run before ranking. Equivalent Views merge. The result exposes consensus, divergence, coverage gaps, one defeasible dominant View when justified, and active or deferred alternatives.

A rejected View records why it failed and when it may be reconsidered. Rejection in one context never becomes universal falsehood.

## Retroactive learning and plasticity

After an action or prediction, the observed outcome is classified as supported, partially supported, contradicted, context-mismatched, scope-mismatched, truth-conflicting, missing evidence, superseded, redundant, or unresolved.

The verdict then:

- reinforces or challenges the attentions that generated the View;
- creates contradiction attention when required;
- updates affected memory links by independent evidence groups;
- records compact rejection and revisit conditions;
- proposes capsule reinforcement, narrowing, extension, splitting, or dispute;
- invalidates or reconsiders dependent Views.

```text
Attention → Views → Action → Outcome
    ↑                         ↓
    └──── retroactive update ─┘
```

## Dynamic equilibrium

The system does not seek one permanent optimum while a situation remains open. It maintains a moving equilibrium across fidelity, constraints, diversity, uncertainty, exploration depth and breadth, injection cost, stability, plasticity, and exploration debt.

Control uses acceptable bands and hysteresis rather than one exact threshold. Corrections remain local and minimal: deepen, spawn an alternative, defer, backtrack, reactivate attention, reduce injection, request evidence, or freeze consolidation.

## Global understanding and coherence

A living memory is stable when local changes preserve a coherent understanding of the whole situation. `GlobalUnderstandingState` therefore moves more slowly than attention, Views, links, and capsules.

```text
Fast:    attention and temporary Views
Medium:  links, capsules, and reflective policies
Slow:    patterns, semantic backbone, and global understanding
```

One dominant global model and a small set of alternatives preserve identity, primary goal, invariants, truth anchors, core patterns, accepted claims, disputed claims, and unresolved questions. Local contradiction normally revises only the affected claim or backbone edge. Independent structural contradiction can challenge the dominant model or promote a better alternative through a controlled revision gate.

## Reflective learning

The engine can learn from its own grounded cognitive trajectories:

```text
attention distribution
→ generated and rejected Views
→ verification sequence
→ selected action
→ observed outcome
→ contextual cognitive policy
```

Outcome fit, prediction fit, causal fit, and strategy efficiency remain separate. A successful action does not automatically validate its causal explanation. Mirror learning requires an observable result, test, source, user verdict, or another external grounding key.

Repeated grounded trajectories can form reflective capsules that teach the system how to allocate attention, compose Views, choose breadth and depth, preserve contradictions, and limit injected memory.

## Adaptive unlearning

A successful strategy can become a cognitive habit. Habits retain historical support while tracking current applicability, predictive reliability, context drift, contradiction pressure, automaticity, and adaptability.

Unlearning does not delete history. It may:

- challenge an automatic path;
- inhibit it in the current context;
- narrow its scope;
- weaken its operational authority;
- quarantine it;
- supersede it with a better habit;
- reopen a claim as unknown;
- coordinate contextual relearning.

Counterfactual exploration keeps the habitual View as a control while generating habit-free, inverted-assumption, and truth-first alternatives. Recovery conditions allow inhibited habits to return as challenged options rather than immediate defaults.

## Installation

The repository and GitHub releases are public. npm distribution is not enabled yet, so the scoped package may return `404` until a dedicated publication workflow is completed.

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

Real transcripts, truth anchors, context frames, transitions, situations, attention fields, attention Views, rejected-View traces, plastic links, equilibrium snapshots, accumulators, capsules, patterns, Visions, preferences, private repositories, paths, customer names, and project identifiers must be stored outside the public source tree.

Recommended ignored paths:

```text
.context-memory/private/
*.memory.db
*.context.private.json
*.transition.private.json
*.situation.private.json
*.accumulator.private.json
*.vision.private.json
*.vision-ensemble.private.json
*.vision-checkpoint.private.json
*.truth.private.json
*.attention.private.json
*.attention-view.private.json
*.rejected-view.private.json
*.plastic-link.private.json
*.equilibrium.private.json
*.retroaction.private.json
*.understanding.private.json
*.semantic-backbone.private.json
*.cognitive-trajectory.private.json
*.reflective-capsule.private.json
*.cognitive-policy.private.json
*.cognitive-habit.private.json
*.habit-inhibition.private.json
*.habit-recovery.private.json
*.counterfactual-view.private.json
*.unlearning.private.json
*.relearning.private.json
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
├── epistemic/       Scoped, versioned truth anchors and authority-proportional challenge
├── attention/       Distributed attention fields, role coverage, decay, and reactivation
├── views/           Attention-driven Views, cross-View triage, and rejected-View ledger
├── visions/         Static and progressive Visions, beam control, checkpoints, loop guards
├── routing/         Local A* routing, frontier cache and belief updates
├── plasticity/      Evidence-aware link updates and capsule-refinement plans
├── equilibrium/     Control bands, hysteresis, and exploration debt
├── retroaction/     Outcome feedback into attention and memory
├── understanding/   Global models, semantic backbone, and revision pressure
├── reflection/      Cognitive trajectories, reflective capsules, policies, and bias signals
├── unlearning/      Habits, inhibition, counterfactual Views, recovery, and relearning
├── persistence/     Journals, snapshots, replay, backup, locks, recovery, and fault injection
├── cli/             Read-only inspection and explicit operational recovery commands
├── orchestration/   Attention-driven and adaptive memory-evolution cycles
├── preflight/       Minimal preventive context compilation
├── privacy/         Public-fixture boundary checks
└── evaluation/      Retrieval, adaptive-memory, and equilibrium metrics
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
15. A dominant Vision is a search hypothesis, not authoritative memory.
16. Pruning a Vision never deletes the underlying memory.
17. Revisiting memory requires new context, evidence, or measurable progress after the bounded allowance.
18. Backtracking restores a checkpoint instead of replaying the entire graph.
19. A View must explain which attention focuses produced it.
20. Stable truth constrains Views, but remains scoped, sourced, and versioned.
21. No authoritative truth is degraded without evidence proportional to its authority.
22. Many cheap incorrect Views are acceptable when their rejection improves future triage.
23. Rejection in one context never grants universal falsehood.
24. Attention remains distributed but bounded, with minimum coverage for critical perspectives.
25. Frequency never substitutes for independent evidence.
26. Repetition may reinforce, narrow, extend, split, dispute, or supersede memory.
27. Dynamic equilibrium uses bands and hysteresis to avoid fixation and oscillation.
28. Every outcome must improve attention, links, applicability, or future View selection when a reusable signal exists.
29. Local memory may move continuously while global understanding changes only under proportional evidence.
30. A successful outcome never proves a causal explanation by itself.
31. Mirror learning requires external grounding and remains context-specific.
32. Reflective policy may guide future search but cannot become authoritative world knowledge.
33. Historical support and current applicability are separate quantities.
34. A single failure cannot erase a mature habit.
35. Inhibition precedes destructive unlearning whenever possible.
36. Every reversible unlearning action stores explicit recovery conditions.
37. Returning to unknown is valid when previous evidence no longer supports certainty.
38. Counterfactual exploration preserves the habitual path as a control.
39. Unlearning changes automatic influence, not historical truth.
40. Global revisions preserve superseded models and their provenance.
41. Complete semantic corruption is never downgraded to trailing-write recovery.
42. A lock may be removed only after owner liveness and owner identity are rechecked.
43. Snapshot sequences are published with exclusive create semantics and are immutable once valid.
44. Backup paths must be regular, non-overlapping files and snapshots must anchor to journal history.
45. A backup is verified in staging before it can replace runtime state.
46. Deterministic replay divergence makes the stream unsafe to write.
47. Hashes provide integrity evidence, not authenticity or proof against coordinated history rewriting.
48. Every generated failure must remain reproducible from its seed and minimized corpus case.
49. Lock removal claims and re-verifies the exact filesystem entry before deletion.
50. Transient filesystem sharing violations are retried without weakening ownership checks.
51. Persisted timestamps use one canonical UTC millisecond representation.
52. Persistence normalization and journal operations enforce explicit resource boundaries.
53. New private persistence artifacts request owner-only POSIX permissions.

## Status

`v0.7.1` is released with the Persistence Reliability Gauntlet. The current functional milestone is post-release adversarial hardening for a future v0.7.2 maintenance release: atomic lock retirement, Windows sharing-violation retries, nested concurrent-worker diagnostics, canonical timestamps, bounded persistence inputs, and private POSIX file modes. The package version remains `0.7.1` until a dedicated release PR.

See:

- [`docs/memory-v0.2-specification.md`](docs/memory-v0.2-specification.md)
- [`docs/memory-v0.3-specification.md`](docs/memory-v0.3-specification.md)
- [`docs/memory-v0.4-specification.md`](docs/memory-v0.4-specification.md)
- [`docs/memory-v0.5-specification.md`](docs/memory-v0.5-specification.md)
- [`docs/memory-v0.6-specification.md`](docs/memory-v0.6-specification.md)
- [`docs/memory-v0.7-specification.md`](docs/memory-v0.7-specification.md)
- [`docs/reliability-gauntlet.md`](docs/reliability-gauntlet.md)
- [`docs/operational-recovery.md`](docs/operational-recovery.md)
- [`docs/post-release-adversarial-hardening.md`](docs/post-release-adversarial-hardening.md)
- [`docs/global-understanding.md`](docs/global-understanding.md)
- [`docs/reflective-learning.md`](docs/reflective-learning.md)
- [`docs/adaptive-unlearning.md`](docs/adaptive-unlearning.md)
- [`docs/progressive-visions.md`](docs/progressive-visions.md)
- [`docs/epistemic-core.md`](docs/epistemic-core.md)
- [`docs/distributed-memory-attention.md`](docs/distributed-memory-attention.md)
- [`docs/retroactive-learning-loop.md`](docs/retroactive-learning-loop.md)
- [`docs/dynamic-equilibrium.md`](docs/dynamic-equilibrium.md)
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
