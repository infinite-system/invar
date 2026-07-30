# Brief #389 round 1 — tasks watch overpaints phantom rows

## The report (user, verbatim)

"the fix for the 60fps tasks:watch now overpaints sometimes showing more
items than exist, some bug there"

## Reading (hypothesis, not diagnosis)

The wall-clock motion fix (task 348) changed the watch's repaint path. A
shrink-repaint defect fits: when the row list shortens, stale rows below
the new tail survive on screen, so the view intermittently shows MORE
items than exist. Rank your own candidates from the code before fixing;
say plainly if the shrink hypothesis measures wrong.

## Method

1. Reproduce by DRIVING: run the tasks watch against a fixture task tree
   that grows then shrinks (fixture folders only — never this repo's real
   tasks file as an opened workspace). Capture the frame where phantom
   rows appear.
2. Fix at the paint seam (clear the removed tail on count decrease), not
   by reverting the wall-clock cadence.
3. Contract AFTER the symptom is gone: painted row count equals model row
   count after a shrink — count-based, no FPS dependence. Positive
   control: plant the missing clear, prove red, remove.

## End state

Commit on the branch BEFORE writing READY; report in the main checkout's
in-progress folder for this task with commit hash and GATE_EXIT in the
header.

## Invariants in scope

- The CLI lenses are the dashboard's one generator — [src/modules/tasks-dashboard/tasks-dashboard.invariants.md](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md) — the watch and the pane project the same tables; fix must not fork them.
- Cost tracks the actively observed set — [project.invariants.md](../../../../project.invariants.md) — the clear path must not reintroduce full-repaint-every-tick.
- Task truth lives in the folders the CLI reads — [src/modules/tasks-dashboard/tasks-dashboard.invariants.md](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md) — phantom rows are a PAINT defect; confirm the model row set is correct before touching readers.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy (runtime defects, invariant violations in
function, comment drift, distillation possibilities, generator drift,
plain nonsense); carry the section even when it reads None observed.
