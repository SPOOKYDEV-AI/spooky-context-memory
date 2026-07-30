# Distributed Memory Attention

## Purpose

Memory does not become useful merely by growing. An agent must know where to look, how much budget to spend, which alternative perspectives to preserve, and when to move its attention.

A `MemoryAttentionField` is a bounded portfolio of `AttentionFocus` objects derived from the current context, stable truth anchors, unresolved questions, risks, contradictions, capsules, patterns, and transitions.

```text
Memory graph
    ↓
Attention candidates
    ↓
Deduplication and role coverage
    ↓
Bounded attention portfolio
    ↓
Several local Views
```

## Attention roles

The default roles are:

- `goal` — protects the actual result being pursued;
- `constraint` — protects invariants and forbidden effects;
- `uncertainty` — observes unknown or partially known areas;
- `experience` — searches capsules and patterns;
- `challenge` — seeks evidence against the dominant interpretation;
- `transition` — preserves how the situation changed;
- `risk` — estimates the cost of incorrect reuse;
- `exploration` — opens a deliberately novel perspective.

## Portfolio behavior

The allocator:

1. scores candidates by goal dependency, constraint importance, uncertainty, novelty, risk, information gain, predictive value, persistence, and urgency;
2. merges redundant focuses before budget allocation;
3. guarantees configured role coverage when possible;
4. keeps pinned focuses active;
5. selects a bounded active and background set;
6. grants dominance only when the score margin is meaningful;
7. decays stale unpinned focuses progressively;
8. reactivates dormant focuses after context or outcome signals.

## Two attention speeds

Persistent attention protects the initial need, key invariants, acceptance criteria, and critical risks.

Fast attention appears after a contradiction, unexpected result, phase transition, new event, or missing evidence. It can be intense but short-lived.

## Relationship with Views

One focus may generate several Views. Several focuses may converge on one View. The relationship is many-to-many.

```text
goal attention ───────┐
constraint attention ─┼→ View A
pattern attention ────┘

unknown attention ─────→ View B
challenge attention ───→ View C
```

A View must retain the attention identifiers that produced it so later feedback can reinforce or challenge the correct focus rather than globally changing memory.
