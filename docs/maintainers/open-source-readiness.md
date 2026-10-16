# Open-source readiness review

Review date: October 17, 2026. Baseline: the 106 commits reachable from the
local integrated desktop branch, including its local pinyin fix and merge of
upstream changes. This is a source-release preparation review, not a penetration
test, legal opinion or signed-binary release certification.

## Publication gates: maintainer decisions

- **License selected: MIT.** The maintainer approved MIT on October 17, 2026.
  [LICENSE](../../LICENSE) and all three package manifests now record that choice.
  Before publication, still confirm copyright ownership and permission to license
  contributions, including work created in an employment context. Selecting MIT
  does not resolve third-party asset rights or authorize a visibility change.
- **Resolve raster-asset provenance.** The Prism-named icon collection and
  installer icon do not have documented source/license permission. See
  [the asset inventory](../../THIRD_PARTY_NOTICES.md).
- **Review public author metadata.** Two author identities occur in history;
  one uses a corporate-domain email. History normalization preserves authors and
  dates rather than silently rewriting attribution. Decide whether a documented,
  consented GitHub noreply mapping is appropriate before public launch.
- **Approve the remote history replacement.** English message normalization
  changes commit IDs throughout the graph. Keep the verified Git bundle and
  old-to-new commit map outside the publishable source. Never push local backup
  branches, stash refs, `--all` or `--mirror` to the public remote.
- **Configure private reporting and repository controls.** The repository is
  currently private. The private-vulnerability-reporting endpoint was unavailable
  at review time. Verify a real private contact channel, enable appropriate
  protection/rulesets and required checks, and configure the chosen PR merge
  policy before inviting public contributions. These settings were not changed.

## Security findings: address before promoting a new public binary

### Electron trust boundary

- `apps/desktop/src/renderer/index.html` has no production CSP. Define a policy
  compatible with local previews, workers and the plugin trust model, and test it
  in a packaged build; do not simply add `unsafe-eval` to silence violations.
- `apps/desktop/src/preload/index.ts` exposes generic `invoke`, `on` and `once`
  methods accepting arbitrary channel strings. Replace that with a reviewed
  allowlist or task-specific API and synchronize renderer/shared types.
- `apps/desktop/src/main/ipc/handlers.ts` mainly uses compile-time request types.
  Establish systematic runtime payload validation and sender/frame checks.
- Both windows in `window.service.ts` explicitly use `sandbox: false`.
  `nodeIntegration` and `contextIsolation` are not explicitly set. Current
  Electron defaults are not evidence that sandboxing is enabled. Review external
  navigation/window-open controls and plugin loading before changing these flags.
- Markdown uses DOMPurify, which is a useful defense but not a substitute for the
  process/IPC boundary. External plugins are explicitly trusted, not isolated.

This preparation does not silently change runtime security behavior. Each fix
needs focused tests and packaged-app validation.

### Dependency audit snapshot

`pnpm audit --prod --json` reported **2 high and 2 low** advisory findings:

- Two high `extract-zip` findings are inherited through
  `@lvce-editor/ripgrep`. Investigate the install-time download/extraction path;
  do not describe them as proof that the app's file preview is exploitable.
- Two low findings affect the locked DOMPurify 3.4.13; the advisory fix is 3.4.16
  or later. The reported scenarios concern `IN_PLACE` use. Explore's reviewed
  preview passes an HTML string, without `IN_PLACE` or custom hooks; exploitability
  in this flow has not been demonstrated. Update and regression-test anyway.

The complete dependency audit reported **4 critical, 65 high, 46 moderate and
10 low** findings, including Electron and packaging/test tooling. These are
package-manager advisory counts, not that many confirmed Explore exploits.
Electron is declared as a development dependency but ships as the application
runtime, so a production-only audit is insufficient. Upgrade the old Electron 33
line and affected tooling in a separate tested change; do not apply a blind
major-version `audit fix` and claim the app is validated.

Relevant upstream sources:

- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [DOMPurify advisory](https://github.com/cure53/DOMPurify/security/advisories/GHSA-p98j-92pf-mc4p)
- [extract-zip advisory](https://github.com/advisories/GHSA-jmr9-qjv8-65gv)

Audit databases change. Re-run both full and production-only audits immediately
before release and triage paths, affected features and available fixes.

## Repository and documentation work in this preparation

- English README with a synthetic-data screenshot, verified existing download
  URLs/checksum, user instructions, development steps and honest limitations.
- English contribution, security and community policies; issue and PR templates.
- English development, recovery and benchmark documentation. The old fork-tab
  draft is clearly historical rather than presented as current product behavior.
- English Conventional Commit policy, optional local commit-msg hook, automated
  policy tests and a CI check that validates the selected head's reachable
  history and PR title. No fabricated authorship or dates.
- Action revisions pinned to resolved commit IDs; existing Windows validation
  retained. Branch-protection settings and hosted CI execution remain separate.
- Local caches, recordings and unrelated deployment experiments are ignored,
  not deleted or added to the public source.
- The stale npm lockfile is removed; pnpm remains the sole package manager.
- English package descriptions and root repository/homepage/issue metadata are
  provided. Workspace `private: true` flags intentionally prevent accidental npm
  publication; they do not control GitHub visibility or a source license.

The root `lint`/`format` scripts still reference missing Biome tooling. This is
an explicit remaining development-experience issue; no passing lint claim is
made. Set up and baseline a real formatter/linter without mixing wholesale
formatting into unrelated fixes.

## Historical and privacy checks

The source branch contains 106 existing commits, with non-ASCII text in 56
messages. Both subjects and bodies are normalized, including the debug and merge
subjects. Historical behavior is translated, not rewritten to match today's
shortcuts. The original graph and authorship are retained.

Gitleaks 8.30.1 was downloaded from its official release and SHA-256 checked.
The redacted historical scan with `--all --full-history -m` produced no findings.
The tool reported 107 scanned commit-diff records; this is not the count of
reachable graph nodes, because merges/stash history are handled differently.
This is a bounded automated check, not proof of the absence of every secret,
personal detail, employer-owned material or copyrighted asset.

A personal Windows path in the historical fork-tab design example is replaced
with a generic example during sanitization. The rewrite verification must allow
only that exact historical documentation replacement; application code must be
byte-identical at every corresponding commit. Current README screenshots use
only synthetic files. Old local recordings are not part of the publication.

## Validation and launch checklist

- [x] Baseline TypeScript checks, 118 unit tests, application build and bundled
  search verification pass locally.
- [x] Verify all 108 old-to-new commit pairs (106 original plus two preparation
  commits), preserve author/committer metadata and parent order, and confirm
  zero application-blob changes. Only the documented personal-path example
  replacement is allowed in historical content.
- [x] Validate English commit policy, all 11 English documents' local links,
  Git object integrity and the unchanged application source tree. Subsequent
  preparation commits are validated independently by the same commit policy.
- [x] Run Electron end-to-end checks: the first run passed 25/26 with a drag
  modifier timeout; the focused retry passed, followed by a full 26/26 pass.
  Retain the initial failure as an intermittent-test observation.
- [x] Adopt the maintainer-selected MIT License and synchronize package metadata
  and contributor documentation.
- [ ] Confirm author/employer rights and visual asset provenance.
- [ ] Resolve dependency and Electron-hardening findings before promoting a new
  public binary.
- [ ] Run hosted Windows checks and clean-machine installer/upgrade/uninstall
  validation for the intended public release candidate.
- [ ] Assemble complete binary third-party notices and decide on code signing.
- [ ] Verify anonymous access to public documentation/downloads. The current
  website's browser routes are sign-in protected; README must remain usable
  without that website.
- [ ] Coordinate the history replacement with collaborators; use an explicitly
  approved, branch-scoped force-with-lease only after rechecking the remote tip.
- [ ] Change visibility and enable repository/community security settings only
  after approval. No public visibility change was performed by this preparation.

### Local packaging verification limit

The default `pnpm test:package` attempt did not complete because it needed to
download Electron. A retry using the already installed Electron 33.4.11 then
failed to extract the Windows resource-editing/signing helper: this Windows
account could not create its archive's symlinks, and later retries also hit
GitHub download timeouts. No system privileges or global Windows settings were
changed to hide that limitation.

A separate directory-package smoke check succeeded with explicit local-only
overrides:

```powershell
pnpm --filter @explore/desktop exec electron-builder --win --x64 --dir --config.electronDist=node_modules/electron/dist --config.win.signAndEditExecutable=false
pnpm --filter @explore/desktop exec node scripts/verify-search.mjs --packaged
pnpm --filter @explore/desktop exec playwright test -c playwright.package.config.ts
```

The packaged search verifier and one packaged-app smoke test passed: the actual
Windows executable launched, searched without development tools and saved on
close. This deliberately skips signature/resource editing and is not equivalent
to a clean-machine NSIS install/upgrade/uninstall or a passing default packaging
pipeline. Do not publish these local verification artifacts as a new release.

The local history publication procedure and collaborator recovery steps are
documented in [history migration](history-migration.md). The remote master remains
unchanged until explicit approval for a coordinated force-with-lease replacement.

See [GitHub's open-source launch guidance](https://opensource.guide/starting-a-project/)
and [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) for
the conventions behind the repository changes.
