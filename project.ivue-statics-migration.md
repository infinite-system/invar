# BRIEF — `Static()` `$`-cached getters: shipped in ivue 2.2.0

> **TRACKED, PERMANENT (moved 2026-07-27).** This lived in the gitignored `tmp/` and would not
> have survived a fresh clone; #125 depends on it. If you are doing the migration, this file is the
> ivue author's handoff — the shipped semantics are authoritative here, not in any task description.
> Consumed by: `#125` (ivue 2.2.0 `$`-cached statics migration + SCREAMING_SNAKE literal getters).


*From the ivue-repo Fable to the Invar-repo Fable, 2026-07-26. Your
`tmp/TASK-static-cached-getters.md` (filed in the ivue repo's `tmp/`) is
implemented, tested, documented, tagged `ivue@2.2.0`, and awaiting the
user's `npm publish`. Everything you need for the migration sweep, plus
two design decisions made after your task was written and one finding
that belongs in YOUR contracts.*

## What shipped (as your task specified)

- Get-only static accessors named `$…` become compute-once-per-receiver
  caches: permanent getter on the wrapped class, value stored under
  `Symbol.for('ivue.staticCache.<name>')` as an OWN property of the
  receiver, guarded by `Object.hasOwn` (never walks the chain).
- Order-correct in both read orders — your elimination #1 (the
  hand-rolled self-replacement's parent-first shadowing) is covered by
  two dedicated tests, parent-first and child-first.
- Non-`$` getters stay live (the pinch-knobs), accessor pairs with a
  setter are untouched, a subclass overriding the `$`-getter itself
  wins, ancestor `$`-getters on the raw chain are wrapped and cache per
  receiver.
- 9 new unit tests; 184 total in the ivue suite; 100% coverage on all
  metrics. Core entry untouched at 1,112 B gzipped; `ivue/extras` is
  494 B (+126 B for the feature).

## Decision 1 — freeze ALWAYS, not `freezeInDev` (amended from your draft)

Your task specified dev-only freezing. We shipped unconditional
`Object.freeze` (shallow), for three reasons, per the user's call:

1. A dev-only freeze is a dev/prod behavioral divergence — the ivue
   engine has zero env branches by published doctrine ("Development
   should run production"), and the dangerous direction is real: a
   prod-only path mutating a cached template corrupts silently where
   dev never looks.
2. The cost is paid once per receiver per property (cache-fill, not
   per-read) — statistically zero.
3. Measured: frozen objects read no slower than unfrozen (see below).

The freeze described above was removed as a defect in ivue 2.2.1. A `$`-cached value is NOT
frozen: the `$` prefix promises stable identity per receiver and nothing more, and mutable memo
tables are legal.

## Decision 2 — get-only stands; no setter, no injection API

A setter on the accessor and an explicit interface
(`Klass.$recache(key, value)`) were both considered and declined. The
reduction that settled it: hierarchy-safety already dissolved the
need. A test wanting a different derived value overrides the knob (or
the `$`-getter) in a subclass — the per-receiver, order-correct cache
guarantees the child derives independently. Wholesale replacement is
the namespace `Class` slot. That is the complete set of routes, and
adding a third is divergence pressure on agent authors. Assignment to
a `$`-cache throws loudly in strict mode, and that stays: a free
invariant. `Static()` continues to inject nothing nameable. If real
downstream evidence of an unmet need ever appears, file a task with
it — later additions here are non-breaking by construction.

## The measurement formality (your acceptance #2 — on record)

Node v26.3.1, Linux VM, 50M warm reads × 3 rounds, best-of:

| shape | ns/read |
| --- | ---: |
| hand-rolled data property (after self-replacement) | 1.09 |
| hasOwn-guarded getter (shipped design) | 6.29 |
| unfrozen object property read | 2.79 |
| frozen object property read | 2.51 |

Delta +5.2 ns/read — the single-digit prediction held, no STOP
triggered. Frozen reads are marginally FASTER than unfrozen. The
user's framing for the ledger: the 1.09 ns alternative was never real
— it was N divergent hand-rolls with an order-correctness bug; ~5 ns
buys one idiom, one contract, one mechanism, forever.

## Your follow-up (as your task defined it)

After the user publishes 2.2.0: bump Invar to `ivue@^2.2.0`, then the
mechanical sweep — delete each `Object.defineProperty(this, …)` block,
keep the computation body, delete the `cache()` / `cachedSet()`
helpers. Acceptance: `grep -rn "Object.defineProperty(this" src`
returns zero + full merge gate. Note the public-delegate pattern
(`static get atRest() { return this.$atRest; }`) needs no change.

## A finding for YOUR contracts — method binding has the same hole, one topology over

Your elimination #1 generalizes: `Static()`'s lazy METHOD binding
still materializes a bound function as an own data property on the
receiving class (`defineProperty(this, key, …)`). If a consumer
extends the WRAPPED `Class` (not `$Class`) and the parent's method is
read before the child's, the child's chain lookup finds the parent's
own data property — a method bound to the parent — and any `this`-
dispatched statics the child overrides are ignored, order-dependently.

Invar is safe today because the standard says children extend
`$Class`. But that safety is convention, and your house rule is that
conventions this load-bearing get recorded or mechanized. Options,
your call: (a) record "extend `$Class`, never `Class`" as an invariant
with a conventions-gate check, or (b) file a task for ivue to move
method binding to the same hasOwn-guarded shape (small perf note: that
adds the ~5 ns guard to every warm method read, which unlike
`$`-getters CAN sit in hot paths — so (a) may be the better trade).
Evidence and measurement style per your own protocol.
