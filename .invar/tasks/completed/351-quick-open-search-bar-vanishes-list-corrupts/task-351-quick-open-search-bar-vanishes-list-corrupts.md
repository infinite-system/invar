# #351 — quick open: search bar vanishes and the list corrupts on scroll

State: COMPLETED — 7f57b019 — wrap-projection fix + compact-terminal scroll smoke; #354/#355 from bycatch
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## The report (user, 2026-07-30, verbatim symptom)

In Invar: Ctrl+O (quick open), type the query "326". The search bar
disappears from view. Then scrolling UP in the result list cannot recover
it — the list gets messed up. "Usability suffers greatly."

## Reproduction notes for the builder

- The query "326" in THIS repo matches many long task-folder paths
  (.invar/tasks/*/326-*, 326 briefs/reports) — suspect long-path rows or a
  large result set interacting with list layout/scroll.
- Reproduce by DRIVING in a PTY at the user's typical geometry and in this
  repo's working tree (read-only reproduction is fine — quick open does not
  execute anything).
- Separate rivals: (a) the results list grows over the input row (layout
  overflow eats the search bar); (b) scroll offset escapes bounds when the
  list shrinks/grows between keystrokes (stale scrollTop past extent);
  (c) row wrapping of long paths breaks the row-height assumption the list
  scroller uses (wrapped rows vs fixed-height math).
- Fix the winner; ratchet a smoke: bounded-list overlay keeps its input row
  visible at any result count and scroll position; scrolling to the top
  always shows the search bar.

## Invariants in scope (candidates)

- BoundedListPopup / overlay records in the ui contract (overlay dialog
  bounds are published in status — overlayDialogBounds/overlayScrollPositions
  are drive-assertable).
- Scroll contract: one generator owns each scroll position.
