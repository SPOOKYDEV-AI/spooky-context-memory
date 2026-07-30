# Research Protocol

## Research question

Can hierarchical, task-scoped retrieval reduce irrelevant context and inappropriate reuse of historical fixes in AI coding agents?

## Conditions

### A. Global semantic retrieval

Search all memory nodes and rank by semantic similarity.

### B. Tree-scoped retrieval

Select project and workflow anchors, enforce path policies, then rank candidates.

### C. Hybrid retrieval

Use tree-scoped retrieval plus typed cross-links and incident applicability checks.

## Benchmark tasks

The initial benchmark should contain reproducible tasks across:

- debugging;
- feature implementation;
- dependency upgrades;
- database migrations;
- authentication and authorization;
- deployment configuration;
- PowerShell and Windows automation;
- React and TypeScript;
- Python and FastAPI.

## Metrics

- task completion rate;
- deterministic test success;
- irrelevant-context rate;
- wrong-fix reuse rate;
- number of retrieved nodes;
- input and output tokens;
- model calls;
- correction iterations;
- execution time;
- human interventions.

## Wrong-fix reuse

A wrong-fix reuse occurs when a historical resolution is applied despite at least one of the following:

- different task objective;
- incompatible project or workflow;
- incompatible environment;
- missing trigger condition;
- active exclusion condition;
- superseded resolution;
- stale validation evidence.

## Reproducibility

Every experiment should log:

- repository commit;
- task definition;
- model and configuration;
- memory snapshot;
- selected anchors;
- traversal policy;
- retrieved node IDs and scores;
- tool results;
- final patch;
- evaluation results.
