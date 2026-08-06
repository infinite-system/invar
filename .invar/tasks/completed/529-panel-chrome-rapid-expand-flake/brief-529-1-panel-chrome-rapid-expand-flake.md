# Brief 529-1 — census and fix the panel-chrome contention flake

## In plain words

One panel drive keeps timing out under gate load on branches that did not
touch panels. It fired in five gates tonight and cost a retry each time.
Find the load-sensitive wait and fix the wait or its publisher, never the
timeout.

## End state (mechanically checkable)

A report newer than dispatch containing: the census table (each failure
log, the exact wait that timed out, the step number), a reproduction
verdict (reproduces under NxN contention or refuted with run counts), and
either a fix commit whose smoke passes 5x solo + 5x under 3x contention,
or a precise instrument diagnosis the conductor can act on.

## The census seed (five sightings, 2026-08-06 gates)

1. /tmp/merge-gate-failures.bd0013ddbc854489.1526167/ (gate-514 r1):
   "10-line add header press cancels cleanly" awaitStatusWithoutFrame.
2. gate-518 r1 (dir .255636bb2d9f2721.1816399): same smoke, timeout at
   awaitStatusWithoutFrame (the round-2 root cause there was the dock
   tooltip bug — but the contention tier flagged this smoke separately).
3. /tmp/merge-gate-failures.ca4dd900a63d01c3.1995990/ (gate-521 r1):
   "120-column a drag begun on the last cell of the drag span still
   resizes the panel".
4. gate-521 r2 (dir .ca4dd900a63d01c3.2060381): panel-chrome contention
   red again.
5. gate-504 r1 (dir .3f8ff73176461a37.2151814) and gate-505 r1+r2 (dirs
   .88c479c540e591d8.2311648, .88c479c540e591d8.2361561): same smoke.
   Also the #521 builder's isolated observation: first run timed out at
   the 100,000-line rapid expand cycle, three subsequent runs passed.

## Method (a wait must be a condition)

For each distinct failing wait: walk mutation -> reachable publisher ->
observed condition. Classify: pre-satisfied wait, proxy observation, or
a real load-starved publisher. Reproduce under deliberate contention
(run the smoke beside 2-3 concurrent full-smoke processes) — contention
is the hypothesis, not a tuning parameter. Paired sampling if timing is
suspected. Fix the condition or the publisher. Positive control: plant
the failure your fix prevents and show the smoke catches it.

## The bar

Never widen a timeout, never weaken an assertion, never mark the tier
skip. If the finding is that the smoke is HONEST and the app publisher
genuinely starves under load, that is a product defect — name the
starved path and fix it or report it as the finding.

## Invariants in scope

Panel records in [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)
("Panel controls share paint and hit geometry" and neighbors) — answer
whether the flake reveals a stressed record (holds only under an
unstated no-load assumption).

## Bycatch expected

Report per the taxonomy in [AGENTS.md](../../../../AGENTS.md), even when
None observed.
