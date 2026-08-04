# Task 494 — hidden-monitor log-line assertion races under gate load

Priority: flake-evidence
Engine: claude
Environment: linux
Model: fable-5
Effort: medium
State: IN-PROGRESS

## In plain words

The monitoring smoke asserts that hiding the pane stops log lines. Under
full gate load it failed once: the line count after hiding exceeded the
count while on. Solo on the same commit it passes. A sample already in
flight when the pane hides can still write its line — the assertion
compares counts without waiting for the in-flight sample to drain.

## Evidence

- 2026-08-03 gate-487 (tip 624494a6): behavioral-contracts FAIL,
  "a hidden monitor writes no log line either"
  (smoke-monitoring-harness.ts:375). Full log preserved:
  /tmp/merge-gate-failures.736e0d6511a85855.99163/
- Same smoke solo on the same tip: EXIT=0.
- The branch under gate touched no monitoring code or log path.

## Wanted

Make the assertion condition-shaped: after hiding, WAIT for the sampler
to report rest (graph condition), then snapshot the line count, then
assert no further growth over the quiet window. Never widen a timeout.
