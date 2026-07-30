# Security Policy

## Supported versions

Security fixes are currently applied to the latest minor release.

## Reporting a vulnerability

Do not create a public issue for a vulnerability that could place users at risk.

Contact the maintainer privately through the security-reporting method published on the GitHub repository profile. Include:

- affected version;
- reproducible steps;
- impact;
- suggested mitigation if available.

Never include API keys, private repository contents, personal data, or production credentials.

## Threat model

The project assumes that memory content can be incorrect, obsolete, malicious, or out of scope. Applications integrating this library should:

- validate provenance;
- enforce allow/deny path policies;
- isolate secrets from retrievable memory;
- use deterministic checks for high-risk actions;
- require human approval for destructive operations;
- treat model-generated claims as unverified until proven.
