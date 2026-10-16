# Local data, recovery and operational limits

## Settings and workspaces

Themes, text scale and the single-/dual-pane layout are saved locally.
Workspaces autosave directory and tab changes. On a normal window close, Explore
waits for the final workspace save to finish.

Settings live under Electron's user-data directory. A typical installed Windows
location is `%APPDATA%/Explore/config/`:

- `spaces.json`: saved workspace browsing state.
- `config.json`: application settings.
- `backups/`: recent workspace-state backups.

Workspaces do not back up the files they reference. Keep independent backups
before testing file operations or upgrading experimental builds.

If workspace loading fails, autosave pauses to avoid replacing the existing
data with an empty workspace. Repair the file or disk-access problem, then
choose retry. A save failure during close offers a choice to retry or leave
without saving.

After eight seconds of waiting for a close-time save, the app offers returning
to the window, waiting again or exiting without saving. A late save response
must not close a window after the user has chosen to return.

Only one application instance may write to a given user-data directory.
Starting another instance restores and focuses the existing window.

## Diagnostics and recovery

A failed panel can be reloaded or have its diagnostic information copied.
Renderer crashes and load failures can prompt a reload. The Help menu also
offers diagnostic copying and opening the log directory.

Logs are local to the user-data `logs/` directory. A log file is approximately
limited to 1 MiB, with the active file and one rotated backup retained.
Diagnostics can include paths and stack traces. Review them before sharing;
do not post unredacted logs or real files in public issues.

## Scans and search

Filename search (`Ctrl+F`) reports scan progress and indexes in batches using a
worker. Partial results can be queried before the scan completes. Stopping a
scan retains its current results; rescan starts again.

A scan is limited to 200,000 entries. Hidden directories, `node_modules` and
system recycle directories are excluded by default. Narrow the search root
when the limit is reached. Directory traversal and size calculation do not
follow child symlinks or Windows junctions, avoiding loops and duplicate work.

Full-text search is literal text search. It streams partial results and can be
stopped without clearing completed matches. Unreadable files do not discard
readable results. If native search is unavailable, the basic fallback warns
that ignore behavior can differ.

Cancellation is checked between operations; it cannot forcibly interrupt an
operating-system call already blocked on a disk or network share.

## File operations

Copying directories preserves links. A cross-volume move copies before deleting
the source; failed or cancelled copies keep the source. A failed copy can leave
partial destination data. Read the operation result and inspect both locations
before cleaning up.

Default internal dragging copies files. Hold Shift to move; Ctrl explicitly
requests copying. Confirm destination paths and overwrite decisions before
using an unfamiliar workflow. Previewing files is not the same as opening or
executing them through the operating system.

## Trust boundary

Only load trusted plugins. They are not isolated from application file access.
See [SECURITY.md](../SECURITY.md) for current limits and outstanding hardening
work before public binary distribution.
