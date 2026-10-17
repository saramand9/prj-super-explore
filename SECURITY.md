# Security policy

## Reporting a vulnerability

Do not publish exploit details, credentials, private paths or sensitive logs in
issues or pull requests.

This repository is public and GitHub private vulnerability reporting is enabled.
Use GitHub's
[private vulnerability reporting form](https://github.com/saramand9/prj-super-explore/security/advisories/new).
It requires a GitHub account. Do not disclose details in public issues if the
form is unavailable; ask the maintainer for a private channel instead.
No response-time or supported-version SLA is promised.

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

The source enables sandboxing, context isolation and web security, and explicitly
disables renderer Node.js integration. A bundled CommonJS preload exposes fixed
request/event functions, not arbitrary IPC invocation. Main-process handlers
validate request schemas and accept only the owned window's trusted main frame.
Production CSP blocks inline scripts, embedded frames, remote connections and
objects. Popups, foreign navigation, webviews and permission requests are denied.

Trusted external plugins still execute Blob modules with application-level file
capabilities. CSP therefore permits Blob scripts/workers and inline CSS needed
by the UI, but not inline JavaScript or unsafe-eval. This is hardening, not a
claim that trusted plugins are isolated or that every attack has been ruled out.

Electron and DOMPurify are updated in the hardened source. Other runtime/build
dependency advisories still require triage before a new public binary release.
See the dated, scoped findings in
[the readiness review](docs/maintainers/open-source-readiness.md). An advisory
match is not itself proof that a specific Explore workflow is exploitable.

## Release integrity

Release 1.0.0 installers are not code-signed. They include user-confirmed Windows
NSIS updates from the fixed public
`saramand9/prj-super-explore` GitHub repository. Checks contact GitHub after
startup and every six hours; this is not telemetry collection. Downloads and
restart/install require separate user actions. No client GitHub token is needed
or embedded. Drafts, prereleases and downgrades are excluded.

Updater SHA-512 checks detect corrupted downloads, not a compromised publishing
account. Publisher signature verification is not overridden; unsigned builds
still lack independent publisher authentication. The UI explicitly states this.
Code signing remains a separate release-hardening task. A checksum distributed
through the same channel is not a substitute for a publisher signature.

Update IPC exposes fixed actions, not executable paths or feed URLs. Workspaces
and settings must save successfully before installer handoff; active file
mutations block installation. Ordinary application quit never auto-installs.
Production renderer CSP remains unchanged: updater networking runs in main.
