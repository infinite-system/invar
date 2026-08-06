# 529 — panel chrome rapid expand flake

Priority: flake-evidence
State: COMPLETED — cef91323 — Gate flake killed: settle-boundary status republish (starved publisher) + hover-verified edge drags (hit-grid race); 20/20 contention green; record refined with the starved-wait impossible-shape.
Engine: claude
Environment: linux
Model: fable-5
Effort: medium

## In plain words

The panel-chrome drive sometimes times out under load at the 100,000-line
rapid expand cycle, on branches that did not touch panels. Collect the
evidence and find the load-sensitive wait.

## Evidence (2026-08-06, three sightings across unrelated branches)

- Gate-514 round 1: timed out at "10-line add header press cancels
  cleanly"; did not reproduce over solo + 2x-concurrent runs.
- Gate-518 round 1: same smoke timed out; round-2 root cause there was
  the dock tooltip bug (fixed), but the contention tier had flagged it.
- Gate-521 rounds 1-2: first isolated run timed out at the 100,000-line
  rapid expand cycle before the drag assertion; next three runs passed.
  #521 changed no panel code, wait, timeout, or assertion.

## Outline

Census the failing waits (which status/grid condition, at which step)
across the three failure logs; run the smoke N times under deliberate 2x
and 3x contention; identify whether the wait is pre-satisfied,
load-bound, or racing a publisher (a wait must be a condition). Fix the
wait or the publisher, never the timeout.
