# Public Release Checklist

## Before every public push

- [ ] Run `npm run check`.
- [ ] Confirm GitHub Actions passes.
- [ ] Search for secrets, private paths, customer names, employer names, private repository identifiers, and real user traces.
- [ ] Confirm every example and benchmark fixture is synthetic.
- [ ] Confirm `.context-memory/private/` and private database or JSON artifacts are ignored.
- [ ] Run caller-specific `assertPublicData` checks on exported fixtures.
- [ ] Verify no real Capsule, Pattern, or Vision is present.

## Architecture checks

- [ ] User outcome approval is not described as technical root-cause approval.
- [ ] Unknown causes remain nullable or explicitly unknown.
- [ ] Hard scope and forbidden-effect exclusions run before heuristic scoring.
- [ ] Dependent evidence shares an independence key.
- [ ] Pattern support reports independent contexts.
- [ ] Visited memory and injected memory are measured separately.
- [ ] False pruning is included in retrieval evaluation.

## Release checks

- [ ] Update the roadmap and changelog summary.
- [ ] Keep the package lock synchronized when dependencies or package metadata require it.
- [ ] Create a pull request for major changes.
- [ ] Review changed files before merge.
- [ ] Create a version tag only after the merged `main` branch passes CI.

## Synthetic benchmark minimum

- [ ] accepted/rejected contrast;
- [ ] highly similar forbidden branch;
- [ ] same symptom with different causes;
- [ ] same causal pattern across different artificial scopes;
- [ ] unknown case with no applicable memory;
- [ ] active pattern with a counterexample.
