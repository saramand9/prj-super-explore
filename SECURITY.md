# Security policy

## Reporting a vulnerability

Do not publish exploit details, credentials, private paths or sensitive logs in
issues or pull requests.

Private vulnerability reporting is not yet available for this private repository.
Before public launch, the maintainer must configure a private reporting channel
and verify it with an external account. Once enabled, use GitHub's
[private vulnerability reporting form](https://github.com/saramand9/prj-super-explore/security/advisories/new).
Until then, request a private contact method from the maintainer without posting
vulnerability details. No response-time or supported-version SLA is promised.

A useful private report includes the affected version, Windows version,
reproduction steps using synthetic files, expected and actual behavior, and
potential impact. Review diagnostic text before sharing it: it can contain
paths and stack traces.

## Current security boundaries

Explore is a local file manager with access to the files the operating-system
user can access. Copy, move, overwrite and delete operations affect real data.
Test new builds with disposable files and keep independent backups.

External plugins execute trusted local code with application-level capabilities.
They are not sandboxed and have no permission-isolation guarantee. Only install
plugins whose source and origin you trust.

Markdown previews are sanitized, but sanitization does not replace a hardened
Electron boundary. The current baseline still needs a production CSP,
restricted preload channels, runtime IPC/sender validation, navigation controls
and review of explicitly disabled renderer sandboxing. Do not treat this policy
as a claim that those controls have already been implemented.

Runtime and build-tool dependencies need security updates before a new public
binary release. See the dated, scoped findings in
[the readiness review](docs/maintainers/open-source-readiness.md). An advisory
match is not itself proof that a specific Explore workflow is exploitable.

## Release integrity

Current installers are not code-signed and do not implement an automatic update
publication flow. Download from a maintainer-controlled location and compare
the SHA-256 checksum. A checksum distributed through the same channel detects
accidental corruption; it is not an independent publisher signature.
