# Task 500 — the Database Add click opens no popup under contention

Priority: flake-evidence
Engine: claude
Environment: linux
Model: fable-5
Effort: medium
State: ACTIVE

## In plain words

In the panel-chrome smoke under load, clicking Database Add for a
second database pane opens nothing: boundedListPopupOpen never
becomes true, so the click misses or the popup never mounts. The
#356 builder reproduced it twice standalone with a temporary probe
and classified it as a pointer-hit problem, not a wait-vocabulary
problem. Diagnose by driving with screen-derived click coordinates.

## Evidence

- #356 round-4 report Bycatch (completed folder after landing):
  container Add menu condition passed post-repair; the Database Add
  click for 'Database 2' then timed out; probe showed
  boundedListPopupOpen stayed false; reproduced twice.
- Gate log: /tmp/merge-gate-failures.8bee3f81d3ec34aa.1050976/
  contention-panel-chrome-harness-*.log
