# Publishing the normalized history

The local `master` branch has an English Conventional Commit history. The old
local master is retained as `backup/pre-open-source-master-20261017`, and the
original preparation branch is retained as `chore/open-source-preparation`.
These are private recovery references, not branches intended for publication.

The verified Git bundle, rewrite callbacks, old-to-new commit map and machine-
readable verification report are stored outside the repository in the local
backup directory. Keep them private and retain a second copy before replacing
the remote history. Do not attach the bundle to a public release: it contains
the original branch/stash history and author metadata.

## What was preserved

The rewrite verified 108 corresponding commits: 106 original product commits
and two preparation commits. Author/committer identities and timestamps, commit
count and parent order (including the merge commit) are preserved.

Application blobs are unchanged at every corresponding commit. The only
historical content replacement is a personal directory example in the old
fork-tab design document, changed to a generic example. Subjects and bodies are
English ASCII and pass the repository's Conventional Commit policy.

Later validation/documentation commits are checked normally. A rewritten commit
ID is not a new attribution or a claim that old code had the current features.
Rewriting also invalidates any original commit signatures and external links
that depend on old IDs; evaluate downstream consumers before publication.

## Before replacing the remote

1. Complete the license, ownership, privacy and asset-provenance decisions in
   [the readiness review](open-source-readiness.md).
2. Coordinate with every collaborator and pause pushes temporarily. Preserve
   their uncommitted work and unpublished branches separately.
3. Verify the recovery bundle and map, then inspect `git log master` and run
   `pnpm check:commits`.
4. Read the current remote master tip immediately before publication. If it has
   moved since review, stop and inspect the new commits; do not overwrite them.
5. Obtain explicit approval for the history replacement. Use a branch-scoped
   force-with-lease pinned to that exact observed remote commit:

   ```text
   git push --force-with-lease=refs/heads/master:<verified-remote-sha> origin HEAD:refs/heads/master
   ```

   Replace the placeholder only after verification. This is a maintainer
   procedure, not a command automatically executed by this preparation.

6. Verify the remote tip and hosted CI, inspect the resulting README and license,
   then enable the intended public visibility and repository controls separately.

Never use a blanket `--force`, `--all` or `--mirror` push here. Do not merge the
old remote master into the normalized branch: that would reconnect the original
non-English history and defeat the migration.

## Collaborator recovery

For collaborators with no unpublished work, a fresh clone after the remote
replacement is the simplest path. For collaborators with unpublished work,
retain the old checkout and use the commit map to identify the equivalent base;
reapply only their own changes on the new history. Do not prescribe a destructive
reset or delete their old checkout before their work is recovered.

The visibility change, remote force-with-lease, author-email remapping and
project license grant were not performed automatically by this preparation.
