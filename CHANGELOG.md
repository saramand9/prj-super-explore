# Changelog

Notable changes to the public release line are documented here.

## Unreleased

## 1.0.0 - 2026-10-17

Initial public release baseline. This consolidates the current application and
retires the earlier trial Release listings; it does not rewrite Git history.

### File management

- Dual-pane browsing, including two independent views of the same directory.
- Named workspaces with persistent folders, tabs, pinned items and appearance settings.
- Filename search with Chinese pinyin/initials and literal full-text search.
- File previews for code, Markdown, CSV and logs, with opposite-pane navigation.
- Copy/move conflict handling, safe folder creation, recycling and confirmed permanent deletion.

### Interface

- Grouped menu and command bars with consistent icons, aligned shortcuts,
  contextual disabled states, keyboard navigation and responsive sizing.
- Ten themes, adjustable text scale and single/dual-pane layouts.
- Clear update results separated from expandable installation/security notes.
- Global shortcuts remain available when the update dialog is hidden.

### Updates and safety

- User-confirmed Windows NSIS updates from the public GitHub repository.
- Stable release checks after startup and every six hours, with a manual Help entry.
- Separate download/install consent, SHA-512 integrity checks and progress display.
- Workspace/settings save barrier and active-file-operation guard before installation.
- Automatic installation on ordinary quit, prereleases and downgrades disabled.
- Sandboxed renderers, context isolation, fixed preload capabilities, validated IPC,
  production CSP and blocked foreign navigation, popups and permission requests.
- Bundled application-owned search binary and validated trusted-plugin installation.

### Open source and validation

- MIT project license, English contributor documentation and bundled third-party notices.
- Protected PR checks, English Conventional Commits, lint/format/strict type checks,
  unit tests, Electron UI regression and packaged startup tests.
- Tagged draft releases with installer, updater metadata, blockmap and checksums.
- Initial-release Windows acceptance covers clean installation, same-version
  reinstallation with data preserved, secure startup and uninstall.

### Compatibility and known limitations

- Higher-numbered trial installations require manual installation of 1.0.0;
  back up workspace/settings first. Downgrade protection remains enabled.
- Windows x64 installers are unsigned. Hash checks are not publisher authentication.
- External plugins are trusted code, not isolated extensions.
- Existing dependency advisories and provenance follow-ups remain documented in
  the maintainer readiness review; this is not a zero-vulnerability claim.
- Loopback updater tests do not certify a live GitHub-triggered NSIS replacement.
