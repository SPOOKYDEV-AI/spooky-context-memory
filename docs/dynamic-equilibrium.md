# Dynamic Memory Equilibrium

## Purpose

The memory system never reaches one permanently optimal state while a situation remains open. It continuously maintains a moving equilibrium between fidelity, diversity, stability, uncertainty, depth, breadth, plasticity, and cost.

## Control bands

Each monitored dimension has:

```text
minimum
→ target low
→ target high
→ maximum
```

The controller acts when a dimension leaves its acceptable band. It does not react to every minor fluctuation.

## Hysteresis and oscillation

A dominant View needs a meaningful margin to replace another View. Repeated A/B/A/B dominance changes trigger deferral and targeted evidence collection instead of continued ping-pong.

## Exploration debt

Critical questions with low coverage and high risk create exploration debt. The controller can request evidence and freeze consolidation until that debt is covered.

## Minimal corrections

Possible actions include:

- deepen a View;
- spawn an alternative;
- defer or prune a View;
- backtrack;
- reactivate or decay attention;
- pin an invariant;
- reduce final injection;
- expand exploration;
- request evidence;
- freeze consolidation;
- maintain the current state.

Corrections are local and reversible whenever possible.
