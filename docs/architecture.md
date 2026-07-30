# Architecture

## Design objective

Spooky Context Memory is designed to reuse past experience without allowing old context to dominate a new task.

The engine separates eight responsibilities:

```text
Capture
→ Episode analysis
→ Contrast and causal claims
→ Admission
→ Capsule and pattern memory
→ Vision resolution
→ Heuristic retrieval
→ Preventive preflight
```

## 1. Capture and episodes

An `InteractionEpisode` groups attempts that answer the same user need. Each attempt contains the interpretation, actions, result fingerprint, technical evidence, and user verdict.

The user verdict answers only whether the produced result matched the desired outcome.

## 2. Contrastive analysis

Rejected and accepted attempts are compared deterministically. Differences are recorded as candidate discriminators. Stable relationships, such as two accepted numeric dimensions becoming equal after rejected attempts were unequal, can be surfaced as supported relational discriminators.

Contrast does not prove causality by itself.

## 3. Claims

Technical explanations are stored as claims:

- observation;
- outcome fit;
- hypothesis;
- root cause;
- resolution;
- applicability;
- contextual user preference.

Claims can be unverified, supported, verified, disputed, refuted, or stale. Independent evidence groups are counted once to avoid false confidence from duplicated test output.

## 4. Admission

The admission gate decides whether an episode should:

- create a candidate capsule;
- extend an existing pattern;
- remain a raw trace;
- request more evidence;
- be rejected as memory.

This prevents transient errors and unisolated changes from flooding active memory.

## 5. Capsules and patterns

An experience capsule preserves one concrete episode and its scope.

A pattern captures a recurring causal mechanism across multiple capsules. Patterns do not contain a universal technical fix. They contain warning signals, likely consequences, invariants, checks, and prohibited shortcuts.

Independent projects, workflows, and environments increase pattern support. Duplicate episodes in the same context do not count as fully independent evidence.

## 6. Visions

A Vision is an ephemeral or cached search plan generated from the current task signature and memory revision.

It contains:

- anchor branches;
- allowed branches;
- deterministic exclusions;
- deferred frontiers;
- likely pattern identifiers;
- traversal limits.

A Vision is resolved before graph routing. It does not store private business data in the public library.

## 7. Heuristic routing

The router uses an A*-style priority queue. The route cost combines:

- edge cost;
- scope uncertainty;
- low relevance;
- contamination risk;
- contradiction risk;
- weak evidence;
- unknown applicability conditions.

Hard exclusions are evaluated before the heuristic. A forbidden branch is ineligible rather than merely low-scoring.

The frontier can be cached so deferred paths are not forgotten and the graph does not need to be recalculated from zero after every failed hypothesis.

## 8. Belief updates

Hypothesis probabilities can be updated as evidence is encountered. Evidence sharing the same independence key is collapsed to the strongest item before the update. This avoids treating repeated output from one run as several independent proofs.

## 9. Memory Preflight

The final context compiler does not inject complete capsules. It emits a compact preventive contract:

```text
Must preserve
Known failure modes
Pruned approaches
Verify before acting
Unresolved unknowns
```

This is the only part intended for direct injection into an agent prompt by default.

## 10. Storage boundary

Persistence is intentionally postponed until the episode, claim, pattern, and Vision contracts stabilize. Future adapters should keep an append-only lifecycle and separate public engine code from private runtime data.
