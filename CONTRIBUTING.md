# Contributing to Explore

Thank you for helping improve Explore. Small, focused fixes, reproducible bug
reports, tests and documentation improvements are welcome.

## Before contributing

Read the [README](README.md), [security policy](SECURITY.md) and
[code of conduct](CODE_OF_CONDUCT.md). Contributions of original code and
documentation are made under the project's [MIT License](LICENSE). Submit only
work you have permission to contribute, including any required employer approval.
Identify third-party material and include its source, license and required
notices; do not assume the project license overrides upstream terms.

For substantial features, open an issue first to discuss the problem and scope.
Search existing issues before starting duplicate work. Use English for commit
messages, pull request titles and new contributor-facing documentation.

## Development environment

Use Windows x64, Node.js 22 or later and pnpm 10.31.0. Install pnpm using the
[official installation instructions](https://pnpm.io/installation). The
`packageManager` field and `pnpm-lock.yaml` define the supported toolchain.

```powershell
git clone https://github.com/saramand9/prj-super-explore.git
cd prj-super-explore
pnpm install --frozen-lockfile
pnpm dev
```

The repository is public. Do not commit generated installers, local configuration,
recordings, caches or unrelated deployment experiments.

## Changes and validation

1. Create a branch such as `fix/workspace-restore` or `feat/search-filter`.
2. Keep one logical change per commit. Add a regression test for behavior fixes.
3. Preserve unrelated changes and do not reformat the whole repository.
4. Run the checks relevant to the affected behavior:

```powershell
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:unit
pnpm test:e2e
pnpm test:commit-policy
pnpm check:commits
```

For packaging or runtime dependency changes, also run `pnpm test:package`.
`pnpm benchmark:scan` writes large temporary fixtures and is an explicit,
separate benchmark, not a normal unit test.

Biome is pinned in the workspace. `pnpm lint` checks an explicit baseline of
correctness and security rules; it does not enable every opinionated rule.
`pnpm format:check` checks formatting, while `pnpm format` applies it. Generated
files and local ignored data are excluded. A one-time formatting baseline was
introduced with this tooling; future changes should avoid unrelated formatting.

## Commit messages

Follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

```text
type(scope): imperative summary

Explain why the change is needed and any non-obvious trade-offs.
```

- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`,
  `ci`, `chore`, `revert`.
- Scope is optional. Prefer a stable area such as `desktop`, `search`, `tabs`,
  `workspaces`, `ipc`, `viewer`, `deps` or `docs`.
- Write the subject and body in English. The automated policy requires printable
  ASCII, a subject of at most 72 characters, no trailing full stop and a blank
  line before a body. Keep examples in English or romanize Chinese filenames.
- Use the imperative: `fix(search): match long pinyin queries`, not
  `fixed search`, `update`, `debug:` or an unstructured merge message.
- Use `!` and a `BREAKING CHANGE:` footer when an incompatible change warrants it.
- Do not invent changes, backdate commits, remove authorship or add someone
  else's sign-off. Existing historical commits describe behavior at their own
  point in time, not necessarily the current shortcuts.

Enable the optional local commit-message hook explicitly:

```powershell
pnpm hooks:install
```

This sets `core.hooksPath` for this checkout only. It does not change global Git
configuration. Disable it with `git config --local --unset core.hooksPath`.
The CI policy also checks reachable commit messages independently of local hooks.

## Pull requests

Explain the user-facing problem, the change and what you actually tested.
Include a privacy-safe screenshot for visual changes. State known limitations
and test failures rather than hiding them. Never attach real user files,
credentials, personal paths or unreviewed diagnostics.

Use a Conventional Commit title so a future squash merge can use it directly.
Use a pull request for master. Branch protection requires the Windows `validate`
and `english-conventional-commits` checks, an up-to-date branch and resolved
conversations, including for administrators. Force pushes and deletion are
disabled. The current single-maintainer setup requires no additional reviewer;
increase that requirement when another maintainer joins.

## Architecture and safety

- Electron's main process owns file access and operating-system operations.
- Preload is the bridge; renderers must not gain Node.js integration.
- Runtime IPC validation and sender checks must not be replaced with TypeScript
  types alone.
- Do not weaken Markdown sanitization or execute previewed files.
- External plugins are trusted code, not isolated extensions. Do not describe
  them as sandboxed.
- File-operation tests must use disposable fixtures. Workspaces are browsing
  state, not backups of the files they reference.

## Maintainers

Before making the repository public, complete the explicit blockers in
[the open-source readiness review](docs/maintainers/open-source-readiness.md).
History rewrites require a verified backup and coordination with collaborators;
never force-push a rewritten history as part of an ordinary contribution.
