# Brief #452 round 3 — pick up #442's dirty-dot fix

## In plain words

The dot on the tab was never missing. The checker was looking at the
wrong row. That fix is on the other branch. Merge it in and re-run.

## Conductor error, recorded

This brief was filed AFTER its steer, which inverts causal order and
breaks the rule that a steer must reference a record that already
exists. Filed late is better than never; the rule stands.

## What to do

1. `git merge fleet/442-panel-editor-tree-chrome-polish` — it carries
   the round 11 repair of `activeTabHasDirtyMarker`, which stopped at
   the first filename match and read the breadcrumb row after the
   editor-area rewrite moved breadcrumbs above the tabs.
2. Re-run the merged panel-chrome and dirty-marker smokes.
3. `bun test` in FULL.
4. Do NOT fix the four unrelated reds #442 listed: diff scrollbar
   thumb, agent-pane grid region, agent composer activation,
   structure-filter focus tone. Separate tasks, separate evidence.

## Invariants in scope

Rounds 1 and 2 stand. Plus the dirty-marker record in
[text.invariants.md](../../../../src/modules/text/text.invariants.md) —
#442 proposes adding `a dirty buffer whose visible tab marker cell is
blank` to its `Impossible if true`, because the record only ruled out
the false POSITIVE. Do not apply it; the conductor confirms contracts.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy.

## Report

Open with `## In plain words`. State the merge commit and whether the
merged smokes pass.
