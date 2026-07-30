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

## Attention-Driven Retroactive Memory evaluation

The v0.5 protocol additionally compares:

7. Progressive Visions without distributed attention;
8. distributed attention with cross-View triage;
9. attention plus retroactive link and capsule refinement;
10. attention, retroaction, and dynamic equilibrium control.

Additional synthetic scenarios include:

- many cheap Views with only a few contextually correct paths;
- a rejected View that becomes valid after an explicit context change;
- a historically strong pattern contradicted by a new independent scope;
- a weak challenge against an authoritative source;
- an official scoped truth supersession;
- dominance oscillation between two plausible Views;
- high exploration debt hidden behind a confident dominant View;
- broad memory inspection with excessive final injection.

Additional metrics include:

- attention-role coverage and normalized diversity;
- attention concentration;
- active View yield;
- progressive-seed yield;
- rejected-View learning density;
- contradiction and truth-conflict discovery rates;
- revisit-block precision and recall;
- plastic-link verification and dispute rates;
- capsule narrowing and splitting precision;
- equilibrium correction load;
- critical exploration-debt rate;
- dominance-switch rate;
- final injection efficiency.

A system is not considered more intelligent merely because it generates more Views. It must reduce repeated useless exploration, preserve disagreement when evidence is incomplete, and improve future selection after observed outcomes.
