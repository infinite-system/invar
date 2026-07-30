# Summary #383 — right panel proportional

Landed 97b0a60f (branch commit 803c2b38), 19m dispatch-to-landing, opus lane.

What happened: right dock width was an unbounded persisted number; at 80x24
the editor got 14 cells to the dock's 28. Fix at the layout generator: two
bounds, smaller wins (30% of row; one column under the editor-share split).
Stored width is a request, never rewritten — resize back restores the drag.
New record "The right dock stays a bounded minority of the row" with a
proven positive control.

Bycatch converted before merge: #390 (left dock has the same inversion —
user-visible), #391 (splitter unclamped host writes + min>max), #392
(contract citation drift + missing layout lattice).

Conductor repairs at landing: land.sh could not resolve the claude session
file (link never written at dispatch for this manual-ish lane) — wrote
session-link by hand from the worktree-keyed project dir, archive OK.
