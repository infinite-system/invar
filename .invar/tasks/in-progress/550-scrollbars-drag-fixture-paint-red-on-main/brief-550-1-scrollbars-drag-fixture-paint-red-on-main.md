# Brief 550-1 — smoke-scrollbars is deterministically red on main

## In plain words

The scrollbars smoke fails every time, solo, on the "<N>-line drag
fixture paints in the editor" wait. It has been masked as a contention
flake but it is deterministic on main. Find what broke it, fix the real
thing, restore the gate's scrollbar coverage.

## Source of truth

[task-550](task-550-scrollbars-drag-fixture-paint-red-on-main.md) — the
conductor's evidence: 3/3 solo timeouts on main, 2/2 at #547's parent
(so not #547), the wait and the 6 passes before it. This is a clean
deterministic repro.

## The deliverable, twice

CODE: the smoke passes 5x solo (and its contention-tier appearances
stop). Either the product regression that stopped the drag fixture from
painting is fixed, OR the smoke's wait condition is corrected for the
geometry a landed change moved (state which, with evidence).
VISUAL: if it is a product regression, drive the drag fixture and show
it paints before/after; if a smoke fix, no visible change.

## The bar

git bisect with the smoke as the test (it is deterministic — this is
cheap). Prime suspect per the evidence: #540 reserved the horizontal
scrollbar its own row, shifting editor content down one row — a wait
looking for the fixture at an absolute row would now miss. Drive to
confirm which. DRIVE ADVERSARIALLY; never widen the timeout; 5x solo
green + the contention appearances gone.

## Invariants in scope

- [scroll.invariants.md](../../../../src/modules/ui/scroll.invariants.md) records (thumb/position, one generator) and
  #540's "a scrollbar never hides content" (ui-design ch.5 / the record)
  — the reserved row is the likely geometry shift; answer each.

## Bycatch expected

Report per the taxonomy in [AGENTS.md](../../../../AGENTS.md), even when
None observed.
