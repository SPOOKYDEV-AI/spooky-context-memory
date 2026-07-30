# Memory v0.4 Specification — Progressive Vision Routing and Evaluation

## Status

Development specification layered on top of the released v0.3.0 Context Dynamics foundation.

## Problem

A single global Vision can become too broad, preserve a stale interpretation, repeatedly visit the same memory state, and hide alternative explanations. Global rescoring on every context change is also unnecessarily expensive.

## Required model

The engine MUST support several bounded micro-Visions for one situation. Each micro-Vision MUST be treated as a temporary search hypothesis rather than authoritative memory.

A progressive Vision MUST record:

- hypothesis and lineage;
- context and memory revisions;
- scope and context anchors;
- branch set;
- unresolved questions;
- visited and frontier nodes;
- injected items;
- independent support and contradiction evidence;
- cost, coverage, novelty, and confidence scores;
- lifecycle status and budget.

## Hard rules

1. Hard scope and forbidden-effect exclusions MUST execute before beam ranking.
2. A dominant Vision MUST remain defeasible.
3. Equivalent Visions MUST NOT consume independent exploration budgets.
4. Broad Visions SHOULD be split into bounded branch groups.
5. Context-stale Visions MUST decay and eventually be pruned according to policy.
6. Checkpoints MUST be created before deeper exploration is applied.
7. Backtracking MUST restore a checkpoint rather than replaying the graph from its root.
8. Repeated states without new context, evidence, or progress MUST be bounded.
9. Memory visited by a Vision MUST remain distinct from memory injected into the agent.
10. Pruning a Vision MUST NOT delete the underlying memory.

## Progressive cycle

```text
context delta
→ revalidate
→ hard prune
→ spawn or split
→ short exploration
→ checkpoint
→ merge duplicates
→ remove dominated Visions
→ select bounded beam
→ deepen dominant Vision
→ backtrack or defer
→ reconstruct minimal memory
```

## Evidence handling

Evidence MUST be grouped by independence key. Within one independence group, only the strongest item of each evidence kind contributes to support, contradiction, or novelty scores.

## Loop rule

The same exploration state MAY be revisited when:

- the semantic context fingerprint changed;
- evidence fingerprint changed;
- progress exceeded the configured minimum.

Otherwise the loop guard MUST block the state after the configured revisit allowance.

## Evaluation targets

Implementations SHOULD report:

- beam utilization;
- elimination and supersession rates;
- loop and revisit efficiency;
- injection efficiency;
- question coverage;
- wrong-fix reuse rate;
- false-pruning rate;
- context-bleed rate;
- transition-loss rate;
- Vision selection precision and recall.

## Persistence boundary

The semantic model remains storage-neutral in v0.4. SQLite and lifecycle journaling remain a later milestone so persistence does not freeze an unstable search model.
