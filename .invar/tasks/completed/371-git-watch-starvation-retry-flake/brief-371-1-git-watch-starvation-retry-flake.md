# Brief 371-1 — kill the git-watch contention retry for real

## In plain words

The git-watch smoke passes solo and on retry, but fails on the
contention tier often enough to have a tally. Find why its wait
starves under load and make it a true condition. Never widen a
timeout; never add a sleep.

## Evidence trail

[The task file](task-371-git-watch-starvation-retry-flake.md) — sightings incl. gate-487 r2 (2026-08-03,
preserved log /tmp/merge-gate-failures.736e0d6511a85855.148088/) and
the #177 retry tally.

## Reproduce by DRIVING first

Solo (likely green), then under load beside another smoke or a CPU
burner. At the timeout, capture the app's actual graph state (watcher
status, pending refresh, debounce state) BEFORE hypothesizing. The
usual rivals: a debounced watcher whose flush loses the race under
load; an inotify event coalesced away; a wait keyed on a repaint
instead of the watch condition.

## End state

Solo green; 5 consecutive green under your load harness; mechanism
named in the report with the separating observation per rejected
rival.

## Invariants in scope

- Harness waits observe conditions not frame ordinals; Every wait
  names itself ([scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md))
Answer record by record; name misses.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy even when None observed.

## Instrument feedback

EASY / CONFUSING / MISSING; asks get converted.

## Rules

Never run scripts/merge-gate.sh; commits in your worktree skip the
gate automatically once #438 lands — until then SKIP_GATE=1; the
conductor gates and lands.
