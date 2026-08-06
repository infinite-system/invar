# 531 — scrollbars grid timeout sighting

Priority: flake-evidence
State: ACTIVE
Engine: claude
Environment: linux
Model: fable-5
Effort: low

## In plain words

One scrollbar drive once timed out waiting for pixels, not for the status
file. It is the only sighting and it is a different class from the fixed
panel flake. Hold the evidence; investigate only if it fires again.

## Evidence (2026-08-06)

- Gate-514 r1 (/tmp/merge-gate-failures.bd0013ddbc854489.1526167):
  smoke-scrollbars contention timed out in awaitGridCondition
  (PtyTestDriver.ts:453) — a GRID condition, so #529's status-publisher
  fix does not cover it. Observed once; #514's builder could not
  reproduce (500 + 100,000 lines, three isolated runs).

## Outline

Evidence-hold task: if the scrollbars contention tier fires again, attach
the new log here and dispatch with #529's method (loop the failing step
solo, autopsy at timeout distinguishing screen/hit-grid/status clocks).
Do not dispatch on one sighting.
