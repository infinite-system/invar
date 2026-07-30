# Brief #346 round 5 — restore the wrap and go-to-line actions on the row

## Why

Your round-2 resolution removed view.toggleWordWrap and editor.goToLine
from the bottom row. That reading was defensible from the task spec, but
the USER, in a message newer than the spec, asked for one-cell padding
next to the go-to-line ICON and keyboard shortcuts for BOTH actions —
proof the affordances must survive the redesign. Restore them.

## The change

1. The two editor-action buttons return to the bottom row, coexisting with
   the workspace tabs: tabs on the left, then the action buttons, then the
   drag span, then the three right controls — the same truncation
   precedence the old row modeled (actions truncate before the drag cell;
   at very narrow widths actions drop first, tabs survive).
2. Keep publishing tab segments and action segments DISTINGUISHABLY in the
   geometry (the smoke must be able to assert both by identity: tabs by
   space label, actions by commandId). If one published field cannot carry
   both cleanly, split the fields rather than overload editorActions.
3. Re-assert main's original truncation facts in the smoke (expected
   command identifiers present at wide sizes, absent below the truncation
   width) ALONGSIDE your tab assertions.

## End state

Commit on the branch before READY; full gate green on the tree; a new
report (or one newer than this filing) with commit hash, GATE_EXIT, and
the published-geometry decision named. Worktree clean; no push, no land.

## Invariants in scope

Same set as round 2; additionally re-answer "Tab bars share paint and hit
testing geometry" for the mixed tabs-plus-actions row.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy; carry the section even when it reads None
observed.
