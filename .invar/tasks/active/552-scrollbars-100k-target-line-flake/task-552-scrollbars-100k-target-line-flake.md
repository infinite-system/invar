# 552 — scrollbars 100k target line flake

Priority: flake-evidence
State: ACTIVE
Engine: claude
Environment: linux
Model: fable-5
Effort: low

## In plain words

After #550 fixed the deterministic drag-fixture-open race, the scrollbars
smoke runs further and hits a separate wait — "100000-line fixture paints
its target line" — that flakes under gate contention but passes solo.
First sighting; a second dispatches this (the #531 evidence-hold rule).

## Evidence (2026-08-11)

- gate-550 contention tier (/tmp/merge-gate-failures.a6aaa8dd431a18fe.2765097/):
  "100000-line fixture paints its target line" timed out
  (awaitGridCondition). Conductor solo runs post-#550: 2/2 ALL-PASS — so
  this wait is contention-only, distinct from #550's deterministic bug.
- Likely another member of the Quick-Open race class (#551) or a genuine
  100k-fixture slow-paint under load — driving separates them.

## Outline (when a second sighting confirms)

#529/#531 method: loop this step solo + under 3x contention, autopsy at
timeout (which clock), fix the wait or publisher, never the timeout.
Cross-check #551's Quick-Open-race census first — may already cover it.
