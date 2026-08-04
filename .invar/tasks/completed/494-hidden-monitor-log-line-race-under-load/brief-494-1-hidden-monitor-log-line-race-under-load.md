# Brief 494-1 — the hidden-monitor log assertion races its in-flight sample

## In plain words

The monitoring smoke asserts that hiding the pane stops log lines,
but it snapshots the line count while a sample can still be in
flight. Under gate load it failed once with one extra line. Make the
assertion condition-shaped: wait for the sampler to be at rest, then
snapshot, then assert no growth.

## Evidence

[Task #494 file](task-494-hidden-monitor-log-line-race-under-load.md): gate-487 red (log preserved at
/tmp/merge-gate-failures.736e0d6511a85855/), solo-green same tip,
assertion at smoke-monitoring-harness.ts:375 ("a hidden monitor
writes no log line either").

## Reproduce by DRIVING first

Solo first; then reproduce the race under load (parallel burner or
paired smokes) or by instrumenting the sampler to prove the in-flight
window exists. Read the monitoring pane's graph state for the rest
condition (sample counter + any pending timer) — the app publishes
monitoringSampleCount already.

## Fix shape

After hiding: wait for the graph condition that DEFINES rest (no
pending sample; counter stable across one settle), THEN read the line
count, THEN assert no further growth across the quiet window. Never
widen the window; never sleep.

## End state

Solo green; N repeated loaded runs green; a planted extra-line defect
makes it red (positive control); report names the in-flight window
with evidence.

## Invariants in scope

- Harness waits observe conditions not frame ordinals; Every wait
  names itself ([scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md))
- Observability never crashes the app ([src/modules/system/system.invariants.md](../../../../src/modules/system/system.invariants.md))
Answer record by record; name misses.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy even when None observed.

## Instrument feedback

EASY / CONFUSING / MISSING; asks get converted.

## Rules

Never run scripts/merge-gate.sh; worktree commits skip the full gate
via the planted policy (or SKIP_GATE=1 if absent); the conductor
gates and lands.
