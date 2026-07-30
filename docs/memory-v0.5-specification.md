# Memory v0.5 Specification — Attention-Driven Retroactive Memory

## Status

Development specification layered on top of the released v0.4.0 Progressive Vision foundation.

## Problem

A progressive Vision ensemble can explore several hypotheses, but it still needs a principled way to decide where those hypotheses originate, how multiple perspectives remain covered, how stable project truths constrain them, and how accepted or rejected outcomes change future retrieval.

A useful memory system MUST be allowed to generate many cheap incorrect Views. It MUST also learn why those Views were incorrect instead of either discarding all exploration or promoting frequency into truth.

## Required model

The engine MUST distinguish:

- an `EpistemicCore` containing sourced, scoped, versioned truth anchors;
- a `MemoryAttentionField` containing bounded points of attention;
- temporary `AttentionView` hypotheses generated from one or more focuses;
- a `CrossViewTriageResult` containing eligibility, consensus, divergence, gaps, and a bounded beam;
- a `RejectedViewLedger` containing compact rejection reasons and revisit conditions;
- a `PlasticMemoryGraph` containing revisable evidence-aware links;
- a `DynamicEquilibriumController` keeping fidelity, diversity, uncertainty, stability, and cost inside acceptable bands;
- a retroactive outcome loop that updates future attention, links, capsule refinement, and View eligibility.

## Epistemic rules

1. Facts, observations, inferences, and hypotheses MUST have different authority.
2. A View MUST NOT degrade an authoritative or verified truth without contradiction proportional to its authority.
3. Truth anchors MUST be scoped and versioned rather than treated as universal and timeless.
4. Supersession MUST preserve history and validity intervals.
5. A user outcome verdict validates result fit by default, not a technical root cause.

## Attention rules

1. Attention MUST be distributed but bounded.
2. Goal, constraint, uncertainty, and experiential perspectives SHOULD retain minimum coverage.
3. Contradictory attention MUST remain available when a dominant View is weakly supported or high-risk.
4. Redundant focuses MUST merge before receiving independent budgets.
5. Pinned attention MUST preserve the initial need and invariants.
6. Fast attention MAY appear after a new error, contradiction, transition, or outcome.
7. Attention MAY decay, become dormant, or reactivate with context changes.

## View rules

1. A View is a temporary interpretation, never authoritative memory.
2. Many candidate Views MAY be generated with small initial budgets.
3. Hard scope, forbidden-effect, and truth conflicts MUST execute before ranking.
4. Equivalent Views MUST merge; the redundant exploration SHOULD leave a compact trace.
5. Rejected Views MUST record a qualified verdict rather than a generic failure.
6. Rejection in one context MUST NOT imply universal falsehood.
7. A rejected View MAY be reconsidered when its semantic context or explicit revisit conditions change.
8. Only a bounded subset of Views MAY become progressive Vision seeds.

## Cross-View output

Triage SHOULD expose:

- consensus shared across sufficiently independent Views;
- divergences between competing interpretations;
- coverage gaps and critical unknowns;
- one defeasible dominant View when the margin is meaningful;
- active and deferred alternatives;
- rejected traces and their reusable discriminators.

## Plasticity rules

1. New outcomes MUST update only affected links and dependent Views.
2. Multiple events with the same independence key MUST count once.
3. Repetition MAY reinforce, narrow, extend, split, dispute, or supersede a capsule.
4. Frequency alone MUST NOT grant truth.
5. Contradictions MUST improve applicability boundaries rather than erase history.
6. Pruning a View MUST NOT delete the underlying memory.

## Dynamic equilibrium

The engine MUST continuously observe at least:

- fidelity to the current and initial goals;
- constraint coverage;
- attention and View diversity;
- contradictory and uncertainty coverage;
- exploration breadth and depth;
- inspected-memory versus injected-memory cost;
- dominance stability;
- memory plasticity;
- critical exploration debt.

Control SHOULD use bands and hysteresis rather than one exact target. Corrections SHOULD be local, reversible, and minimal.

## Retroactive cycle

```text
context and truth revisions
→ distribute attention
→ generate many cheap Views
→ hard triage
→ compare consensus, divergence, and gaps
→ promote a bounded progressive beam
→ act or predict
→ observe the outcome
→ qualify the View verdict
→ update attention and plastic links
→ refine capsules and patterns
→ invalidate dependent Views
→ regenerate better Views
```

## Persistence boundary

The v0.5 semantic model remains storage-neutral. Durable persistence remains a later milestone so the journal schema does not freeze an attention or retroaction model before evaluation hardening.
