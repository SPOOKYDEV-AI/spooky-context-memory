# Epistemic Core

## Purpose

Dynamic attention and temporary Views require a stable reference layer. The `EpistemicCore` stores sourced, scoped, versioned truth anchors without treating them as timeless universal facts.

## States

```text
authoritative
verified
supported
observed
inferred
hypothetical
disputed
refuted
unknown
```

An observation can remain stable while its causal interpretation changes. A source-of-truth project specification can constrain Views without preventing a newer authoritative specification from superseding it.

## Authority-proportional challenge

A weak contradictory signal is recorded but does not automatically displace an authoritative anchor. Contradiction must be independent and proportional to the current authority.

```text
weak report
→ contradiction recorded
→ anchor remains active

independent official replacement
→ old anchor superseded
→ validity interval closed
→ new anchor activated
```

## Scope and time

Every truth anchor carries:

- memory scope;
- source identifiers;
- confidence and epistemic state;
- validity start and optional end;
- revision;
- contradiction identifiers;
- optional superseding anchor.

The model preserves historical truth instead of rewriting the past.
