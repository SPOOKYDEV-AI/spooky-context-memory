# Experience Capsules

Experience capsules preserve a concrete trajectory without converting it into an unconditional rule.

## Lifecycle

```text
Raw interaction episode
        ↓
Contrastive analysis and claims
        ↓
Admission gate
        ↓
Candidate capsule
        ↓
Accepted user outcome + technical evidence
        ↓
Active capsule
```

## User validation

The user normally validates the final result:

```text
accepted / rejected / partially accepted / unknown
```

This does not automatically validate the inferred root cause or the general applicability of a correction.

`CapsuleUserApproval.scope` can explicitly record:

- `outcomeAccepted`;
- `reusableAsMemory`;
- optional root-cause acceptance;
- optional applicability acceptance.

The activation API does not require the user to provide a technical diagnosis.

## Claims

A compiled capsule contains candidate claims. The root-cause claim starts as `unverified`. Passing implementation evidence may support the resolution claim without proving the cause.

After activation, the outcome-fit claim is verified from the user verdict. Other claims retain their own evidence status.

## Unknown causes

`ExecutionTrace.rootCause` may be `null`. The compiler must not invent a cause to complete the capsule.

## Non-goals

A capsule does not:

- summarize an arbitrary conversation;
- become active after every successful response;
- represent a universal rule;
- replace pattern detection;
- force the complete episode into model context;
- contain private data in public fixtures.
