# Progressive Vision Ensemble

## Purpose

A single broad Vision can preserve the wrong interpretation for too long, repeatedly revisit the same branches, and obscure useful alternatives. The Progressive Vision Ensemble replaces one global search plan with several short-lived micro-Visions.

```text
Context delta
→ revalidate existing micro-Visions
→ prune invalid hypotheses
→ spawn or split missing hypotheses
→ explore each Vision with a small budget
→ merge equivalent Visions
→ keep a bounded beam
→ deepen the dominant Vision
→ backtrack when needed
```

A micro-Vision is a temporary hypothesis about which local part of memory may help the current situation. Memory remains persistent; the search views are disposable.

## Lifecycle

A progressive Vision can be:

- `candidate` — created but not yet selected by the beam;
- `exploring` — actively receiving a bounded search budget;
- `dominant` — the current best search hypothesis;
- `deferred` — plausible but outside the active beam or missing context support;
- `pruned` — structurally invalid, contradicted, stale, or empty;
- `exhausted` — its frontier is empty after exploration;
- `superseded` — dominated or merged into a better equivalent Vision.

Dominance never turns a Vision into truth. It only assigns more exploration budget.

## Context coupling

Each Vision records the context revision and context-frame anchors that justified its creation. When context changes, the engine:

1. preserves Visions whose anchors remain active;
2. progressively penalizes Visions whose anchors become dormant;
3. prunes Visions that remain stale beyond policy;
4. accepts new seeds for newly introduced hypotheses;
5. reranks the beam using new evidence and contradictions.

A context revision can therefore make an old Vision invalid without deleting the memory branches it referenced.

## Beam control

The beam keeps only a bounded number of active and deferred Visions. Ranking combines:

- prior utility;
- structural confidence from hard-scoped Memory Vision resolution;
- independent supporting evidence;
- question coverage;
- novelty;
- contradiction penalty;
- exploration cost.

A Vision dominates another when it covers the same branches with a meaningfully better score, no greater contradiction, and no greater cost. Dominated Visions become `superseded`.

## Splitting and merging

A broad seed is split when it contains more branches than the configured micro-Vision budget. Children inherit the parent lineage and explore smaller branch groups independently.

Equivalent Visions are merged when they share the same normalized hypothesis, branch set, and scope. Evidence, checkpoints, frontiers, visited nodes, and lineage are combined without exploring duplicates twice.

## Checkpoints and backtracking

Before applying a deeper exploration observation, the manager emits a `VisionCheckpoint` containing:

- context revision;
- depth;
- visited nodes;
- frontier nodes;
- injected items;
- unresolved questions;
- current score.

If a branch reaches a contradiction or dead end, `backtrackProgressiveVision` restores the previous frontier instead of restarting from the graph root or replaying the full transcript.

## Loop prevention

`VisionLoopGuard` fingerprints an exploration state from:

- Vision identifier;
- semantic context fingerprint and revision;
- current node;
- unresolved questions;
- active constraints.

A revisit is allowed when the semantic context fingerprint changes, independent evidence changes, or measurable progress exceeds policy. A raw turn counter alone is not treated as a meaningful context change. Repeated states without progress are blocked after a bounded allowance.

Returning to the same memory with new context is not a loop. Returning with the same context, evidence, questions, and cost is.

## Evaluation

The v0.4 metrics cover:

- active-beam utilization;
- Vision elimination rate;
- loop-block rate;
- revisit efficiency;
- injection efficiency;
- unresolved-question coverage;
- wrong-fix reuse;
- false pruning;
- context bleed;
- transition loss;
- selection precision and recall.

All public fixtures remain synthetic. Real Vision ensembles and checkpoints belong in private runtime storage.
