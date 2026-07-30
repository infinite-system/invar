# Brief #393 round 1 — idle CPU with multiple workspaces: measure, then fix

## The evidence

User, on a build CONTAINING the #380 dashboard-motion fix and the build
hotfix: idle CPU still does not return to idle when multiple workspaces are
open. Earlier user numbers on the old binary: 15-25%. #380 already proved
one generator (dashboard motion) and killed it; something else still burns.

## This is an EXPERIMENT, not a diagnosis

Ranked candidate generators — measure each, do not assume:

1. Per-workspace subsystems that tick regardless of visibility: terminal
   PTY read pollers, file watchers, LSP clients, agent pane loops — one
   set PER OPEN WORKSPACE. If cost scales with workspace count at idle,
   this class wins.
2. The render loop waking on a timer even with zero dirty cells (a paint
   scheduler that never parks).
3. Status-bar or chrome clocks (durations, spinners) requesting frames
   while nothing changes.
4. Hidden workspaces re-rendering: a workspace switch that leaves the
   inactive workspace's render or data loops alive.

Say so plainly if a candidate measures zero.

## Method

- Extend the #380 toggle-matrix probe (it is in the completed task 380
  folder: probe file 380-dashboard-idle-cpu-toggle-measurement.ts;
  /proc/<pid>/stat arms + complete-frame counts). Fixture workspaces only
  — NEVER open this repo as the workspace with its real tasks file present
  (its folderOpen tasks spawn real sessions).
- Arms: 1 workspace vs 2 vs 4, all idle, pane set constant; then
  per-candidate toggles inside the winning arm. Five-second samples,
  paired: candidate arm and quiet reference back to back.
- Find the generator, fix at the generator (park timers when nothing is
  observed — the same shape as #380: cost tracks the actively observed
  set), not by widening intervals.
- Permanent contract: a timeless count-based assertion (no timer alive /
  zero frames emitted in an idle multi-workspace fixture), plus a positive
  control proven red.

## End state

Commit on the branch BEFORE writing READY; report in the main checkout's
in-progress folder for this task, header with commit hash and GATE_EXIT
read from the hook output. Report the measured matrix (before/after per
arm) like the #380 report did.

## Invariants in scope

- Cost tracks the actively observed set — the root contract; grep [project.invariants.md](../../../../project.invariants.md) for the record and answer it record by record.
- Dashboard motion exists only while observed — [src/modules/tasks-dashboard/tasks-dashboard.invariants.md](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md) — must stay upheld; your fix is its sibling, not its replacement.
- Harness input and output use the real PTY — measure through the harness driver, not a mock.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s bycatch taxonomy (runtime defects, invariant
violations in function, comment drift, distillation possibilities,
generator drift, plain nonsense). Carry the section even when it reads
None observed.
