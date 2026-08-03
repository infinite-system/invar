# Task 479 — migrate the census tail

Priority: user-directed
State: ACTIVE
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high

## Scope

Round 2 of the wait migration (#478 landed round 1: the five unfalsifiable
controls + panel-chrome drag span). This round: the two contention-tier
files (smoke-plugin-manifest-harness.ts, smoke-scrollbars-harness.ts) FIRST
— they are the live gate flakes — then the census class-1 tail, file by
file, honest stop at a file boundary.

Work list: .invar/tasks/completed/470-harness-wait-defect-census/census-470-harness-wait-defect-census.md
Path map: .invar/tasks/completed/471-graph-reaches-the-whole-app/report-471-graph-reaches-the-whole-app.md
Rules identical to #478 round 1 (graph sequences / screen asserts; both arms
per converted control; declare coverage deltas; measure, never invent).
