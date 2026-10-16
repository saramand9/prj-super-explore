# Open-source readiness

Updated October 17, 2026. This describes the hardened 1.0.2 source; publication is
tracked by its GitHub Release, not by this checklist. The initial
review covered the 106 original product commits. Later history normalization,
MIT adoption and author-privacy mapping are recorded in [history migration](history-migration.md).

## Completed foundations

- MIT LICENSE and matching SPDX metadata in all three packages.
- Public repository, English README, contribution/security/community policies,
  issue/PR templates and documented Windows development commands.
- English Conventional Commit checks and pinned CI action revisions.
- Renderer sandbox, context isolation, web security and disabled Node integration.
- Bundled CommonJS preload with fixed request/event methods; exhaustive shared
  capabilities and main-process request schemas; trusted owned-main-frame checks.
- Production CSP, foreign-navigation/popup/webview denial and denied permissions.
- Plugin ID/path validation, realpath containment and native installation confirmation.
- Electron 44.8.0, DOMPurify 3.4.17 and electron-builder 26.15.3.
- Biome formatter and an explicit correctness/security lint baseline, with checks
  in CI. Strict TypeScript checks now include preload, tests and tool configs.
- Main-branch PR/CI protection, no force push/deletion, private vulnerability
  reporting, secret scanning, push protection and Dependabot security updates.
  The solo-maintainer setup requires no second-person approval.
- CodeQL default setup is configured for JavaScript/TypeScript and Actions with
  the remote-and-local threat model. Its initial validation scan passed for both
  languages, independently of the new source branch's CI. A passing analysis job
  does not establish that the code has no findings.
- Separate tag/version-checked draft release workflow and a versioned changelog.
  No installer is published automatically; see [releasing](../releasing.md).

## Remaining release gates

- [ ] Record the AI generation tool/terms for the maintainer-created icons and
  any reference-image rights. Do not assume that AI origin removes all conditions.
- [ ] Confirm code/contribution ownership, including any applicable employer rights.
  A privacy-driven Git identity mapping is not a transfer of copyright.
- [x] Collect installed npm graph/renderer-root license texts and ripgrep/PCRE2
  notices in resources/licenses/components; retain Electron/Chromium notices.
  Review newly added dependencies; this is not a legal compliance certificate.
- [ ] Triage remaining dependency advisories. The current production audit reports
  two high extract-zip findings via the ripgrep installation wrapper; the complete
  audit reports 3 critical, 42 high, 16 moderate and 2 low findings. These are
  package-manager alerts, not confirmed exploits. Electron is shipped even though
  declared under devDependencies; production-only audit is not sufficient.
- [ ] Confirm the 1.0.2 installer acceptance job passes before publishing: its
  disposable Windows runner installs pinned 1.0.1, upgrades with isolated sample
  data and uninstalls. Additional supported-Windows/manual testing remains due.
- [ ] Confirm protected PR and tag-workflow checks pass for the exact release
  commit. The initial security branch Windows checks passed; later preparation
  changes and the actual tagged installer require their own results.
- [ ] Follow up on GitHub's review of old commit-object/cache removal. Current
  history is sanitized, but old SHA URLs may remain retrievable until the host
  completes cleanup. Do not publish recovery bundles, backup refs or stash refs.

## Security scope and intentional exceptions

External plugins are trusted application code, not isolated extensions. CSP
allows Blob scripts/workers for local plugins and search, and inline styles used
by React; it does not allow inline JavaScript or unsafe-eval. App file operations
retain the logged-in operating-system user's permissions; sandboxing is not a
per-directory authorization system. User-selected file opening remains possible.
Diagnostics are local but can contain paths and stack traces, so review before
sharing. No automated scan establishes the absence of all privacy or security risk.

## Verification records

The hardened source passed local lint, formatting, strict type checks, 126 unit
tests, 30 Electron E2E tests, commit-policy/release-guard tests, default packaged-app
smoke testing and NSIS installer generation. The packaged project LICENSE matches
the source license byte-for-byte. The generated installer is unsigned and has not
been a certificate of clean-machine acceptance. The 1.0.2 release additionally
requires successful hosted installer acceptance; see [its validation scope](release-1.0.2-validation.md).

A standard local directory build initially failed with electron-builder 25 while
extracting macOS symlinks in its Windows resource-tool archive. The builder was
updated instead of weakening Windows policy or application sandboxing; the
standard pipeline then passed without resource/signature-skip overrides. A
directory smoke test and installer generation are not a full installer certification.

Sources: [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security),
[GitHub repository practices](https://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories).
