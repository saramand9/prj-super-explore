# Changelog

## Unreleased

## 1.0.4 - 2026-10-17

### Changed

- Redesign the desktop menu/command bars with grouped commands, consistent icons,
  aligned shortcuts, contextual disabled states, keyboard navigation and responsive sizing.
- Share file actions between menus and toolbar buttons, preserving copy conflicts
  and two-step permanent deletion confirmation.
- Separate up-to-date results from expandable installation/security notes.

### Fixed

- Prevent the hidden update dialog from blocking global keyboard shortcuts.

Installers remain unsigned. Update transport and save safeguards are covered by
loopback tests; installer acceptance uses a direct NSIS upgrade from 1.0.2,
not a live GitHub-triggered automatic installation.

## 1.0.3 - 2026-10-17

### Added

- Add GitHub Releases updates for Windows NSIS installations.
- Check stable releases after startup and every six hours, with a manual Help menu entry.
- Require separate download and restart/install actions; show progress and verify SHA-512.
- Save workspaces and appearance settings before installation; cancel on save failure,
  timeout or renderer loss, and block installation while file mutations are active.
- Keep automatic installation on ordinary quit disabled; preserve signature verification.
- Include and validate latest.yml and installer blockmaps in draft releases.
- Pin js-yaml 4.x to 4.3.2 to address known YAML parsing denial-of-service advisories.
- Add real updater transport/corruption/save-failure tests using isolated loopback fixtures.
- Advance disposable-runner installer acceptance to the hash-pinned GitHub 1.0.2 baseline.

Existing 1.0.2 installations need one manual installation of this updater-enabled
version. Installers remain unsigned. Loopback tests verify download/integrity and
save behavior; they do not certify a live GitHub-to-NSIS automatic upgrade.

## 1.0.2 - 2026-10-17

### Security

- Upgrade Electron to 44.8.0 and DOMPurify to 3.4.17.
- Enable renderer sandboxing, context isolation and web security; disable Node integration.
- Replace the generic preload IPC bridge with fixed request and event capabilities.
- Validate all request payloads and restrict IPC to owned windows and trusted main frames.
- Block foreign navigation, popups, embedded frames, webviews and permission requests.
- Add production CSP while preserving explicitly trusted local plugin Blob modules.
- Validate plugin IDs and canonical paths; require confirmation before installation.
- Execute only the application-owned search binary; ignore RG_PATH, working-directory
  and PATH executable overrides and use basic search if the bundled binary is missing.
- Recognize the same canonical renderer file across Windows installation path
  aliases, preserving IPC/workspace restoration without trusting sibling files or remote shares.

### Development and releases

- Add pinned Biome lint/format tooling and a one-time formatting baseline.
- Include preload, tests and tool configurations in strict type checks.
- Add negative security regression tests and release-version validation.
- Add a tag-triggered, tested Windows installer workflow that creates drafts only.
- Fix Windows packaging to run the desktop build script, not pnpm's source-tarball command.
- Bundle the project license and third-party inventory with the application.
- Collect complete installed npm license/notice texts and retain ripgrep/PCRE2 notices.
- Gate release drafts on installing 1.0.1, upgrading while preserving sample data,
  launching the hardened build and uninstalling on a disposable Windows runner.
- Synchronize public-repository, private-reporting and protected-branch documentation.

Windows x64 installers remain unsigned. External plugins remain trusted code,
not isolated extensions. Dependency audit findings are scoped in the readiness
review; this release is not a claim of zero vulnerabilities.

## 1.0.1 - 2026-10-16

- Existing unsigned Windows x64 installer distributed from the maintainer's download host.
- Includes dual-pane browsing, workspaces, pinyin filename search, previews and full-text search.

The existing binary predates the Unreleased changes. This entry does not imply
that a GitHub Release or a new installer has been published retroactively.
