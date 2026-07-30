# Brief #387 round 3 — merge main forward; drop your boot fix; re-gate

Good verdict and good measurement discipline. Three things before landing.

## 1. Your boot fix duplicates a main hotfix — main's version wins

Main already fixed the boot break as commit c325bb41: it keeps task 348's
wall-clock exports and changes TasksDashboardOverview to use
TASKS_MOTION_STEP_MILLISECONDS (one tick, one step). Your 6601193c instead
restores the pre-380 values, which resurrects the paint-count semantics
task 348 removed. At merge, resolve BOTH files to MAIN's side: main's
tasks-status.ts exports and main's overview constants. Your task commit
9496aa8a must survive; your boot-fix commit's content must not.

## 2. Merge main forward — it changed your ground

Main gained: the workspace panel tab-bar redesign (task 346, tabs +
restored wrap/go-to-line actions + drag span + controls on the bottom
row), the theme-glyph OSC 66 emulator fix (task 386), and the right-dock
proportional bound (task 383). Your PanelSeparatorRow pad and the
panel-chrome smoke assertions must reconcile with the redesigned row:
the pad cell sits before the drag span in the NEW row order (tabs,
actions, pad, drag, controls). Re-drive after the merge; keep both
assertion families in the smoke.

## 3. Re-gate on the combined tree

Your behavioral-contracts red ("the large fixture shows only held READY
rows after scrolling") is very likely CURED on current main: task 346's
round changed exactly that wait (the DEGRADED badge could push READY
off-grid — filed as task 396). Expect green. If the step still fails on
the combined tree, run it standalone on the main tip and report both
numbers — do not SKIP_GATE this round.

## End state

main merged in; both semantic resolutions named in the report; full gate
green on the combined tree with GATE_EXIT read from the hook; new report
with the merge hash. Worktree clean; no push, no land.

## Invariants in scope

Same set as round 1; your two refined ui records ride the merge. Also
re-answer "Tab bars share paint and hit testing geometry" for the pad
cell inside the mixed row (task 346's record).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy; carry the section even when it reads None
observed. Your bycatch 3, 4, 6, 7 are filed as tasks 398, 399, 400 — do
not re-fix them here. Bycatch 8 (the pkill) is noted; use the recorded
pid next time, nothing else to do.
