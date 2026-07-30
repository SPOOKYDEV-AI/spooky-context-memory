# Reflective Learning

The memory learns from the world and from its own cognitive trajectories.

```text
World learning
Context → View → action → observed outcome → memory update

Mirror learning
Attention → Views → triage → validation path → outcome → cognitive policy update
```

## Cognitive trajectories

A `CognitiveTrajectory` records:

- the context fingerprint and discriminators;
- attention roles, weights, and statuses;
- generated, active, selected, and rejected Views;
- verification steps;
- expected and actual outcomes;
- the View verdict;
- explicit causal-validation state;
- external grounding keys;
- visited and injected memory cost;
- duration and independent outcome key.

The trajectory allows the engine to learn not only which View worked, but how it was produced and verified.

## Four distinct success dimensions

A successful action does not automatically validate its explanation.

`ViewSuccessAnalysis` separates:

- outcome fit: did the result satisfy the goal?
- prediction fit: did the expected result match observation?
- causal fit: was the claimed mechanism tested?
- strategy efficiency: how much exploration and injection were required?

```text
Outcome success ≠ causal proof
```

A View may be operationally useful while its causal explanation remains unknown.

## Mirror Validation Gate

Reflective learning requires external grounding such as:

- an observable result;
- a reproducible test;
- a trusted source;
- a user verdict;
- an independently confirmed prediction.

Pure internal agreement between Views cannot become authoritative knowledge.

## Reflective capsules

Repeated grounded trajectories can form a `ReflectiveCapsule` containing:

- context discriminators;
- successful attention distribution and sequencing;
- useful View combinations;
- required contradictory coverage;
- preferred breadth and depth;
- injection limits;
- validation requirements;
- independent successes and failures.

Reflective capsules teach the system how to look, not merely what conclusion to repeat.

## Cognitive policy adaptation

A contextual `CognitivePolicyProfile` can adapt:

- attention-role weights;
- minimum alternative Views;
- contradiction budget;
- exploration breadth and depth;
- visited and injected memory limits.

Policies remain contextual. A debugging strategy must not become a universal reasoning style.

## Self-bias monitoring

The mirror detects:

- confirmation bias;
- experience overuse;
- dominant-View inertia;
- contradiction neglect;
- novelty neglect;
- outcome-cause conflation;
- memory over-injection.

Bias signals modify future policy but do not rewrite world knowledge by themselves.
