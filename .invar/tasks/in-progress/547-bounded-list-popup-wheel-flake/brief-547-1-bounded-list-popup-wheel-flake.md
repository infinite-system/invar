# Brief 547-1 — kill the bounded-list-popup wheel flake

## In plain words

The bounded-list-popup drive times out on its wheel-scroll wait under
gate load, on branches that never touch the popup. Three sightings held.
Find the load-sensitive wait with the proven autopsy method and fix the
wait or its publisher, never the timeout.

## End state (mechanically checkable)

A report with: the exact failing wait, a reproduction verdict under 3-4x
contention with run counts, and either a fix whose smoke passes 5x solo
+ 5x under 3x contention, or a precise clock diagnosis naming the
starved path.

## Evidence (three sightings, task file has the log dirs)

[task-547](task-547-bounded-list-popup-wheel-flake.md): the wait is
"wheel scrolling changes the visible popup list or reveals its tail"
(smoke-bounded-list-popup-harness.ts). #522's builder proved by byte
census it is NOT that diff (18 clean solo+3x runs). Same wait failed on
#543's and #542's branches — code none of them touched.

## Method (the #529/#531/#538 pattern)

Loop the wheel step solo with an autopsy probe; at timeout ask WHICH
clock each side of the wait reads — the emulator screen, OpenTUI's
native hit grid, or the settled status file. Reproduce under deliberate
3-4x contention (contention is the hypothesis, not a tuning knob).
#529's committed probes and the three-clocks writeup are the template.

## The bar

A wait must be a condition. No timeout widening, no assertion
weakening, no tier skip. If the paint pipeline genuinely starves under
load, name the starved path — that is a product finding, not a smoke
fix.

## Invariants in scope

[scroll.invariants.md](../../../../src/modules/ui/scroll.invariants.md) records and the bounded-list-popup's own —
enumerate; answer whether the flake stresses one under an unstated
no-load assumption.

## Bycatch expected

Report per the taxonomy in [AGENTS.md](../../../../AGENTS.md), even when
None observed.
