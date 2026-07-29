# 240 — two Momentum-scoped records sit in the ui contract; decide their home

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: verification-integrity

## Outline

Bycatch of #230. *Same-direction notches accumulate until the glide ceiling*
and *A fast glide crosses rows in many small steps* live in [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)
but scope `Momentum.queueImpulse` / `Momentum.stepMomentum` — no
`src/modules/ui/` site. [scroll.invariants.md](../../../../src/modules/ui/scroll.invariants.md) already carries the near-twins
(*Same-direction impulses accumulate to the ceiling*, *The glide tail is
bounded and effective*), and its header says surface rules stay in module
contracts — which these are not. Same question for ui's *One writer per
scroll regime per frame* vs scroll's *One generator owns each scroll
position*.

Decide per pair: move, merge, or refine to a genuine surface binding. The
burden-of-proof rule binds: the records must come out SHORTER or clearer, and
[ui.lattice.md](../../../../src/modules/ui/ui.lattice.md) + [scroll.lattice.md](../../../../src/modules/ui/scroll.lattice.md) must both stay fully woven. Coordinate
with #224 (Momentum's ambient clock) — if both run, sequence this after so
the records describe the repaired Momentum.

## Invariants in scope

- The four named records in [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) and [scroll.invariants.md](../../../../src/modules/ui/scroll.invariants.md).
- Both lattices — links must resolve after any move.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy, all seven categories. The READY report carries
`## Bycatch` even if it reads `None observed`.

## Sources

- `report-230-...md`, contract-layer-gap items.
