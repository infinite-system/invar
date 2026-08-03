# Task 481 — shared-machinery waits and the Drive gesture-layer deletion

Priority: user-directed
State: IN-PROGRESS
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high

## Scope — one conflict domain, two jobs

1. **Migrate the shared-machinery wait sites** from the census remainder:
   scripts/tui-harness.sh (the sleep scar tissue around the now-working
   settle verb — convert the worst sleeps to settle/condition waits),
   scripts/harness/HarnessSmoke.ts, scripts/harness/PtyTestDriver.ts,
   scripts/harness/Drive.ts. The census names each site.
2. **Delete the rejected --gesture/panel-role layer in Drive.ts** (#466
   direction, user-vetoed, superseded by DriveSession). KEEP the generic
   status-excludes completion. Remove-the-capability discipline: a
   structural post-check proving no callers remain (grep + the smoke
   registry), and every consumer of Drive.ts verified after (the drive.md
   doc updated too).

Rules as prior rounds: graph sequences / screen asserts; both arms where a
control changes; DECLARE every wait/assertion decrease in
project.coverage-deltas.md (deletions of the vetoed layer included — name
the veto as the reason); honest stop at a file boundary.
