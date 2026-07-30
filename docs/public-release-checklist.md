# Public Release Checklist

## Repository setup

- [ ] Create a public GitHub repository named `spooky-context-memory`
- [ ] Push the complete repository
- [ ] Keep the default branch named `main`
- [ ] Enable Issues
- [ ] Enable Discussions if you plan to collect design proposals
- [ ] Add repository topics:
  - `ai-agents`
  - `agent-memory`
  - `typescript`
  - `context-engineering`
  - `rag`
  - `software-engineering`
  - `incident-management`
- [ ] Add the description:
  `Scope-aware hierarchical memory and incident retrieval for reliable AI coding agents.`

## Verification

- [ ] Run `npm install`
- [ ] Run `npm run check`
- [ ] Verify GitHub Actions passes
- [ ] Run the incident applicability example
- [ ] Confirm no secrets or professional data are included
- [ ] Confirm the LICENSE contains the correct maintainer name

## First release

- [ ] Create tag `v0.1.0`
- [ ] Publish GitHub Release `v0.1.0 — Public MVP`
- [ ] Describe implemented features and known limitations
- [ ] Add at least three roadmap issues
- [ ] Add one benchmark-design issue
- [ ] Add one storage-adapter issue
- [ ] Add one agent-integration issue

## Credibility signals

- [ ] Keep commits small and descriptive
- [ ] Use pull requests even as the sole maintainer for major changes
- [ ] Link issues to pull requests
- [ ] Publish deterministic benchmark fixtures
- [ ] Document failed experiments honestly
- [ ] Avoid artificial stars, fake users, fake collaborators, or generated activity
- [ ] Invite real technical review from developer communities

## Suggested first issues

1. `feat: add SQLite storage adapter`
2. `research: implement global semantic retrieval baseline`
3. `benchmark: define wrong-fix reuse fixtures`
4. `feat: add JSONL snapshot import/export`
5. `integration: add OpenAI Agents SDK example`
6. `security: add memory poisoning threat-model fixtures`

## When to submit the application

The form is reviewed on a rolling basis. The application becomes stronger once the repository shows:

- a working public release;
- passing CI;
- several meaningful commits;
- issues and roadmap activity;
- at least one reproducible benchmark or integration;
- preferably some genuine external interest or use.

You may apply earlier, but do not present a brand-new repository as widely adopted.
