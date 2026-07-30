# #389 — tasks watch overpaints and shows more items than exist

State: COMPLETED — b982c493 — tasks watch: no phantom rows after shrink (autowrap tails clipped to live width)
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## The report (user, 2026-07-30, verbatim)

"also the fix for the 60fps tasks:watch now overpaints sometimes showing
more items than exist, some bug there"

## Reading

The recent tasks:watch render-cadence fix introduced a repaint defect:
stale rows survive a shrink (list shortens but old rows are not cleared),
so the view intermittently shows MORE items than exist. Classic
partial-repaint bug: the new paint path skips clearing lines beyond the
current row count, or a diff-paint keys on row content and never erases
removed tails.

## Task

1. Reproduce by driving: run the watch against a fixture task set that
   grows then shrinks; capture the frame where phantom rows appear.
2. Fix at the paint seam (clear-to-end-of-list or full-height clear on
   count decrease), not by reverting the cadence fix.
3. Contract: a count-based assertion — painted row count equals model row
   count after a shrink. Timeless, no FPS dependence.
