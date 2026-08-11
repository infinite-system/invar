# Brief 531-1 — the scrollbars contention flake, three sightings

## In plain words

The scrollbar drive times out under gate load, rarely, on branches that
never touch scrollbars. Three sightings are now held. Find the
load-sensitive wait with the proven autopsy method and fix the wait or
its publisher, never the timeout.

## End state (mechanically checkable)

A report newer than dispatch: the exact failing wait per sighting log
(all three in the task file), a reproduction verdict under 3-4x
contention with run counts, and either a fix whose smoke passes 5x solo
+ 5x under 3x contention, or a precise clock diagnosis.

## Evidence

All three logs are listed in
[task-531](task-531-scrollbars-grid-timeout-sighting.md): gate-514 r1
(awaitGridCondition), #530's run (smoke-scrollbars-harness.ts:2398 "the
deep widest line is visible during the wheel drive", 6-way contention),
gate-539-r2 (contention tier). Note sightings 1 and 3 are GRID waits —
pixels, not status — so #529's settle republish does not cover them.

## Prior art (reuse)

#529's looping autopsy probes (its branch history) and the three-clocks
method: at timeout, ask which clock each side of the wait reads
(emulator screen / native hit grid / settled status file). #538's
hover-verified aim pattern if it turns out to be a lost gesture.

## The bar

A wait must be a condition. No timeout widening, no assertion
weakening, no tier skip. If the paint pipeline genuinely starves under
load, that is a product finding — name the starved path.

## Invariants in scope

- [scroll.invariants.md](../../../../src/modules/ui/scroll.invariants.md) records ("One generator owns each scroll
  position" and neighbors) — answer whether the flake stresses one
  under an unstated no-load assumption.

## Bycatch expected

Report per the taxonomy in [AGENTS.md](../../../../AGENTS.md), even when
None observed.
