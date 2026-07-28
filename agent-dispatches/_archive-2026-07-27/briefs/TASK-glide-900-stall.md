# TASK — the 900 ms glide easing hangs `measure-scroll-smoothness`; find the real cause

Work ONLY in `/tmp/conductor-glide900` (branch `fix-glide-900-stall`, cut off latest main).
Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Report to
`/tmp/glide900-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`, then `bun install`.

## Status: the user chose 900 ms and it is committed. Your job is to make it legitimate.

`Momentum.GLIDE_CAP_EASING_DURATION_MILLISECONDS` is **900**, equal to the glide cap, so the
velocity ramp spans the entire glide — a pure ease-out with no plateau. The user drove 150, 200, 300
and 900 and picked 900 ("that's perfect"). **Do not change that value to make a test pass.** If it
turns out 900 cannot work, say so with the mechanism and stop — the decision returns to the user.

## What is established by measurement — do not re-derive, verify and extend

**Population separation is clean.** Same instrument, same machine, one variable:

| easing | `bun scripts/harness/measure-scroll-smoothness.ts` |
|---:|---|
| 150 ms | exit 0 |
| 900 ms | exit 1 — `Timed out waiting for the next complete synchronized frame` |

**The failure is reproducible and not contention:** it failed twice inside the merge gate (43 frames
observed, then 43 again on the gate's own retry) and once standalone on a quiet machine (72), and
once more standalone (71). Varying stop index, invariant stopping — the signature of a race or a
threshold, not a flake. The gate's retry already ruled out ambient noise.

**Location, from the log ordering.** The last output before the throw is the continuation report for
the case `editor flat folding-on 2000 lines`:

```
measuring case: editor flat folding-on 2000 lines
editor continuation minimumMovingFrames=6  observedMovingFrames=6  frames=43->44 rows=1->2
editor continuation minimumMovingFrames=10 observedMovingFrames=10 frames=56->57 rows=1->1
<throw at 71 frames>
```

`measureSurface` calls `measureContinuationBoundary` (line ~2105) and then
`gestures.push(await measureOneGesture(...))` (line ~2121). **So the throw is almost certainly inside
`measureOneGesture`, not the depth sampler.** Confirm that before doing anything else — add the
caller's identity to the timeout message if that is what it takes. Four separate hypotheses have
already died on this bug; the FIRST deliverable is the exact throwing call site, printed.

For contrast, at 150 ms the same phase succeeds and reports:
`gesture 1: frames=16 firstFrame=43.065ms moving=15 distance=27 peak=135rows/s fps=23.8`

## Ranked hypotheses (mine; treat as hypotheses, they have a poor record tonight)

1. **A from-rest gesture does not cross its first row inside the 700 ms
   `FRAME_ARRIVAL_TIMEOUT_MILLISECONDS`.** `addImpulse`'s from-rest floor guarantees one row *before
   the deadline*, and `minimumVelocityToCrossBeforeGlideCap` folds the easing area in — but "before
   the 900 ms deadline" is not "within 700 ms". At 150 ms easing `firstFrame=43ms`; measure it at 900.
   If this is it, it is ALSO a real feel defect: a single wheel notch that takes most of a second to
   move one row is unresponsive, and the user would eventually report it.
2. **Zero-row frames mid-glide produce no repaint, so no completed frame arrives.** Measured at the
   unit level: a ceiling glide at 900 ms easing ends `2,2,1,1,1,1,0,0` — two trailing zero-row frames,
   and 600 ms easing shows an INTERIOR zero (`…2,1,0,1`). A frame that crosses no row paints nothing.
3. **Travel per gesture halves** (181 → 98 rows for a ceiling flick), so any phase that expects a
   gesture to cover a distance needs more gestures.

I already tried and REFUTED a fix for a fourth idea — that the depth sampler's frame-count refresh
modulus could starve — by adding a stall-driven refresh plus bounded revival. It changed nothing
(71 frames vs 72). That change is reverted; do not redo it.

## What a correct fix may and may not do

- **May** fix the instrument, if the instrument is assuming something untrue (e.g. that a gesture
  always paints within 700 ms). A wait must observe its condition — `harness.invariants.md`.
- **May** fix the app, if 900 ms easing genuinely produces an unresponsive first notch or a stalled
  render. That would be the better outcome: a user-visible defect found by a contract.
- **MUST NOT** widen `FRAME_ARRIVAL_TIMEOUT_MILLISECONDS`, lower the easing, or make the wait
  unconditional. Widening a timeout to silence a red is forbidden in this repo and this is exactly
  the case the rule exists for.
- If the honest answer is "the instrument's 700 ms budget is simply wrong for a 900 ms ease-out and
  the correct bound is derived from the configured easing window", that is a legitimate fix — but
  DERIVE it from the setting, do not pick a bigger number.

## Acceptance

- the exact throwing call site, printed, with the evidence that identified it;
- a mechanism that explains BOTH legs: why 900 hangs and why 150 does not;
- `bun scripts/harness/measure-scroll-smoothness.ts` exits 0 at easing 900, driven, quoted;
- a positive control: re-introduce the defect (or plant the condition) and quote the red, then the
  green. A wait that can no longer fail is worse than the hang;
- `bash scripts/behavioral-contracts.sh` ALL-PASS at easing 900;
- if hypothesis 1 holds, report the measured first-row latency at 150/300/900 as a table — the user
  needs that number to judge whether 900 is still the feel they want;
- `src/modules/ui/scroll.invariants.md` updated if the mechanism text no longer matches.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (must stay ≥ 884
annotations / 67 lattice links / 0 problems), `bun scripts/check-coverage-ratchet.ts`.

Invariant records are cited by ROOT-RELATIVE path (`src/modules/ui/scroll.invariants.md`); a bare
filename silently orphans the annotation. `Class` slots are `export let`, the `Static()` wrapper
lives at the `$Class` anchor — conventions-gate rules 1.8/1.9/1.95 enforce all three.

Full descriptive identifier names, 80 columns. Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
