# Memory v0.3 Specification

## Purpose

The v0.3 foundation models how a live conversation becomes reusable experience without either retaining every raw turn or dropping the initial need too early.

## Primary model

```text
Context flow
→ Situation
→ Protected contract
→ Capsule accumulation
→ Verified transfer
→ Context release
→ Persistent memory
→ Selective reconstruction
```

## Required invariants

1. A new topic does not instantly erase the previous context.
2. Context age does not determine retention by itself.
3. Initial need, invariants, forbidden effects, and acceptance criteria survive every phase.
4. Phase changes produce explicit handoffs.
5. Capsule accumulation does not activate memory automatically.
6. Context release requires proof of transfer.
7. Permanent deletion requires consolidated persistent memory.
8. Transition paths remain reconstructable after compaction.
9. Persistent memory is selectively reconstructed rather than replayed wholesale.
10. Vision updates reevaluate affected branches only.

## Public data rule

All fixtures use synthetic contexts and projects. Runtime context frames, transition paths, situations, accumulators, and reconstructed user memory remain private.
