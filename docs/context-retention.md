# Context Retention and Release

## Retention signals

Retention depends on:

- goal dependency;
- constraint importance;
- unresolved dependency;
- discriminating power;
- validation importance;
- reuse value;
- redundancy;
- resolution completeness.

Recency may be used by an integration, but it cannot override critical need or constraints.

## Release gate

A release decision distinguishes backgrounding, compaction, dormancy, archival, and deletion eligibility.

The gate blocks release when:

- the frame is pinned;
- active work still depends on it;
- no transfer destination exists;
- initial need, constraints, provenance, or uncertainty would be lost;
- accepted decisions were not preserved;
- deletion lacks a consolidated capsule.

The invariant is: **no eviction without proof of transfer**.
