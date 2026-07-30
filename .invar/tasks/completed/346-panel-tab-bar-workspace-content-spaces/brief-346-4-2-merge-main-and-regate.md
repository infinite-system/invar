# Brief #346 round 2 — merge main forward and re-gate on the combined tree

## Why

Your READY commit 9ac75e4b is green on ITS OWN tree, but main moved while
you built: it gained the right-dock proportional bound with a live splitter
maximum in RootView (task 383), the dashboard idle-CPU fix (task 380), a
hotfix for a cross-branch semantic conflict exactly like the one now
possible here, and the slim-splitter and separator-actions assertions in
the panel-chrome smoke (task 345 era). A conductor merge attempt hit one
textual conflict and a semantic overlap:

- scripts/harness/smoke-panel-chrome-harness.ts: your tab-row assertions
  conflict with main's separator assertions (editor actions
  view.toggleWordWrap and editor.goToLine before the drag span, three right
  controls, the centered heavy-line splitter paint). Note your branch
  repurposes the published editorActions field for TAB segments while
  main's arm expects command identifiers on the separator — decide whether
  these are two different published geometries in the merged design, and
  keep BOTH assertion families wherever the merged design keeps both rows.
  If your redesign genuinely removed a surface main asserts, adapt that
  assertion to the new geometry and say so in the report.
- src/modules/ui/RootView.ts auto-merges textually — verify SEMANTICALLY
  that task 383's one-options-object wiring (the live right-dock splitter
  maximum) survives your panel changes. An auto-merge broke the build once
  today; do not trust it.

## End state (mechanically checkable)

1. main merged into fleet/346-panel-tab-bar-workspace-content-spaces.
2. Full gate green ON THE COMBINED TREE through the commit hook.
3. A NEW report file in the main checkout's in-progress folder for this
   task, or an updated one newer than this brief's filing stamp, with the
   merge commit hash and GATE_EXIT in the header, plus one section naming
   how each conflict was resolved and a Bycatch section.
4. Worktree clean; do not push, do not land.

## Invariants in scope

Same set as round 1, plus from the new main:
- The right dock stays a bounded minority of the row — [src/modules/layout/layout.invariants.md](../../../../src/modules/layout/layout.invariants.md)
- Splitter paint and hit testing share one geometry — [src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s bycatch taxonomy; carry the section even when it
reads None observed.
