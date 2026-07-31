# Task 428 — fold-dense row floor sits inside the load jitter band

Priority: verification-integrity
State: IN-PROGRESS
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## Evidence (2026-07-31, #382 gate)

behavioral-contracts fold-dense: green run rowsTravelled=1004
(floor 1000, margin 4); red run 995 (miss 5), FPS healthy both
(29.8/30.0). The gesture is time-driven so rowsTravelled varies with
load; the >=1000 floor is a zero-margin bound — an unstated
tolerance, per conductor doctrine. The branch that tripped it
(#382) changed only harness smoke + probe files.

## Work

Make the contract count-based for real: drive by ROWS (stop the
gesture at a fixed row count and assert stack shape + checkpoint
there), or derive the floor from the gesture's commanded travel with
its jitter measured (paired sampling), never a hand-set 1000 inside
the band. Keep FPS as report-only. Planted-defect red must still
fire (a genuinely truncated drive).
