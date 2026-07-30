# Context Dynamics

## Context is a field

A conversation may contain several simultaneously relevant contexts. `ContextField` stores frames with activation, relevance, and inertia.

A frame normally evolves through:

```text
dominant
→ overlapping
→ background
→ dormant
```

Retention is tracked separately so a dormant frame may remain compacted or archived while still being reconstructable.

## Shift detection

Shift detection is deterministic in the public engine. It combines normalized topic terms, intent terms, and structural scope. Explicit user shifts override similarity.

The result is one of:

- continuation;
- overlap;
- new context;
- return to previous context.

## Inertia

Decay is progressive. Inertia prevents useful context from collapsing after one side topic. Pinned frames keep a minimum activation until their protection is explicitly removed and transfer is validated.

## Transition path

The system stores lightweight bridges between frames. This preserves conversational lineage without retaining the whole transcript in active memory.
