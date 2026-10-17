# Windows updates

This describes the public release line starting at 1.0.0.

## User behavior

- Check stable GitHub Releases ten seconds after launch and every six hours.
  Help → 检查更新... opens the same status panel. Checks are throttled to one
  per 30 seconds and do not download installers.
- A nonmodal badge announces available or downloaded updates. The user chooses
  Download, can continue working, and later chooses Restart and install.
- Ordinary quit never installs. Installation first locks file mutation entry
  points and saves workspaces/settings. Busy operations, failed saves, unloaded
  state, renderer loss or a 15-second save timeout cancel installation.
- Edits are temporarily blocked during save/handoff. Cancellation restores file
  operations. No update flow offers to discard unsaved workspace changes.
- This is an NSIS full-installer upgrade with a restart, not JS hot replacement.
  Higher-numbered retired trial builds cannot automatically downgrade to 1.0.0.
  Their users must back up workspaces/settings and manually install 1.0.0.
- A network, download or verification error leaves the existing application
  intact. Retry after checking connectivity, or download from GitHub manually.

## Implementation boundaries

`electron-updater` 6.8.10 runs in main. electron-builder 26 generates
`resources/app-update.yml`, `latest.yml` and the installer blockmap. The source
is fixed to public `saramand9/prj-super-explore`; production code never accepts
an IPC-supplied URL, executable path or token and never calls `setFeedURL`.
Development/non-Windows builds disable update operations. Renderer sandboxing,
navigation policy, fixed preload capabilities and CSP remain in force.
The compatible js-yaml 4.x dependency is overridden to 4.3.2, addressing
GHSA-h67p-54hq-rp68, GHSA-52cp-r559-cp3m, GHSA-5p4m-2wfm-xmqj and
GHSA-2883-xcg3-v3hh. Keep that override until upstream dependency constraints
and the resolved lockfile no longer permit affected versions.
The scoped production audit still reports the two previously known extract-zip
advisories in the ripgrep wrapper dependency graph; this integration does not
claim an advisory-free repository or resolve unrelated build-tool findings.

The adapter explicitly disables automatic downloads, installation on quit,
prereleases, downgrades, web installers and differential downloading. Full
downloads work even when an earlier release has no blockmap; blockmaps are
published for future compatibility. Default signature verification is not
overridden. Unsigned installers provide SHA-512 integrity checks but no
independent publisher authentication. Do not call them signed or silently
replace the signature verifier. Future signing certificates belong in protected
CI secrets, never source or client bundles.

`OperationGuard` wraps every mutating file/plugin IPC promise in the common
registrar. An install lock cannot be acquired while one is active. Persistence
IPC remains usable to complete the save barrier. Save acknowledgement requires
the matching request ID from the main window; stale/launcher replies cannot
authorize installation. A failed installer launch restores the normal close
guard and mutation entry points.

The update state machine and save barrier use dependency injection. Unit tests
cover concurrency, timeout, cancellation, corruption, stale events and locks.
`tests/e2e/update.e2e.ts` supplies an isolated loopback feed to the actual NSIS
updater in its test bootstrap only. Real Electron HTTP/cache/SHA-512 behavior and
the production UI/IPC/save handshake execute; only native installer execution
is replaced with a recording stub. No test URL hook exists in production code,
no GitHub fixture release is published and synthetic bytes are never executed.

## Release acceptance

1. Run lint, format, strict type checks, unit/Electron tests and packaging tests.
2. Run `pnpm pack:win`. Its validator checks generated metadata against the exact
   installer and packaged public GitHub configuration. Never hand-edit production
   hashes or upload artifacts from a different build.
3. Run installer acceptance only on the disposable Windows runner. Version 1.0.0
   validates clean installation, same-version reinstallation with data retained,
   secure startup and uninstall, without depending on retired trial downloads.
   Before a later release, pin the published 1.0.0 installer size and SHA-256 in
   `tests/helpers/installer-baseline.ts`; the guard rejects later versions until
   those values are recorded, then validates an upgrade from that retained release.
4. Review upstream license notices, including the documented lazy-val gap, and
   code-signing limitations before publication. The package collector does not
   turn metadata declarations into an upstream copyright notice.
5. Verify the stable draft contains the EXE, `latest.yml`, EXE `.blockmap`,
   SHA256SUMS, LICENSE, THIRD_PARTY_NOTICES and CHANGELOG. Draft creation is not
   publication; the release job deliberately does not publish automatically.
6. For the first update-enabled release, manually install it in a disposable
   Windows environment. At the next real version, publish the accepted stable
   release and verify GitHub discovery, download, save, user-confirmed restart,
   actual NSIS replacement, version change, workspace/settings retention and
   uninstall. Do not fabricate a production release just to exercise this path.

Local loopback/packaged tests do not certify that final live-GitHub/native-NSIS
round trip. GitHub must be reachable on each user's network; no alternate mirror
or connectivity guarantee is implied.
