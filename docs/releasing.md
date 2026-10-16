# Releasing Explore for Windows

The ordinary Windows workflow validates changes; it does not publish installers.
The `Draft Windows release` workflow runs on version tags and creates a draft
only after validation, packaged-app smoke tests and installer generation pass.
Publishing remains a deliberate maintainer action.

## Before tagging

1. Complete the [readiness checks](maintainers/open-source-readiness.md), including
   asset rights, dependency triage and complete notices for distributed components.
2. Update all three package versions together. Do not reuse `1.0.1` for the
   hardened build: the already distributed installer predates these changes.
3. Move the relevant Unreleased entries in `CHANGELOG.md` into a dated version.
4. Run `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test:unit`,
   `pnpm test:e2e`, `pnpm test:commit-policy`, `pnpm test:release` and
   `pnpm test:package`. Review both full and production dependency audits.
5. Merge the release preparation through a PR with the required checks passing.
   Never bypass branch protection or rewrite master for a routine release.

## Tag and build

From an up-to-date, clean master, create an annotated tag matching every package
version and push only that tag. For example, after deliberately setting all
three versions to `1.0.2`:

```powershell
node scripts/verify-release.mjs v1.0.2
git tag -a v1.0.2 -m "Release Explore 1.0.2"
git push origin v1.0.2
```

This is a maintainer procedure, not a command executed by documentation updates.
The workflow rejects mismatched versions and commits not reachable from master.
The Windows build job has read-only repository permissions. A separate job,
without package installation or source execution, receives write permission to
create the draft and attach the installer, SHA256SUMS and repository notices.
The workflow does not overwrite an existing release or publish a draft.

## Review the draft

- Compare `SHA256SUMS.txt` against the downloaded installer.
- Verify the installed application version, Electron runtime and bundled search.
- Check license files under the application's `resources/licenses` directory.
  The build collects npm upstream texts plus ripgrep/PCRE2 notices there;
  Electron/Chromium notices are next to the executable. Review new dependencies
  when adding runtime code or changing renderer build inputs.
- The workflow runs `pnpm --filter @explore/desktop test:installer` on its
  disposable Windows runner. It verifies the pinned 1.0.1 installer hash,
  installs it, upgrades with isolated sample workspaces/settings preserved,
  verifies hardened startup and notices, and uninstalls. It refuses to run on
  the maintainer's ordinary account. Repeat manual acceptance on supported
  Windows versions as appropriate; one Windows runner is not all hardware/OSes.
- Exercise copy/move/rename conflicts, locked files, close/save recovery, network
  shares, filename/full-text search, worker loading and trusted plugin behavior.
- Confirm the release notes distinguish known limitations and fixes from the
  preceding binary. Current builds are unsigned and have no automatic updater.

Publish the draft only after these checks. Creating the workflow, pushing source,
or passing an unpacked-app smoke test is not an installer acceptance certificate.

## Local packaging limits

`electronDist` uses the Electron installed through the frozen lockfile rather
than performing a second runtime download. The Windows resource/signing helper
may still need to download its own tools. On accounts without symlink privileges,
old helper archives containing macOS symlinks can fail to extract; do not disable
application sandboxing, change global OS policy or claim a passing default build
to hide an environment failure. Report any local-only verification overrides.
