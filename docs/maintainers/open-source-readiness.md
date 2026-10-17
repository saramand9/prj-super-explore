# Open-source readiness

Updated October 17, 2026 for the public release line starting at 1.0.0. Earlier
trial Release listings are retired; Git commits and technical history remain.
The initial review covered 106 original product commits. See
[history migration](history-migration.md) for identity/privacy normalization.

## Implemented foundations

- MIT license and matching package metadata; English README, contribution,
  community and private-security-reporting policies, issue and PR templates.
- Sandboxed Electron renderers, context isolation, disabled Node integration,
  fixed typed preload capabilities and main-frame/request validation.
- Production CSP, foreign navigation/popup/webview denial and denied permissions.
- Canonical-path validation for trusted plugins and the bundled search binary.
- Protected master PR/CI checks, conventional English commits, pinned CI actions,
  secret scanning/push protection, CodeQL and Dependabot configuration.
- Formatting, linting, strict types, unit/Electron UI tests, packaged startup
  checks and explicit tag-version validation before draft generation.
- User-confirmed GitHub updates with integrity verification and save/busy guards.
- Bundled project/upstream license notices; details and limits are recorded in
  [release validation](release-validation.md).

## Remaining follow-ups

- Record AI generator/terms and reference-image rights for raster assets.
- Confirm code/contribution ownership, including any applicable employer rights.
  Privacy-driven author mapping does not transfer copyright.
- Continue dependency advisory triage. The latest snapshot reports 3 critical,
  39 high, 15 moderate and 2 low overall; production-only reports 2 high. These
  are scoped package-manager findings, not confirmed runtime exploits.
- Complete supported-Windows/manual acceptance beyond one hosted runner.
- Verify a real user-confirmed GitHub-to-NSIS update at the next higher public
  version. Current loopback tests stub native installer execution.
- Obtain publisher signing if desired; current installers remain unsigned.
- Follow up on GitHub old-object/cache removal. Sanitized reachable history does
  not guarantee old SHA URLs are unavailable. Never publish recovery bundles,
  backup refs or stash refs.

## Per-release gates

Require passing protected PR and exact-tag checks, review downloaded artifact
hashes, updater metadata and notices, then deliberately publish the draft. The
1.0.0 installer test covers clean installation and same-version reinstallation
with retained data; it is not a cross-version upgrade certificate. Before any
later version, pin the retained public installer's size/SHA-256 for upgrade
acceptance. See [releasing](../releasing.md).

## Security scope

External plugins are trusted application code, not isolated extensions. CSP
permits local plugin Blob scripts/workers and React inline styles, not inline
JavaScript or unsafe-eval. File operations retain the OS user's permissions;
sandboxing is not a per-directory authorization system. Diagnostics may contain
paths and stack traces and should be reviewed before sharing. No scan establishes
the absence of all privacy or security risk.
