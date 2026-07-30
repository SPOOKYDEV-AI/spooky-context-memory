# Contributing

Thank you for helping improve Spooky Context Memory.

## Development

```bash
npm install
npm run check
```

## Pull requests

A pull request should:

- explain the problem being solved;
- include or update tests;
- preserve strict TypeScript typing;
- avoid coupling the core to a specific LLM provider;
- document any change to retrieval or applicability behavior;
- avoid adding hidden network calls or telemetry.

## Incident fixtures

When contributing an incident fixture, include:

- original task objective;
- project and workflow scope;
- trigger conditions;
- observed symptom;
- root cause;
- failed attempts;
- resolution;
- deterministic validation evidence;
- applicability and exclusion conditions.

Do not include secrets, personal information, private source code, or unresolved third-party vulnerabilities.
