# Architecture

## Design objective

Spooky Context Memory reuses past experience while preserving epistemic boundaries, contextual continuity, alternative interpretations, and retroactive learning.

The complete pipeline is:

```text
Conversation stream
→ Context Dynamics
→ Situation and Context Contract
→ Episode and contrast analysis
→ Capsule accumulation and admission
→ Capsule and pattern memory
→ Epistemic Core
→ Distributed Memory Attention
→ Many cheap attention-driven Views
→ Cross-View triage
→ Progressive Vision ensemble
→ Local heuristic retrieval and backtracking
→ Selective reconstruction
→ Action or prediction
→ Outcome verdict
→ Retroactive memory plasticity
→ Dynamic equilibrium
```

## 1. Context Dynamics

A `ContextField` contains several progressively activated frames rather than one global current context. Frames carry topic, intent, scope, activation, relevance, inertia, retention state, provenance, and protection reasons.

## 2. Situational Memory

A `Situation` groups contexts serving one coherent objective. Its `ContextContract` protects the initial need, current goal, invariants, discriminators, forbidden effects, acceptance criteria, decisions, rejected trajectories, and unresolved questions across phases.

## 3. Episodes, claims, capsules, and patterns

Interaction episodes separate accepted, rejected, partial, and unknown outcomes. Contrast extraction proposes discriminators without inventing causes. Claims retain evidence and uncertainty. Capsules preserve scoped episodes; patterns preserve recurring mechanisms across independent contexts.

## 4. Context release and reconstruction

The `ContextReleaseGate` requires proof of transfer before context leaves the active working set. Reconstruction combines only the current task, applicable memory, relevant dormant context, transition paths, and unresolved checks. Inspected memory remains separate from injected memory.

## 5. Epistemic Core

The `EpistemicCore` stores truth anchors with source identifiers, state, confidence, scope, validity interval, revision, contradictions, and supersession.

Authority classes distinguish authoritative facts, verified results, supported claims, observations, inferences, hypotheses, disputes, refutations, and unknowns. Challenges must be proportional to authority.

## 6. Distributed Memory Attention

A `MemoryAttentionField` maintains bounded focuses for goals, constraints, uncertainty, experience, challenge, transition, risk, and exploration.

The allocator merges redundant focuses, protects pinned focuses, guarantees configured role coverage, assigns budgets, decays stale attention, and reactivates attention after context or outcome changes.

## 7. Attention-driven Views

An `AttentionView` records:

- the focuses that produced it;
- truth anchors and assumptions;
- candidate branches;
- questions covered;
- conclusions;
- expected cost and risk;
- evidence and contextual revisions.

Many candidate Views can be generated cheaply. Hard scope, forbidden-effect, and truth checks execute before ranking.

## 8. Cross-View triage

Triage merges redundant Views, qualifies rejected Views, preserves active and deferred alternatives, and emits:

- consensus;
- divergences;
- coverage gaps;
- one defeasible dominant View when justified;
- compact rejected traces;
- bounded progressive Vision seeds.

## 9. Progressive Vision routing

The `ProgressiveVisionEnsemble` explores selected local hypotheses with bounded beams, splitting, merging, checkpoints, loop guards, and backtracking. Pruning a Vision never deletes memory.

## 10. Retroactive learning

An observed outcome produces a qualified View verdict. The retroactive loop then:

- reinforces or challenges the attentions that generated the View;
- creates contradiction attention when necessary;
- records compact rejection and revisit conditions;
- updates only affected plastic links;
- proposes capsule reinforcement, narrowing, extension, splitting, or dispute;
- invalidates or reconsiders dependent Views.

## 11. Dynamic equilibrium

The controller monitors fidelity, constraint coverage, attention diversity, View diversity, challenge coverage, uncertainty coverage, exploration breadth and depth, injection efficiency, stability, plasticity, and exploration debt.

Bands and hysteresis prevent overreaction. Corrections are minimal and local.

## 12. Storage boundary

The semantic model remains storage-neutral. Public code contains deterministic algorithms and synthetic fixtures only. Real contexts, truths, attentions, Views, traces, links, capsules, patterns, and equilibrium snapshots belong in private runtime storage.
