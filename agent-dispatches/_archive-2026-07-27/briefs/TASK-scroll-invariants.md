# TASK — #139: `scroll.invariants.md` + `scroll.lattice.md` (user-requested capstone)

Work ONLY in `/tmp/conductor-scrollinv` (branch `docs-scroll-invariants`, off latest main).
Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Report to
`/tmp/scroll-invariants-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`.

## Why now

USER, verbatim: *"we need scroll.invariants.md after all this is fixed <3"* and *"scrolling might
need not just invariants but .lattice.md too"*. The precondition is now satisfied — the scroll
work landed at `9125b0f`. This is the consolidation, and it is the LAST piece of that thread.

Also user, on why it matters: *"the scrolling has to be made hard to regress, the contracts must
be reliable, because the whole app rests on ability to be Invar — invariable under 100k files just
as it is with 10 line files, something vscode can't do."* The records exist to make regression
hard, not to describe what exists.

## Read these first — this is a CONSOLIDATION, not an invention

The invariants already exist, scattered across contracts, commits and reports. Your job is to
find them, reduce them, and record them with honest verification and impossibility clauses. Do
NOT invent new invariants, and do NOT restate implementation.

Sources, in order of authority:
- existing contract text in `scripts/behavioral-contracts.sh` and the scroll/glide harnesses;
- `project.invariants.md` (the root records this must stand on, e.g. *Cost tracks the actively
  observed set*);
- the landed commits: `9125b0f`, `2442d8f`, `3af155c` (glide-jam), `fd623df` (rapid-fire),
  `c51f185` (accumulation), `84bb97b` (scale invariance), `25cdf18` (continuation), `d61124d`
  (folding), plus the fold-cost work;
- reports: `/tmp/glide-jam-READY.md`, `/tmp/scale-invariance-READY.md`.

Follow the EXISTING house format exactly — read `project.agent-harness.md` +
`project.agent-harness.lattice.md` as the shape to match, including the lattice's "Derived, never
legislative: where this disagrees with the records, the records win" stance and its dependency-map
notation.

## The candidate invariants — verify each against the code before recording it

These are what the session's work actually established. Confirm each, drop any you cannot
substantiate, and merge any two that are the same thing said twice.

1. **One generator owns the scroll position; input only contributes impulses.** Wheel events
   append to a plain pending queue; the animation tick drains it and is the sole reactive writer.
   *Impossible if true:* an input path that writes scroll offset or publishes reactive momentum
   directly; two owners advancing position in one frame.
2. **Every input event survives as exactly one impulse.** 150 events → 150 impulses, measured at
   both scales. Coalescing may reduce RENDER REQUESTS, never impulses.
   *Impossible if true:* a throttle or debounce that drops or merges impulses.
3. **Per-frame cost does not scale with document length.** Exact integer equality at 2k and 100k:
   65 document reads, 33 fold lookups, 2 wrap lookups, 1 layout computation per frame.
   *Impossible if true:* any per-frame quantity proportional to line count. This is the invariant
   the product is NAMED for — state that.
4. **Continuation is keyed on motion, not on a clock.** A flick arriving during a live glide
   continues it regardless of elapsed time since the previous impulse.
   *Impossible if true:* a from-rest-sized impulse delivered while the surface is still moving.
5. **Same-direction notches accumulate until the ceiling; overflow is retained, not discarded.**
   *Impossible if true:* velocity discarded at the ceiling; a later flick producing a smaller
   peak than an earlier one in the same gesture.
6. **The glide tail is bounded by a setting, and every selectable value produces motion.** Default
   900 ms; range 100–2000. NOTE: the minimum currently violates the second half — one notch
   travels zero rows at 100 ms (tracked as #146). Record the invariant as `provisional` with that
   as its Open question. Do NOT fix #146 here and do NOT quietly weaken the clause to match the
   defect.
7. **Contracts on scroll assert counts and derived quantities, never phase-sensitive frame
   counts.** The rapid-ceiling contract asserted 24 frames and observed 22–24 across ten runs
   while row travel was exactly 197 every time. The floor is now derived:
   `ceil(verticalFlingCeiling * maximumGlideDurationMilliseconds / 1000 - 1)`.
   *Impossible if true:* a scroll contract whose expected value came from an observation rather
   than from the mechanism.

## The lattice — this is the half that is easy to do badly

`scroll.lattice.md` must show how these HOLD TOGETHER, not repeat them. Specifically:
- which of these stand on root invariants (3 rests on *Cost tracks the actively observed set*);
- which stand on each other (2 and 5 both presuppose 1 — without single ownership there is no
  well-defined impulse count to preserve);
- where the SAME pattern appears one level up or in another domain — 1 is the same shape as
  `OverlayLayer`'s single frame-request owner and `NarrationProjection`'s single publication
  owner. Note that explicitly: **two owners of one obligation is this repo's most frequent
  defect**, and scroll is its third instance.
- 7 is a methodological invariant, not a behavioural one. Say so, and place it accordingly — it
  constrains the contracts, not the code.

## Verification lines must be real

Every record cites the contract or smoke that enforces it. **If a candidate has no enforcing
check, say so explicitly** rather than citing something adjacent — an unverified record that
looks verified is worse than a declared gap, and this session found four separate instruments
that reported success while measuring nothing. Where the enforcing check is count-based, say
which counts.

## Verification — quote exact exit codes

`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (it validates record
structure, annotations, and lattice links — this is the real gate on your work),
`bash scripts/conventions-gate.sh`, `bunx tsc --noEmit`, `bun test`. No production change is
expected; if you find yourself editing `src/`, stop and report why.

80 columns, full descriptive identifier names. Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
