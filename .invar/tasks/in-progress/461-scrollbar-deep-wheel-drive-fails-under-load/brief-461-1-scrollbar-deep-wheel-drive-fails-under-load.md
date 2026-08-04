# Brief 461-1 — kill the scrollbars contention residual for real

## In plain words

The scrollbars smoke fails on the contention tier in nearly every
gate at one wait: "the wrap-off editor reclaims the concealed dock's
columns". It is our loudest standing flake. Find why that layout wait
misses under load and make it a true condition — never a widened
timeout.

## Evidence trail (read first)

[The task file](task-461-scrollbar-deep-wheel-drive-fails-under-load.md) carries sightings; preserved gate logs from today:
/tmp/merge-gate-failures.*/contention-scrollbars-harness-*.log (several
runs). The #485 report and #356 r3 bycatch describe the same wait
timing out after the scrollbar drives PASS.

## Reproduce by DRIVING first

Run the smoke solo (likely green), then under synthetic load (the
contention tier runs it beside the full pool — reproduce with a
parallel CPU burner or by running two smokes at once). The failing
wait is the reproduction; capture WHICH condition the app actually
reaches (graph reads at timeout: dock state, editor columns, wrap
state) before hypothesizing.

## Fix shape

A load-honest condition: wait on the graph state that DEFINES
reclaim (dock concealed AND editor width equals the reclaimed
value), or fix the app if the reclaim genuinely stalls under load
(that would be a real defect, not a smoke bug — say which with
evidence). Never widen a timeout; never add a sleep.

## End state

Solo green; 5 consecutive runs green UNDER your load harness; the
gate's contention arm green on your tip (the conductor's gate at
landing is the final proof); report names the mechanism.

## Invariants in scope

- Harness waits observe conditions not frame ordinals; Every wait
  names itself ([scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md))
- One generator owns each scroll position ([src/modules/ui/scroll.invariants.md](../../../../src/modules/ui/scroll.invariants.md))
Answer record by record; name misses.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy even when None observed.

## Instrument feedback

EASY / CONFUSING / MISSING; asks get converted.

## Rules

Never run scripts/merge-gate.sh; SKIP_GATE=1 commits; the conductor
gates and lands.
