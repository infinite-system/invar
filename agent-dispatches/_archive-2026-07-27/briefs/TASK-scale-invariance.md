# TASK — scale-invariance as the contract: ratio ≈ 1 on load-invariant counts (#133, phase 1)

Builder on the Invar terminal IDE. Work ONLY in `/tmp/conductor-scaleinv` (branch
`feat-scale-invariance-contract`, forked from latest main). Do NOT run `scripts/merge-gate.sh`; do
NOT push/merge/tag/delete. Report to `/tmp/scale-invariance-READY.md`.
`export PATH=$HOME/.bun/bin:$PATH; bun install --frozen-lockfile`.

## The user's claim, which the contract must encode

> "the scrolling has to be made hard to regress, the contracts must be reliable, because the whole
> app rests on ability to be Invar — invariable under 100k files just as it is with 10 line files"

## The reduction

Today the suite asserts FLOORS PER SIZE (28 FPS at 2k / 26.6k / 100k). The product claim is
INVARIANCE ACROSS SIZE. Those differ, and the difference is what lets a regression through:

- A floor passes while size-dependence GROWS, so long as every size still clears the bar.
- A floor is machine-ABSOLUTE, so faster hardware WEAKENS the guard.
- A RATIO is machine-normalized, states the real property, and goes red the moment cost starts
  tracking document length even while both numbers sit above the floor.

**Therefore: the contract is `ratio ≈ 1` across the size axis — and it is asserted on COUNTS, not
on FPS.** Document-line reads per frame at 100k must EQUAL reads per frame at 2k. Integer
comparison: load-invariant, parallel-safe, needs no quiet lock, strictly more sensitive than any
timing measurement. A wall-clock ratio would still need a quiet machine; a count ratio needs
nothing.

Precedent already in the tree: the fold work asserted ZERO additional document-line reads across
10,000 unchanged frames. That test cannot flake. The FPS number was the DISCOVERY instrument; the
count is the CONTRACT. Generalize that.

## Phase 1 scope — the editor scroll path only

Do NOT convert the whole quiet tail in this round. Deliver the headline guard end to end:

1. **Instrument per-frame counters** on the editor scroll path. At minimum: document-line reads,
   fold/wrap projection lookups, layout computations per rendered frame. Expose them the way the
   existing per-frame attribution already does; do not invent a second mechanism if one exists.
2. **Assert ratio ≈ 1** for reads-per-frame between the 2k and 100k fixtures, driving the SAME
   gesture on both. State the tolerance you choose and WHY (exact equality if the counters are
   deterministic; a named epsilon only if you can show they are not).
3. **Positive control, required**: plant an O(document-length) per-frame cost, run the assertion,
   and show it goes red naming the ratio. Remove it before final verification. A check that cannot
   fail is not an instrument.
4. **Demote, do not delete, the FPS floors.** Keep one wall-clock canary per surface as a sanity
   check. The count ratio becomes the contract; the floor becomes secondary. Say in the report
   which assertions changed role.
5. **Record the invariant** with its Impossible-if-true clause: *no per-frame quantity may scale
   with document length.*

Report which further axes (fold-density, wrap, gutter marks, indent guides, scroll depth, diff
surface) the same ratio harness could cover in a follow-up round, and the cost estimate for each.
Do not build them now.

## Constraints

- Keep added wall-clock SMALL and report it. The suite is currently ~101s; the user has twice cut
  scope to keep it fast. A count-based check should be nearly free — if yours is not, say why.
- Do not weaken any existing assertion to make room. If something must change role, declare it in
  `project.coverage-deltas.md` in the counted grammar with the reason.
- Do not raise any timeout.

## Verification — exact exit codes

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`, `bash scripts/behavioral-contracts.sh` 3x, editor and
scrollbar smokes 3x. Report the measured counts at both sizes, the ratio, the positive-control red,
and total suite runtime before/after.

Full descriptive identifier names, 80 columns, ivue conventions (subclass `$Class`, never `Class`).
Commit `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; clean tree.
