# Public release validation

Updated October 17, 2026 for the 1.0.0 public release baseline. The exact tagged
workflow is the acceptance record for an uploaded installer; locally rebuilding
the same source does not reproduce that record automatically.

## Distribution and provenance

The license collector includes installed production dependencies and bundled
renderer roots, currently covering 78 npm components plus ripgrep and PCRE2.
Upstream texts are bundled under `resources/licenses/components`, with the
project MIT license and inventory under `resources/licenses`. Electron/Chromium
notices remain beside the executable. Review notices when dependencies change.

Retained native component texts:

- [ripgrep 15.0.0 MIT](https://github.com/BurntSushi/ripgrep/blob/15.0.0/LICENSE-MIT).
- [PCRE2 10.45 license](https://github.com/PCRE2Project/pcre2/blob/pcre2-10.45/LICENCE.md).

The lazy-val package omits its upstream license text. The documented fallback
records its MIT declaration and standard text without inventing a copyright year
or claiming a verbatim upstream notice. This remains a provenance follow-up.

The maintainer states that the raster assets are AI-created. Generator/terms and
reference-image rights still need a provenance record. AI origin is not, by
itself, a complete rights clearance or a legal compliance certificate.

## Dependency audit scope

The most recent audit snapshot reports 3 critical, 39 high, 15 moderate and 2 low
findings across the complete dependency graph; production-only reports 2 high
extract-zip findings. These counts are time-dependent package-manager findings,
not a claim that each advisory is exploitable in the installed application.
Electron ships despite being a devDependency, so production-only auditing is
insufficient. Current Electron is 44.8.0 and DOMPurify is 3.4.17.

- Vitest/Tinypool critical findings concern test tooling. CI runs `vitest run`,
  not an exposed test UI server; these packages are not installed application
  services. Do not execute untrusted repository code locally.
- extract-zip is used by the ripgrep wrapper during dependency installation,
  not for user-selected archives at runtime. The app runs the shipped rg.exe.
  Build-time downloads remain an acknowledged supply-chain risk.
- Other build/transitive findings still require triage and upgrades. Nothing
  here establishes that every finding is unreachable or harmless.

## Installer acceptance

Only a disposable Windows GitHub runner installs test applications. The initial
1.0.0 release uses its exact built installer for clean installation and then
same-version reinstallation. It checks sample workspace/settings retention,
sandbox flags, bundled search, license files, uninstall and retained external
fixture data. It does not depend on deleted trial Release attachments.

Before a later release, pin the published 1.0.0 installer size/SHA-256 in the
installer baseline helper and update its tests. The guard refuses a later
release with an unpinned baseline. Such releases then verify a cross-version
upgrade from the retained public release rather than same-version reinstall.

The installer is unsigned. One hosted runner does not cover all supported
Windows versions, SmartScreen/antivirus policies, hardware or network shares.
Loopback updater tests verify real transport, integrity and save safeguards,
but stub native installer execution. They do not certify a live GitHub-triggered
NSIS replacement. See [update acceptance](../updates.md#release-acceptance).

## Security regression scope

The app executes only its bundled search binary, not RG_PATH/PATH/working-directory
overrides. Main-frame trust checks handle Windows long/8.3 path aliases while
rejecting sibling pages, foreign shares and other windows. The preload bridge,
request validation, sandbox and CSP remain enabled.

Previously reviewed CodeQL tool findings involved a local commit-policy CLI,
first-party installers on a disposable runner, and synthetic updater test
bootstrap code. Dismissals apply only to reviewed locations, never to an entire
query or scanner. A passing scan is not proof that no vulnerabilities exist.
