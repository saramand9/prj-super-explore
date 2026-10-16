# Third-party notices and asset provenance

This is an attribution inventory, not a substitute for upstream license texts or
a claim that binary redistribution obligations are complete. The project-wide
license is pending maintainer approval.

## Direct runtime components

The installed dependency metadata reviewed on October 17, 2026 identifies:

- `@lvce-editor/ripgrep` 4.1.0: MIT; a wrapper that downloads and bundles ripgrep.
- `dompurify` 3.4.13: MPL-2.0 OR Apache-2.0.
- `highlight.js` 11.11.1: BSD-3-Clause.
- `marked` 18.0.4: MIT.
- `pinyin-pro` 3.28.1: MIT.

Renderer bundles also contain dependencies declared under development tooling,
including React, React DOM, Zustand, Lucide and TanStack Virtual. Electron ships
Chromium/Node.js and upstream third-party notices. Being declared as a
`devDependency` does not mean that a component is absent from the distributed app.

The ripgrep executable has its own upstream license in addition to the npm
wrapper's license. Preserve Electron's and ripgrep's distribution notices, and
assemble the required texts for every shipped JavaScript and native component
before distributing a new installer.

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
`apps/desktop/build/icons/`. Their original authorship, source and redistribution
permission are not documented in the baseline. The maintainer must establish
that provenance, or replace the assets with originals or appropriately licensed
alternatives, before granting a project-wide license over them.

`docs/assets/dual-pane.webp` is a privacy-reviewed screenshot of Explore using
synthetic files in a dedicated demo directory. It is not evidence of third-party
icon ownership and does not resolve the asset-provenance question above.

Do not claim that every asset is MIT/Apache-licensed simply because a project
license is later selected.
