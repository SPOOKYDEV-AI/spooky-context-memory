# Memory Visions

A Vision is a contextual view of the memory graph created before expensive exploration.

## Purpose

The engine should not traverse every capsule and pattern for every request. Current context first determines which memory branches are worth visiting.

```text
Task signature
→ scope and forbidden effects
→ branch assessment
→ Vision
→ A* routing
→ compact preflight
```

## Branch states

A branch may be:

- queued;
- visited;
- pruned;
- deferred;
- exhausted.

Pruning is contextual. A branch excluded for one Vision is not deleted from the global graph.

## Deterministic exclusions

The current implementation excludes a branch before heuristic routing when:

- it belongs to another non-shared project scope;
- it predicts a forbidden effect;
- it is backed by contradicted knowledge.

Missing constraints create uncertainty and may defer a branch rather than permanently exclude it.

## Traversal budget

A Vision limits:

- visited nodes;
- candidate capsules;
- injected capsules;
- scope distance;
- unknown conditions;
- elapsed search time.

Visited memory and injected memory must remain separate. A system may inspect fifty nodes and inject only two preventive summaries.

## Cache and invalidation

A Vision is keyed by task-signature hash and memory revision. It must be invalidated when relevant branches, patterns, contradictions, or the memory revision change.

## Privacy

This public project provides only generic Vision contracts and synthetic examples. Real project Visions belong to a private runtime store.

## Incremental updates from context flow

A context shift should not force a full Vision rebuild. `updateMemoryVision` reevaluates only caller-supplied affected branches, preserves unaffected frontiers and exclusions, and adds high-activation context frames as anchors.

The caller remains responsible for identifying affected branches. The public engine never infers authorization from semantic similarity alone.
