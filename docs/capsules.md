# Experience Capsules

Experience capsules preserve **why** a technical correction was made without turning a local fix into a universal rule.

## Three-layer model

```text
Raw execution trace
        ↓
Candidate experience capsule
        ↓
Explicit user approval + passing evidence
        ↓
Active capsule
```

The compiler is deterministic. It does not call an LLM and does not invent missing causes, resolutions, or applicability conditions.

## Candidate compilation

`compileCapsuleCandidate` preserves:

- the original intent, target, expected outcome, constraints, and forbidden effects;
- plans and decisions;
- errors and their actors;
- failed attempts;
- rejected hypotheses;
- the diagnosed root cause;
- the final resolution and its rationale;
- preserved invariants, trade-offs, and risks;
- required and exclusion conditions;
- compatible environments;
- validation evidence.

A compiled capsule always starts with:

```ts
{
  lifecycle: {
    status: "candidate",
    activatedAt: null
  },
  validation: {
    userApproval: null
  }
}
```

## Controlled activation

`activateCapsule` is an explicit operation. By default, it requires:

1. an approval object with `approved: true`;
2. at least one passing evidence item;
3. every attached evidence item to pass.

The original candidate object is not mutated. Activation returns a new object.

```ts
const active = activateCapsule(candidate, {
  approval: {
    approved: true,
    approvedBy: "maintainer",
    approvedAt: new Date().toISOString(),
  },
});
```

Applications should persist candidate and active capsules separately or keep an append-only lifecycle journal.

## Why activation is separate

A model can propose a useful memory but cannot decide alone that the memory is true, current, or reusable. The user validates that the resolution satisfies the initial need, while deterministic evidence validates the implementation.

## Non-goals

The Capsule Compiler does not:

- summarize arbitrary conversations automatically;
- activate memories after a model response;
- generalize a project-specific fix into a shared rule;
- persist capsules;
- decide which capsule should be retrieved for a future task.

Those responsibilities belong to ingestion, storage, retrieval, and human-governance layers.
