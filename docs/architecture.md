# Architecture

## Design objective

Spooky Context Memory reuses past experience while preserving epistemic boundaries, contextual continuity, alternative interpretations, reflective learning, and reversible unlearning.

```text
Conversation stream
→ Context Dynamics
→ Situation and Context Contract
→ Episode and contrast analysis
→ Capsule accumulation and admission
→ Capsule and pattern memory
→ Epistemic Core
→ Global Understanding and semantic backbone
→ Distributed Memory Attention
→ Many cheap attention-driven Views
→ Cross-View triage
→ Progressive Vision ensemble
→ Local retrieval and backtracking
→ Selective reconstruction
→ Action or prediction
→ Outcome verdict
→ World learning and retroactive plasticity
→ Reflective learning from the cognitive trajectory
→ Habit monitoring and adaptive unlearning
→ Global revision gate
→ Next context cycle
```

## 1. Context Dynamics

A `ContextField` contains progressively activated frames with topic, intent, scope, activation, relevance, inertia, retention state, provenance, and protection reasons. Context is the key for applicability, learning, reflection, unlearning, and recovery.

## 2. Situational Memory

A `Situation` groups contexts serving one coherent objective. Its `ContextContract` protects the initial need, current goal, invariants, discriminators, forbidden effects, acceptance criteria, decisions, rejected trajectories, and unresolved questions across phases.

## 3. Episodes, claims, capsules, and patterns

Episodes separate accepted, rejected, partial, and unknown outcomes. Claims retain evidence and uncertainty. Capsules preserve scoped episodes; patterns preserve recurring mechanisms across independent contexts.

## 4. Context release and reconstruction

The `ContextReleaseGate` requires proof of transfer before context leaves the active working set. Inspected memory remains separate from injected memory.

## 5. Epistemic Core

The `EpistemicCore` stores sourced, scoped, versioned truth anchors. Challenges must be proportional to authority. Supersession preserves history.

## 6. Global Understanding

`GlobalUnderstandingState` contains one dominant model and optional alternatives. A model preserves identity, primary goal, current situation, invariants, truths, core patterns, claims, unresolved questions, and semantic-backbone edges.

The `Global Revision Gate` separates local revision from global replacement. Attention and Views may move rapidly; global understanding changes only after independent structural pressure or a clearly superior alternative model.

## 7. Distributed Memory Attention

`MemoryAttentionField` maintains bounded focuses for goals, constraints, uncertainty, experience, challenge, transition, risk, exploration, reflection, and dehabituation.

## 8. Attention-driven Views and triage

Many cheap candidate Views can be generated. Hard scope, forbidden-effect, and truth checks execute before ranking. Triage exposes consensus, divergence, coverage gaps, rejected traces, and progressive Vision seeds.

## 9. Progressive Vision routing

The `ProgressiveVisionEnsemble` explores selected local hypotheses with bounded beams, splitting, merging, checkpoints, loop guards, and backtracking. Pruning never deletes memory.

## 10. World learning and retroaction

Observed outcomes update attentions, rejected-View traces, plastic links, capsule-refinement plans, and dependent View validity.

## 11. Reflective Memory Engine

`CognitiveTrajectory` records how attention, Views, verification, action, and outcome interacted. `ViewSuccessAnalysis` separates outcome, prediction, cause, and efficiency.

Grounded repeated trajectories form `ReflectiveCapsule` objects and contextual `CognitivePolicyProfile` objects. The self-bias monitor detects experience overuse, contradiction neglect, dominant-View inertia, confirmation bias, novelty neglect, outcome-cause conflation, and over-injection.

## 12. Adaptive Unlearning

`CognitiveHabit` tracks historical support separately from current applicability. The engine evaluates context drift, independent failures, truth supersession, overactivation, and superior strategies.

Unlearning may challenge, inhibit, narrow, weaken, quarantine, supersede, reopen unknown, or coordinate relearning. Counterfactual Views preserve the habitual path as a control. Recovery conditions make inhibition reversible.

## 13. Dynamic equilibrium

The controller monitors fidelity, constraint coverage, attention and View diversity, challenge coverage, uncertainty, exploration breadth and depth, injection efficiency, stability, plasticity, and exploration debt.

## 14. Adaptive evolution cycle

`completeAdaptiveMemoryEvolution` composes:

1. retroactive world learning;
2. reflective trajectory learning;
3. contextual habit evaluation and unlearning;
4. global-understanding revision;
5. bounded guidance for the next context cycle.

## 15. Storage boundary

The semantic model remains storage-neutral. Public code contains deterministic algorithms and synthetic fixtures only. Real contexts, truths, Views, cognitive trajectories, habits, and recovery records belong in private runtime storage.

## 16. Persistent adaptive memory

v0.7 adds a storage-neutral durability layer around the adaptive evolution cycle.

```text
Adaptive cycle result
→ compact domain event
→ append-only hash chain
→ deterministic projection
→ verified snapshot
→ replay after restart
```

`EventJournal` and `SnapshotStore` are the adapter boundaries. The reference implementations use JSONL files and atomic JSON snapshots so Node.js 20 remains supported without native runtime dependencies.

The persisted journal keeps the temporal explanation of change. The durable state is a projection, and snapshots are replay accelerators. Neither state projections nor snapshots may silently rewrite the journal.

### Integrity

Each event contains a payload hash, previous-event hash, and complete event hash. Replay verifies the full chain before applying any reducer. Snapshots contain a state hash, full snapshot hash, represented sequence, and represented event hash.

### Concurrency

Writes use expected sequence checks. A stale writer receives an optimistic-concurrency failure rather than overwriting a newer state. The reference file adapter serializes writes per stream and uses a lock file for cross-process single-writer coordination.

### Migration

Stored events remain immutable. Sequential migrations project old payloads and snapshots into the current schema during replay.

### Recovery and compaction

Only trailing corruption can be truncated automatically, and only through an explicit recovery call. Logical compaction creates and retains verified snapshots while preserving event history. Physical event archival remains a separate controlled operation.

### Cognitive boundary

The persistence layer stores durable learning artifacts and compact adaptive-cycle results. Temporary Views, beam frontiers, and prompt injections remain disposable unless a separate policy explicitly promotes them into durable evidence or learning traces.
