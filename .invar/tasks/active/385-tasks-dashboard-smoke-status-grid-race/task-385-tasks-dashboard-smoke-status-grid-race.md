# #385 — tasks-dashboard smoke reads the grid before it paints

State: ACTIVE
Priority: verification-integrity
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Bycatch from #348 (blocked its first gate; reproduced under load)

smoke-tasks-dashboard-harness.ts:352 reads
driver.snapshot().findText('#902 planted-ready') immediately after
awaiting the STATUS FILE for rightDockActiveContent === 'tasks'. Status
flip and grid paint are different events; under gate load the row is not
painted yet -> "READY task status target disappeared". Classic status-vs-
grid race (the #334 class: a settled wait must require status AND grid to
agree).

## Work

Make the wait observe the GRID condition (awaitGridCondition on the row
text), or the status+grid conjunction. Positive control: delay the paint,
prove red; both polarities.
