# Brief — BUNDLE: eight USER-DIRECTED UI nitpicks in one pass (#300 #302 #303 #304 #306 #307 #309 #310)

The user asked for these to be done in bulk by one agent. Each record's
verbatim words GOVERN its item. Read ALL eight records first:

- [task-300-depth-menu-highlights-wrong-row.md](../../active/300-depth-menu-highlights-wrong-row/task-300-depth-menu-highlights-wrong-row.md)
- [task-302-statusbar-git-user-icon-and-spacing.md](../../active/302-statusbar-git-user-icon-and-spacing/task-302-statusbar-git-user-icon-and-spacing.md)
- [task-303-shortcuts-settings-dialog-margins.md](../../active/303-shortcuts-settings-dialog-margins/task-303-shortcuts-settings-dialog-margins.md)
- [task-304-structure-row-marks-and-line-suffix.md](../../active/304-structure-row-marks-and-line-suffix/task-304-structure-row-marks-and-line-suffix.md)
- [task-306-tree-indent-one-key-tighter.md](../../active/306-tree-indent-one-key-tighter/task-306-tree-indent-one-key-tighter.md)
- [task-307-markdown-toggle-moves-to-breadcrumb-row-right.md](../../active/307-markdown-toggle-moves-to-breadcrumb-row-right/task-307-markdown-toggle-moves-to-breadcrumb-row-right.md)
- [task-309-markdown-no-blank-line-before-headline.md](../../active/309-markdown-no-blank-line-before-headline/task-309-markdown-no-blank-line-before-headline.md)
- [task-310-markdown-title-blue-like-subtitles.md](../../active/310-markdown-title-blue-like-subtitles/task-310-markdown-title-blue-like-subtitles.md)

## Work discipline

- ONE COMMIT PER TASK NUMBER, in ascending order, each message
  `<area>: <summary> (#NNN)`. No combined mega-commit — landing maps
  commits to records.
- Each item: smallest correct change at the owning seam; derive colours
  and metrics from theme/shared generators (derive-don't-copy); never a
  literal where a token exists.
- Both polarities per item (the new state asserted AND the old state
  absent), frame quotes before/after, both scales where the surface
  renders at scale.
- The FULL gate through the enforcing hook on the final commit at
  minimum; NO SKIP_GATE commits anywhere.
- If two items touch the same file (likely: #304 + #306 in structure,
  #307 near #300's breadcrumb/depth chrome), sequence them so each
  commit stands alone green.
- If any single item turns out non-trivial (needs a new mechanism, not
  a chrome adjustment), STOP that item, report it as deferred with the
  reason, and finish the rest — do not let one item sink the bundle.

## Invariants in scope

Structure records, tab-bar/breadcrumb records (fresh from #298), status
bar records, overlay-dialog records, tree render records. Extend the
existing contracts; add per-item assertions to the owning smokes.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report with a PER-ITEM section (evidence + commit hash each, or a
deferral with reason), final full-gate GATE_EXIT=0 through the hook,
green `bun test` + affected smokes. The conductor gates at landing and
completes all six records.
