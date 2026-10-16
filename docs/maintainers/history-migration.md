# Completed history migrations

Two maintainer-requested migrations preceded the current security work:

1. Normalize original commit subjects/bodies into English Conventional Commits,
   retaining the original graph, dates and application blobs. Replace one personal
   Windows-path example in historical documentation with a generic example.
2. Adopt MIT, then map the identified author/committer identity to the existing
   maintainer identity for privacy. All 110 corresponding trees, messages,
   timestamps and parent order were verified unchanged in the identity rewrite.

The cleaned master tip after these migrations is
`80de54ddd69d266b6dbba513505d000308f624d7`. It was pushed with an explicit,
exact-tip force-with-lease after checking that the remote had not moved. This is
historical context, not an instruction to force-push future changes.

## Recovery material

Original recovery branches and stash remain local. Verified Git bundles,
rewrite callbacks, old-to-new maps and verification records are outside the
repository. Keep these private: they intentionally preserve original identities
and historical personal-path content for recovery. Never push `--all`,
`--mirror`, backup branches or stash refs. GitHub may retain obsolete objects
and cached views independently of current branches; Support review is separate
from successful history replacement.

A privacy mapping must not be presented as proof of code ownership or a transfer
of copyright. Retain private provenance and obtain any necessary contributor or
employer permission independently.

## Normal contributions now use PRs

Master is protected, including for administrators: pull requests must have the
`validate` and `english-conventional-commits` checks passing, be up to date and
resolve conversations. Force pushes and branch deletion are disabled. There is
currently one maintainer, so no second-person approving review is required.
Do not disable protection for a routine release or merge the old unsanitized
history back into master.

For old clones with no unpublished work, a fresh clone is simplest. For those
with unpublished work, preserve the old checkout and use the private commit map
to reapply only the intended changes on the cleaned history. Do not prescribe a
destructive reset or delete uncommitted work. Old commit signatures and links may
be invalid after a rewrite; downstream consumers need coordination.
