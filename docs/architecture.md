# Architecture

## Design objective

Spooky Context Memory reuses past experience without allowing old context to dominate a new task or disappear before its useful value has been transferred.

The complete pipeline is:

```text
Conversation stream
→ Context Dynamics
→ Situation and Context Contract
→ Episode and contrast analysis
→ Capsule accumulation and admission
→ Capsule and pattern memory
→ Context release
→ Progressive Vision ensemble
→ Local heuristic retrieval and backtracking
→ Selective reconstruction
→ Preventive preflight
```

## 1. Context Dynamics

The conversation is represented as a `ContextField`, not one global `currentContext`.

Each `ContextFrame` contains:

- topic and intent;
- scope;
- activation and relevance;
- inertia;
- activation state;
- retention state;
- context parents and source turns;
- protected reasons.

A context can be dominant, overlapping, background, or dormant. A new explicit topic shift boosts a new frame while older frames decay progressively according to inertia. Pinned frames retain a minimum active trace.

## 2. Context transitions

`ContextTransition` records how the discussion moved from one context to another. The transition path supports questions such as “How did we arrive here?” without replaying the full transcript.

Supported triggers include continuation, explicit topic change, association, clarification, digression, return to previous context, and new event.

## 3. Situational Memory

A `Situation` groups context frames and transitions serving one coherent objective. It moves through exploration, convergence, implementation, validation, and closed phases.

Its `ContextContract` preserves:

- initial need;
- current goal;
- invariants;
- discriminating properties;
- forbidden effects;
- acceptance criteria;
- accepted decisions;
- rejected trajectories;
- unresolved questions.

A `PhaseHandoff` records which frames remain active, compacted, or dormant. Context quantity can decrease while task fidelity remains constant.

## 4. Capsule accumulation

A `CapsuleAccumulator` collects reusable information while the situation is unfolding. It computes completeness, stability, and reusable value.

The accumulator may become ready but never automatically creates active knowledge. Admission, evidence, user validation, and capsule lifecycle controls still apply.

## 5. Context release

The `ContextReleaseGate` separates release from deletion.

Possible retention states are:

```text
pinned
→ active
→ background
→ compacted
→ dormant
→ archived
→ eligible_for_deletion
```

Release requires proof that need, constraints, decisions, provenance, uncertainty, and useful failed trajectories have been transferred. Active dependencies or pinned status block release.

## 6. Episodes and contrast

An `InteractionEpisode` groups attempts answering the same user need. Rejected and accepted results are compared deterministically. Differences become candidate discriminating properties, not automatic causal truths.

## 7. Claims and admission

Technical explanations are stored as evidence-aware claims. The admission gate chooses between candidate capsule, pattern extension, raw trace, more evidence, or rejection.

## 8. Capsules and patterns

Capsules preserve concrete scoped episodes. Patterns preserve recurring causal mechanisms across independent contexts. Pattern support counts independent projects, workflows, and environments rather than duplicated output.

## 9. Visions

A Vision is a contextual search plan containing anchors, allowed branches, deterministic exclusions, deferred frontiers, likely patterns, and traversal budgets.

`updateMemoryVision` reevaluates only affected branches while preserving unaffected routing work. Context frame identifiers can become anchors without rescoring every branch.

## 10. Progressive Vision routing

One broad Vision is no longer required to carry the complete search interpretation. A `ProgressiveVisionEnsemble` maintains several bounded micro-Visions tied to the current context revision.

The manager can:

- spawn new hypotheses;
- split broad branch sets;
- merge equivalent Visions;
- supersede dominated Visions;
- prune contradicted or context-stale Visions;
- retain one dominant and several alternative Visions;
- emit checkpoints before deeper exploration;
- backtrack to a previous frontier;
- block circular states without new progress.

A dominant Vision receives more budget but remains defeasible.

## 11. Heuristic routing

The A*-style router explores only the Vision-approved subgraph. Hard exclusions execute before heuristic scoring. Deferred frontiers can be cached.

## 12. Selective reconstruction

A persistent capsule is stored evidence. A remembered context is a new reconstruction for the present task.

The reconstructor combines:

- current task constraints;
- relevant context frames;
- applicable active capsules;
- supported patterns;
- transition paths;
- unresolved applicability conditions.

The output is bounded and excludes raw transcript by default.

## 13. Context efficiency

Performance is measured by more than token reduction. Phase metrics include:

- fidelity to preserved invariants;
- information density;
- compaction ratio;
- phase intensity.

The goal is stable task fidelity with progressively denser context.

## 14. Storage boundary

Persistent adapters remain a later milestone. Public code contains algorithms and synthetic fixtures only. Real contexts, transitions, situations, accumulators, capsules, patterns, and Visions belong in private runtime storage.
