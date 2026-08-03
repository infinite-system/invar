# Task 464 — panel surfaces fail under contention

Priority: flake-evidence
State: ACTIVE
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
Source: bycatch from #457 (gate determinism) and #459 (panel reachability), 2026-08-02

## Why this task exists separately

The conductor first appended these to #459's task file. That was wrong:
#459 landed, and a completed task file is a record of what happened, not a
queue of what remains. Live work needs a live task.

## The defects — all in panel surfaces, all under load

1. **`panel-chrome` fails under contention.** Passed only on retry in two
   of #457's acceptance runs, failed both attempts in another, and failed
   as a report-only job in runs 4 and 5 of the definitive series on an
   UNCHANGED commit. It failed again in #459's landing gate
   (`/tmp/gate-459e.log`, CONTENTION TALLY).

   #457 moved it to the report-only contention tier, so it no longer blocks
   a merge. That is a stay of execution, not an acquittal. This task owns
   the product fix.

2. **Plugin-manifest panel geometry.** The wait `the structure scrollbar
   publishes its settled dock-height geometry` timed out on BOTH attempts
   of a FAST gate and later caused behavioral-contract retries. Only this
   panel lifecycle failed inside an otherwise green behavioral suite.
   `scripts/behavioral-contracts.sh` stays blocking and skips only this
   independently registered loaded job.

3. **Structure-scrollbar settlement, seen once (#459 bycatch).** The first
   plugin-manifest run timed out at that same wait while the grid painted
   the Structure pane AND its scrollbar. The immediate rerun passed. Same
   wait as item 2 — treat them as one sighting with two observations, not
   two defects, until evidence separates them.

## The first hypothesis to test

#457's mechanism is the model: a wait that reads the LIVE emulator through
`snapshot()` instead of a completed synchronized frame will see a grid
mixing two paints, and under load that window widens. Item 3's detail —
the grid HAD painted the pane and the scrollbar when the wait timed out —
fits that shape exactly.

Test it before assuming a product defect. Do not widen any budget.

## Both arms

A repaired wait must still FAIL when the geometry genuinely never settles.
A fix that makes the wait unable to fail is worse than the flake.
