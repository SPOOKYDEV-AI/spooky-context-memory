# Architecture

## 1. Hierarchical ownership

Every node has one primary parent and one materialized path.

```text
/projects/spooky-council/workflows/debugging/incidents
```

The tree defines ownership, isolation, and inheritance.

## 2. Typed cross-links

A node can reference another branch through an explicitly typed link:

- `uses`
- `depends_on`
- `derived_from`
- `supersedes`
- `contradicts`
- `related_to`
- `validated_by`

Retrieval policies choose which link types may be traversed.

## 3. Context cone

Retrieval starts from trusted anchors. Allowed and denied path prefixes define the context cone. Search and ranking happen only inside that cone.

## 4. Best-first traversal

Best-first traversal prioritizes nodes using:

- semantic relevance supplied by an adapter;
- scope match;
- path proximity;
- confidence;
- freshness;
- source trust;
- status penalties.

The core package does not require an embedding provider.

## 5. Incident applicability

Historical incidents are matched against the current task using:

- intent;
- target;
- project;
- workflow;
- environment;
- trigger conditions;
- exclusion conditions;
- symptom similarity.

Matching an error message is not sufficient to apply a fix.

## 6. Storage

The current MVP includes an in-memory adapter. Planned adapters:

- SQLite;
- PostgreSQL;
- JSON Lines for portable experiments;
- optional vector indexes;
- optional graph-database adapters.

## 7. Safety boundaries

The memory engine provides context, not authority. Integrators should keep destructive actions behind deterministic policy checks and human approval.
