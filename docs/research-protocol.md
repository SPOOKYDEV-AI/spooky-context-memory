# Research Protocol

## Research question

Can contextual capsules, recurring patterns, Visions, and preventive preflight reduce repeated agent errors without blocking valid solutions or inflating context?

## Compared systems

1. global semantic retrieval;
2. scope-limited semantic retrieval;
3. hierarchical retrieval with typed links;
4. capsules with applicability checks;
5. patterns plus Vision pruning and A* routing;
6. patterns plus Vision routing and compact preflight.

## Synthetic scenarios

The public benchmark should include:

- square requested, generic rectangle rejected;
- manual workflow requested, implicit trigger rejected;
- identical symptom with different causes;
- identical causal pattern across several domains;
- highly similar capsule in another project scope;
- forbidden-effect branch with high semantic similarity;
- active pattern with a counterexample;
- no applicable memory, requiring explicit exploration.

## Metrics

- precision and recall of injected capsules;
- wrong-fix reuse;
- repeated-known-error rate;
- context contamination;
- false-pruning rate;
- visited nodes;
- injected capsule count;
- estimated injected tokens;
- attempts until accepted user outcome;
- elapsed retrieval time.

## Safety criterion

A reduction in visited nodes is not a success when it increases false pruning. Efficiency and correctness must be measured together.

## Evidence independence

Repeated output from one run must share an independence key. Only the strongest item in a dependency group is used for confidence updates.

## Context Dynamics evaluation

The v0.3 research protocol adds:

- premature context-drop rate;
- context-bleed rate;
- transition-loss rate;
- invariant fidelity across phases;
- compaction ratio;
- information density;
- reconstructed-memory size versus transcript replay;
- false release decisions.

A system is not considered more efficient merely because it injects fewer characters. It must preserve the initial need and all discriminating constraints through validation.
