# Brief #448 round 3 — the gate holds the rule (folded from #449)

## In plain words

Cleaning up the old places is not enough. The habit grew to 61 places
because nothing ever refused it. So the last step of this task is to
teach the checker to say no, and to write the rule down as a promise
the checker keeps. Same branch, same green gate as the cleanup.

## Why this is now part of #448

USER RULING 2026-08-01: fold #449 into #448. The census that finds the
sites IS the census the gate runs. Building it twice, in two branches,
adds a drift seam and buys nothing. And a cleanup that lands without
its guard leaves an unguarded window on main while the habit keeps
producing. Measure, fix, then freeze the count — one job, three steps.

Rounds 1 and 2 are unchanged. This is their closing step, not a
replacement.

## What to build

1. **A `static-self-read-census` in
   [scripts/ast-query.ts](../../../../scripts/ast-query.ts)**, matching
   the shape of the censuses already there. It covers BOTH populations
   this task established:
   - instance bodies reading a static through a raw class name or a
     namespace `Class` slot instead of `this.constructor`;
   - static bodies naming their own class instead of `this`.
   Cross-class reads (`OtherThing.Class.x`) are CORRECT and must not
   be flagged. That distinction is the census's hardest job — get it
   right or the gate becomes noise people learn to bypass.

2. **Both arms, as fixtures.** A positive-control fixture under
   [scripts/fixtures](../../../../scripts/fixtures) that the census
   MUST reject, and a negative arm — correct `this` and
   `this.constructor` reads, plus a legitimate cross-class read — that
   it must stay silent about. Wire the positive control into the gate
   FIRST, the way the editable-text census does in
   [scripts/conventions-gate.sh](../../../../scripts/conventions-gate.sh):
   the gate fails if the census ever ACCEPTS its known-bad fixture.
   A census that can only fail toward pass is a decoration.

3. **Wire it into the conventions gate** as an enforced count.

4. **The allowlist shrinks only**, documented the way the canvas
   census is, with every entry carrying the one-line reason rounds 1
   and 2 recorded for it. Expected shape: the static-body population
   has no legitimate exception and should be a plain zero-count
   ratchet. The instance population may carry a few deliberate rung-3
   rows. If your allowlist is large, say so plainly — that is a
   finding about the rule, not a reason to widen the list.

## The contract half — this is the point of the task

#443 proposed a chosen record, `Live static reads follow the receiving
class`, and the conductor has NOT accepted it. Accept it or refine it
now, in [project.invariants.md](../../../../project.invariants.md),
and give it a **Verification that runs this census**. A record whose
Verification is a gate-run census cannot quietly rot.

Round 2 asked you to judge
[Construction goes through overridable seams](../../../../project.invariants.md).
Today that record is satisfied by the mutable `Class` slot alone, and
`AppLoader.test.ts` proves the slot is not enough — subclassing alone
cannot reach a self-reference. If your reduction says the record must
require a seam to follow the RECEIVER and not only the slot, propose
that wording here. Two records may turn out to be one; if so, say so
and reduce them.

Annotate the enforcement points. A record with no reverse pointer is
unprotected against the next editing session.

## The user's framing, recorded because it is the generator

"The self references to the class without extensibility became a bad
habit, we need to clean it up and strengthen that, otherwise we claim
full extensibility but it's actually not."

The defect is not that a class is hard to extend. It is that the
architecture ADVERTISES extensibility and then silently ignores the
subclass. The cleanup removes the lie; the census keeps it removed;
the record with a live Verification is what turns "extensible" from
something we say into something the gate refuses to let us break.

## Honest scope note

This census covers the static-read shape only. Other shapes carry the
same disease — constructor-baked dependencies, a class calling a
sibling by name, code reading `Class` where it should read `$Class`.
Do NOT widen this task to chase them. Instead, list in your report
which other shapes your census brushed against, so the conductor can
decide whether the claim needs narrowing or the enforcement needs
widening. Narrowing an overclaim is a legitimate outcome.

## Invariants in scope

- [project.invariants.md](../../../../project.invariants.md) —
  `Live static reads follow the receiving class` (proposed, unaccepted)
  and `Construction goes through overridable seams`. Both are directly
  in play; see the contract half above.
- Rounds 1 and 2 lists still apply.
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. Write the
`## Bycatch` section even if it reads `None observed`.

## Verification

- The census's own two arms, run and shown.
- The gate's positive-control step, shown failing on the known-bad
  fixture and passing after.
- The accepted record's Verification command, run.
- `bun test`, `bunx tsc --noEmit`, `bash scripts/conventions-gate.sh`,
  invariant checker `--all` and `--refs`, and `bun run drive` once.
- Do NOT run `scripts/merge-gate.sh`. Commit with `SKIP_GATE=1`.

## Report

Open with `## In plain words`. Keep rounds 1 and 2's two population
tables, add the census counts before and after, the allowlist with
reasons, and the contract proposal. Answer the invariants record by
record.
