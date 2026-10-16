# Third-party notices and asset provenance

This is an attribution inventory, not a substitute for upstream license texts or
a claim that binary redistribution obligations are complete. Explore's original
code and documentation use the [MIT License](LICENSE); third-party components
retain their own licenses and are not relicensed by that choice.

## Direct runtime components

The installed dependency metadata reviewed on October 17, 2026 identifies:

- `@lvce-editor/ripgrep` 4.1.0: MIT; a wrapper that downloads and bundles ripgrep.
- `dompurify` 3.4.17: MPL-2.0 OR Apache-2.0.
- `highlight.js` 11.11.1: BSD-3-Clause.
- `marked` 18.0.4: MIT.
- `pinyin-pro` 3.28.1: MIT.

Renderer bundles also contain dependencies declared under development tooling,
including React, React DOM, Zustand, Lucide and TanStack Virtual. Electron ships
Chromium/Node.js and upstream third-party notices. Being declared as a
`devDependency` does not mean that a component is absent from the distributed app.

The ripgrep executable has its own upstream license in addition to the npm
wrapper's license. Preserve Electron's and ripgrep's distribution notices, and
retain the required texts when distributing a new installer. The build runs
`apps/desktop/scripts/collect-licenses.mjs` to copy upstream license/notice files
for the production dependency graph and renderer runtime roots into
`resources/licenses/components/`, with a path-free `components.json` inventory.
It fails when a selected package has no license text. This includes install-time
dependencies as a conservative superset, not a claim they all execute in Explore.
Electron's `LICENSE.electron.txt` and `LICENSES.chromium.html` are preserved next
to the executable. Ripgrep 15.0.0 and its PCRE2 10.45 license texts are retained;
the source URLs and release-risk assessment are recorded in
[1.0.2 validation](docs/maintainers/release-1.0.2-validation.md).

Use the actual lockfile and packaged artifacts for that work:

```powershell
pnpm licenses list --json
pnpm licenses list --prod --json
pnpm test:package
```

Review generated inventories before publishing them: tool output can include
absolute local installation paths. A package-manager inventory alone does not
prove that all bundled code and native binaries have been covered.

## Visual assets

The repository includes raster icons under
`apps/desktop/src/renderer/assets/icons/prism/` and an installer icon under
`apps/desktop/build/icons/`. The maintainer reports creating these assets with
AI tools. The generator, applicable terms and any reference-image permissions
still need to be recorded before including the assets in the project's MIT
license representation. They remain excluded pending that documentation; this
is not a finding that the assets infringe anyone's rights. Preserve generation
records and document any attribution or redistribution conditions.

`docs/assets/dual-pane.webp` is a privacy-reviewed screenshot of Explore using
synthetic files in a dedicated demo directory. It is not evidence of third-party
icon ownership and does not resolve the asset-provenance question above.

Do not claim that every asset is MIT-licensed simply because the project's
original code uses MIT. Preserve each third-party asset's applicable terms.
