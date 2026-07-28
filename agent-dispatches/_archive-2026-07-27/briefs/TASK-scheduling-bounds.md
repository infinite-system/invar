# TASK — #149: two scroll contracts whose bounds ignore real scheduling

Work ONLY in `/tmp/conductor-schedbounds` (branch `fix-scheduling-bound-contracts`, off latest
main). Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Report to
`/tmp/schedbounds-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`.

**You are the only timing-sensitive builder running, but two other builders are active.** Record
the load average next to every measurement so a load story can be tested rather than assumed.

## Two observations, one class

Both are canary calibration, NOT product defects — the load-bearing invariants held in both cases.
Neither has reproduced on demand. Both will intermittently red the gate until the premise is fixed.

**Instance 1 — the scale-travel budget.** `glide-input-coalescing` allows an 8-row difference
between 2,000-line and 100,000-line travel, described as one frame at maximum velocity. It measured
404 vs 413 rows — a 9-row difference — then passed on immediate repeat. Both runs applied exactly
150 of 150 impulses, so impulse preservation was perfect.

The arithmetic does not close: if one frame at maximum velocity moves at most 8 rows, and the two
scales differ by at most one frame of phase, 9 is impossible. So one premise is wrong. Candidates:
the ceiling the 8 is derived from; the claim that the difference is bounded by ONE frame; or a
boundary the budget does not model at all.

**Instance 2 — continuation delay overshoot.** `live-glide continuation slowed at boundary: frame
15 3->2 rows at 211.7ms (requested 200ms)`. The harness asked for a 200 ms delay; the OS delivered
211.7 ms; the continuation dropped 3 rows to 2. **The quiet lock was held cleanly**, so this is
not contention — it is ordinary scheduler jitter on a delay the contract treats as exact.

Note the tension worth resolving: #134 established that continuation must be keyed on MOTION, not
on a clock, and the production path honours that. But the HARNESS still depends on delay precision
to place its input at the intended point in the glide. If the delay slips, the flick lands later in
the decay and the observed continuation legitimately differs. That is a harness-side clock
dependency inside a contract whose whole point was to remove clock dependency.

## Method — sequences, not rates

1. **Print the SEQUENCE over 10+ runs for each instance, not a pass rate.** Every boundary defect
   this session was legible only as a sequence: the narration bug was a perfect `0,1,0,1…`
   alternation, and the rapid-ceiling contract spread 22-24 while row travel was exactly 197 every
   time. A rate hides structure; a sequence exposes it.
2. **For instance 2, record the DELIVERED delay beside the requested one** on every run, so the
   overshoot distribution is measured rather than inferred. If delivered delay is routinely
   200-215 ms, the contract's premise of an exact 200 ms is simply false and must be replaced.
3. **For instance 1, capture per-frame travel at both scales** in a failing case so the actual
   maximum per-frame movement is measured. If it can exceed 8, the ceiling the budget derives from
   is the bug.

## The fix must be DERIVED, and two shortcuts are forbidden

- **Do NOT widen 8 to 9.** **Do NOT loosen the 200 ms tolerance.** Both convert an observation you
  cannot explain into a silent allowance, which is exactly how a contract stops being a contract.
- A derived bound MAY end up looser than today's guessed one, and that is still an improvement —
  precedent: #144 replaced a 24-frame count with `ceil(verticalFlingCeiling *
  maximumGlideDurationMilliseconds / 1000 - 1)` rows, derived from capped velocity over the
  configured tail. Do the same shape of work here.
- For instance 2, the better fix may be to remove the harness's clock dependency rather than to
  bound it: place the follow-on input by an OBSERVED motion state (rows already travelled, frames
  elapsed) instead of by wall-clock delay. That would make the harness match the invariant the
  production path already satisfies. Consider it seriously and say why you did or did not take it.

Read `scroll.invariants.md` first — *Driven scroll contracts derive their quantities* is the record
this work is accountable to, and if your fix changes what that record should say, update it with
the reasoning.

## Also fix the cascade

When instance 2 fired, the same run reported `SMOOTHNESS_DEPTH_REFERENCE_FPS must name the measured
100k top FPS`. That was **not** a second defect: the earlier stage aborted before computing the
reference, so the depth stage found its input unset. It reads as an independent configuration
error and cost real diagnostic time.

**A staged instrument must say when a later stage was SKIPPED because an earlier one aborted**,
rather than emitting a missing-input error. Fix that reporting.

## Positive controls — one per changed bound

For each bound you derive, plant a violation of the property it now asserts and quote the red. A
bound that has never been seen to fail is not a bound.

## Verification — quote exact exit codes

`bash scripts/behavioral-contracts.sh` 3x with load average recorded per run, the two named
instruments directly 10x each with sequences printed, plus `bunx tsc --noEmit`, `bun test`,
`bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`. Never read `$?` after a pipeline.

Full descriptive identifier names, 80 columns, ivue conventions (subclass `$Class`, never `Class`).
Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
