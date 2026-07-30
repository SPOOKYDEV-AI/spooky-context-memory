# Memory Semantics v0.2

## Objective

The v0.2 foundation turns contextual incident memory into a preventive experiential system.

## Fundamental invariants

1. The user verdict validates outcome fit, not technical causality.
2. A root cause may remain unknown.
3. Contrastive changes are candidate discriminators until supported.
4. Capsules store episodes; patterns store recurring mechanisms.
5. Similarity never grants authority.
6. Forbidden branches are removed before heuristic scoring.
7. Dependent evidence is not counted several times.
8. Inspecting memory does not imply injecting it.
9. Search stops when enough applicable evidence is found or the budget is exhausted.
10. Runtime memory remains private.

## Knowledge states

Current knowledge can be:

- known: an applicable capsule or active pattern has sufficient evidence;
- partially known: diagnostic references exist but important conditions differ;
- unknown: no sufficiently applicable memory exists.

Unknown must remain visible to the agent so exploration is explicit rather than disguised as certainty.

## Learning cycle

```text
Preflight known risks
→ identify unknown frontier
→ explore targeted alternatives
→ receive user outcome verdict
→ compare rejected and accepted attempts
→ create or refine claims
→ admission assessment
→ create capsule or reinforce pattern
→ invalidate impacted Visions
```

An exploration is useful when it reduces uncertainty, narrows a boundary, contradicts an old assumption, or identifies a reusable mechanism. Otherwise it remains a raw trace.

## Pattern consolidation

A pattern may aggregate many capsules, but supporting references remain auditable. The engine should not emit one new pattern for every repeated incident.

## Search strategy

The current public implementation uses:

- deterministic Vision branch assessment;
- a binary-heap A* router;
- explicit traversal budgets;
- evidence-group-aware belief updates;
- early candidate collection;
- compact preflight compilation.

Future benchmark work must measure false pruning as seriously as contamination and wrong-fix reuse.
