# TASK — soften the glide stop (user review: deceleration is too sudden)

Work ONLY in `/tmp/conductor-glidestop` (branch `fix-glide-soft-stop`, cut off latest main).
Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Report to
`/tmp/glidestop-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`.

## The user's words

*"the scroll fix is very good now, better than ever, but a slight imperfection I want to improve
is that the glide deceleration is a bit too sudden, it needs to be a bit softer."*

Rendering is NOT the problem — they explicitly confirmed no slowdowns in diff view or on a full
`package-lock.json`. This is purely the shape of the stop.

## The diagnosis is already computed — verify it, then fix it

Two boundaries can halt a glide (`scroll.invariants.md`, "The glide tail is bounded and
effective"): decay reaching `stopVelocity`, or elapsed time reaching
`maximumGlideDurationMilliseconds`. Which one fires decides whether the stop eases or steps.

| axis | peak | velocity at the 900 ms cap | decay alone would stop at | halted by |
|---|---:|---:|---:|---|
| **vertical** (`max: 220`) | 220 rows/s | **5.02 rows/s** | 1023 ms | **TIME CAP — hard cut** |
| horizontal (`max: 80`) | 80 rows/s | 1.83 rows/s | 782 ms | decay — eases to stop |

Both profiles: `decayPerSec: 0.015`, `stopVelocity: 3`, `maximumGlideDurationMilliseconds: 900`
(`src/modules/system/Momentum.ts`).

**So the vertical glide is chopped 123 ms early while still travelling ~5 rows/s** (~0.17
rows/frame at 30 fps). Horizontal already eases out because its lower ceiling lets decay finish
first — which is why the defect is felt on the axis the user actually scrolls.

**Step 1 is to confirm this by DRIVING, not by re-deriving the arithmetic.** Flick vertically,
capture the per-frame row-crossing sequence, and show that the final frames stop at a non-trivial
velocity rather than tapering. Then flick horizontally and show it tapers. That contrast IS the
reproduction. If the two axes do not differ that way, the diagnosis is wrong — say so and stop.

## Two changes, and the second is the load-bearing one

1. **Raise the vertical default tail** so the common case is decay-halted like horizontal already
   is (arithmetic says >1023 ms; do not just take that number, drive it).
2. **Ease the cap instead of cutting it.** Necessary regardless of (1), because the setting is
   user-selectable from 100–2,000 ms and any value below the natural decay time will still hit the
   cap first. Over the final stretch before the deadline, ramp velocity toward zero so the halt is
   continuous rather than a step.

**The invariant must survive**: motion still halts no later than the selected duration, and every
selectable value still lets one accepted notch produce visible motion (that second clause is #146's
fix — do not regress the 100 ms dead-zone floor).

## The feel decision is the USER'S, not yours

Do NOT pick a final vertical default. Land the easing mechanism, then produce **two or three
candidate settings** the user can compare, each with its driven fingerprint — the per-frame
row-crossing sequence for a hard flick, so they can see the taper shape rather than read a number.
Report them as options with your recommendation and reasoning, not as a decision.

## Method — Rule Zero applies with full force

This is a FELT quality, so an assertion is a lossy proxy for what the user perceives. Drive →
change → drive, seconds per iteration, ONE instrument. Write the contract only AFTER the stop feels
right, to lock in what was achieved. `bun run drive` is the on-ramp.

The existing shape-comparison technique from #135 is the right tool: compare row-crossing sequences
as a SHAPE, not against a threshold. `3,3,3,3` glides; `5,1,5,1` stumbles at the same mean. A good
taper looks like `5,4,3,2,1`; the current cut looks like `5,5,5,0`.

## Acceptance

- driven before/after fingerprints for a hard vertical flick, showing a taper replacing the step;
- horizontal unchanged (it was already correct — prove you did not disturb it);
- the 100 ms setting still produces visible motion from one notch (#146's floor intact);
- motion still halts by the selected duration at 100, 900, and 2000 ms;
- two or three candidate vertical defaults with fingerprints, for the user to choose;
- `scroll.invariants.md` updated if the tail mechanism's description changes — the invariant text
  currently says `stepMomentum` "halts when elapsed time reaches the setting", which an easing ramp
  makes imprecise.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`, plus the driven passes above.

Full descriptive identifier names, 80 columns, ivue conventions. Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.

---

# ROUND 2 — premise corrected by your own driven evidence

Your round-1 refutation is accepted and it was the right call: you drove it, the claimed two-axis
contrast was absent, and you stopped instead of manufacturing a change. The conductor's error is
recorded — it read the profile DEFINITIONS in `Momentum.ts` and assumed the wiring without checking
the call sites. Verified since: every consumer reads `verticalOptions`; `defaultOptions` appears once
(`ScrollableTextViewport.ts:192`) and not on the path the user drives.

## What is now established, from your fingerprints

- **Both axes run the 220 ceiling.** `Workspace.flingMomentum` reads `verticalFlingCeiling` and
  feeds BOTH `editorVerticalStep` and `editorHorizontalStep`; `DiffView` does the same and says so
  in a comment.
- **A ceiling-reaching flick is cut, on both axes.** Hard 60-notch, vertical 2,000 lines:
  `6,7,7,8,…,7,6` — the last crossing is 6 rows, not a taper. Horizontal is the same shape.
- **A gentle flick already tapers.** Your default 12-notch drive never reaches the ceiling, decay
  finishes inside the 900 ms window, and the tail eases.

So the real contrast is **not vertical vs horizontal — it is ceiling-reaching vs not**, on either
axis. That is the reproduction, and you already have both legs.

The arithmetic that still holds: at 220 rows/s with `decayPerSec 0.015`, decay needs **1023 ms** to
fall to `stopVelocity 3`, but the cap fires at **900 ms** while velocity is still ~5 rows/s. Every
ceiling-reaching flick therefore ends on a step.

## The fix is now ONE change

**Ease the cap instead of cutting it.** Over the final stretch before the deadline, ramp velocity
toward zero so the halt is continuous. Drop the "raise the vertical default" idea — with both axes
sharing one profile it would lengthen every tail to fix a boundary artefact, and the easing handles
all selectable values (100–2,000 ms) rather than one.

Unchanged constraints: motion still halts no later than the selected duration, and one accepted
notch still produces visible motion at 100 ms (#146's dead-zone floor).

Unchanged division of labour: land the mechanism, then return **two or three candidate easing
shapes** with driven fingerprints for a hard 60-notch flick, and let the user choose. Do not pick.
Target shape is a taper — `…5,4,3,2,1` — replacing today's `…7,7,6`.

## Acceptance, revised

- before/after fingerprints for a hard 60-notch flick on BOTH axes at 2,000 and 100,000 lines;
- a gentle 12-notch flick still tapers and is not made longer or slower;
- 100 ms setting still moves one notch visibly; motion halts by the setting at 100, 900, 2,000 ms;
- two or three candidate easing shapes with fingerprints, your recommendation stated as a
  recommendation;
- `scroll.invariants.md` mechanism text updated — it says `stepMomentum` "halts when elapsed time
  reaches the setting", which an easing ramp makes imprecise.

## Two bycatch items — REPORT only, do not fix here

1. `Momentum.defaultOptions` (`max: 80`) is unreachable from the paths the user drives, and its
   comment describes it as the horizontal profile. Either it is dead and should be retired, or a
   surface that should use it does not. Say which, with call sites; changing it is a separate task.
2. `bun run drive --open bun.lock --wheel right` reports settled after the first expected frame
   (`editorScrollLeft=1` while `workspaceScrollMomentumAtRest=false`). That is a wait that does not
   observe its condition — the exact defect class the harness has a rule against. Reproduced twice.
