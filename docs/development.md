# Development and validation

## Toolchain

Use Windows x64, Node.js 22 or later and pnpm 10.31.0. Run
`pnpm install --frozen-lockfile` from the repository root. Do not mix npm and pnpm
or regenerate a second lockfile.

```powershell
pnpm dev
pnpm typecheck
pnpm test:unit
pnpm test:e2e
pnpm test:commit-policy
pnpm check:commits
```

End-to-end tests build and start Electron with isolated temporary settings and
file fixtures. They cover navigation, workspace switching, search, preview,
rename conflicts, close/save races, recovery from damaged settings, save
timeouts, scan cancellation, panel recovery and duplicate instances.

The legacy `lint` and `format` commands need Biome installation/configuration;
they are not currently usable. This remains an explicit readiness finding, not
a silently skipped or replaced lint check.

## Packaging

```powershell
pnpm pack:dir
pnpm pack:win
pnpm test:package
```

Artifacts are generated in `apps/desktop/dist-electron/`. Directory packaging
produces a Windows x64 application; `pack:win` additionally creates an NSIS
installer. Package checks start the actual packaged executable with a disposable
`--user-data-dir` and a PATH that excludes development tools. The bundled ripgrep
is verified before and after packaging.

The current runtime has no Node native extensions that need compilation, so
electron-builder sets `npmRebuild: false`. Revisit that decision if a `.node`
extension is added and test its Electron ABI compatibility.

Electron and ripgrep are downloaded during dependency installation. If a search
component download fails, repair network access and then run:

```powershell
pnpm --filter @explore/desktop rebuild @lvce-editor/ripgrep
pnpm verify:search
```

The Windows checks workflow builds and tests but does not publish installers.
Production distribution still needs clean-machine installation, upgrade,
uninstallation, search without development tools, read-only directories,
disconnected shares and large-directory checks. Current packaging does not
configure code signing or automatic update publication.

On Windows, the resource-editing/signing helper can fail while extracting
symlinks if the account lacks the required permissions. Repeated GitHub helper
downloads can also fail independently of the application build. Resolve the
environment and retry the standard pipeline; a locally overridden unsigned
directory build is useful for a smoke check but is not a release certification.

## Benchmarks

`pnpm benchmark:scan` creates and cleans up 10,000- and 100,000-file fixtures in
the system temporary directory. It performs substantial disk writes and must be
run intentionally. See [the measurement method and recorded results](scan-benchmark.md).

## Layout

- `apps/desktop/src/main/`: operating-system services and IPC handlers.
- `apps/desktop/src/preload/`: renderer bridge and TypeScript declarations.
- `apps/desktop/src/renderer/`: React UI, plugins, workers and stores.
- `apps/desktop/tests/`: unit, Electron end-to-end, packaging and benchmark tests.
- `packages/shared/`: shared configuration, IPC and plugin types.
- `scripts/`: repository checks and development benchmarks.

## External plugin development

The loader reads a trusted local plugin's `main.js`, which exports a named
`createPlugin()` factory. It is not a package marketplace or a sandbox. Plugins
can use the application's file capabilities. Inspect unfamiliar plugins before
loading them, and do not claim process or permission isolation.

The optional launcher has a configurable shortcut, normally `Alt+Space`.
Filename search and literal full-text search are different features; do not
document full-text regular expressions unless that behavior is implemented and
tested. Current shortcuts are summarized in the README; historical commit
messages intentionally retain the shortcuts that existed at that time.
