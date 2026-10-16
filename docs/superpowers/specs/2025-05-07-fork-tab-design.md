# Fork tab: historical design draft

Recorded date: May 7, 2025 (preserved from the original draft).
Status: historical design note, not the current behavior contract.

This document records the initial tab-cloning proposal. Pinning and workspace
persistence have evolved since then; consult current code and the README for
supported behavior.

## Original proposal

Add a Clone tab context action that creates another tab in the same pane,
initially pointing at the same directory. The two tabs navigate independently.

- Append the new tab without activating it, preserving the current task.
- Permit multiple tabs with the same path.
- Do not pin the cloned tab automatically.
- Keep cross-pane operations outside this proposal.
- Do not change existing Pin, Unpin or Close behavior.
- Do not add separate clone persistence in this initial design.

## Proposed implementation

In `store.ts`, add `forkTab(side, tabId)` to find the source tab's path and
call `addTab(side, path)`.

In `components/tab-bar.tsx`, insert Clone tab between pinning and closing
actions, call the store action and preserve existing pinned-tab persistence.
Do not activate or navigate to the new background tab.

The original menu example used a personal directory. A generic example is:

```text
C:\Users\Example
Pin tab
Clone tab
Close tab
```

This is an archival proposal, not evidence that today's implementation follows
all of these original decisions.
