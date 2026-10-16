# Release 1.0.2 validation scope

Prepared October 17, 2026. The tag workflow is the source of truth for acceptance
of the actual uploaded installer; do not substitute a locally rebuilt binary.

## Distribution contents

The license collector resolves the installed production graph and these bundled
runtime roots even though they are devDependencies: React, React DOM, Zustand,
Lucide React, TanStack React Virtual, clsx, class-variance-authority, tailwind-merge
and Electron Toolkit Utils. It copies their upstream texts without local paths
and currently covers 67 npm components, including install-time dependencies.
Adding a new bundled dependency requires updating the roots as appropriate.

Electron/Chromium distribution notices remain beside Explore.exe. Additional
upstream texts are stored under `apps/desktop/build/licenses`:

- [ripgrep 15.0.0 MIT](https://github.com/BurntSushi/ripgrep/blob/15.0.0/LICENSE-MIT).
- [PCRE2 10.45](https://github.com/PCRE2Project/pcre2/blob/pcre2-10.45/LICENCE.md),
  matching the bundled search executable's `--version` output.
- [type-fest 2.19.0 MIT](https://github.com/sindresorhus/type-fest/blob/v2.19.0/license-mit),
  restored because its type-only npm package omits the text. MIT is selected
  from its MIT-or-CC0 choice.

The maintainer states that the raster assets were AI-created and requested their
distribution. The generator/terms records remain a provenance follow-up; the
images are not represented as MIT-licensed by this release. This is not a legal
opinion or a declaration that third-party provenance is conclusively settled.

## Dependency audit triage

The locked dependency snapshot reports 3 critical, 42 high, 16 moderate and 2 low
package-manager advisories; production-only reports 2 high. No zero-advisory claim
is made. Electron ships despite its devDependency classification, and is updated
to 44.8.0. DOMPurify is updated to 3.4.17.

- Critical Vitest UI server advisory GHSA-5xrq-8626-4rwp: CI uses `vitest run`,
  not an exposed UI server; Vitest is not included in the installed application.
- Critical Tinypool advisories GHSA-5gmw-xhrv-c9v3 / GHSA-85c8-ppgw-ccpr: test
  worker tooling, not an application service. CI executes trusted source after
  normal PR checks, with read-only build credentials. Do not expose test runners
  or execute untrusted repository code locally. Toolchain upgrades remain due.
- Production extract-zip advisories GHSA-jmr9-qjv8-65gv / GHSA-7pqw-9j4j-h8q3:
  used by the ripgrep wrapper during dependency installation. Explore executes
  the shipped rg.exe, not archive extraction on user input. No patched version
  is offered in the audit snapshot. Builds still trust upstream downloads, so
  this is an acknowledged supply-chain risk, not a claim of a fixed dependency.
- Other findings primarily concern build/test/transitive packages and need
  continued triage and upgrades. This limited assessment does not demonstrate
  that every dependency finding is unreachable or harmless.

## Automated installer acceptance

Only the disposable Windows release runner installs applications. The baseline
1.0.1 download is SHA-256 pinned to the previously documented installer hash.
The acceptance test installs that binary, launches with an isolated profile,
upgrades to the newly built version, verifies sample workspaces/settings, runtime
sandbox flags, search and license files, then uninstalls and verifies that the
external sample files/profile are retained. Failure blocks draft creation.

The published installer is unsigned. This test covers the hosted runner OS,
not every Windows version, SmartScreen policy, network share, antivirus setup
or hardware configuration. Existing manual/E2E functional evidence complements
it; it is not a universal installation or security certificate.
