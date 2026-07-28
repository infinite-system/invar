# TASK — a notch during a live glide must never slow it (#134, user finding 20)

Builder on the Invar terminal IDE. Work ONLY in `/tmp/conductor-glide` (branch
`fix-glide-continuation`, forked from latest main). Do NOT run `scripts/merge-gate.sh`; do NOT
push/merge/tag/delete — the conductor does that. Report to `/tmp/glide-continuation-READY.md`.
`export PATH=$HOME/.bun/bin:$PATH; bun install --frozen-lockfile`.

## The user, verbatim

> "ok yes it's much faster and smoother now but there is a bug, the first scroll its fast and the
> scroll after it stalls the previous one a bit, so I think the fix for that we already had, i saw
> you articulate it, but some how it got regressed, so I think it's almost fixed, just this slow
> down which i think is mechanical needs to be fixed for the scroll to become perfection"

## Mechanism — already located, do not re-hunt

`src/modules/system/Momentum.ts:120-137`. `gestureContinues` is decided ONLY by elapsed time since
the previous impulse against `gestureContinuationWindowMilliseconds`. When a second flick lands
AFTER that window but WHILE the previous glide is still decaying:

- `restEquivalentGestureVelocity` resets to 0 (line 127),
- `gainScale` collapses to `initialGainFraction`, the bottom of the ramp (lines 131-133),
- line 137's `!gestureContinues` branch floors the result at single-row velocity.

So the notch contributes almost nothing to a surface that is still moving. That is the stall.

**The reduction: continuation is a property of the MOTION, not of the clock.** If the surface is
still gliding, the next same-direction notch IS a continuation. The time window is a proxy that
disagrees with the physics exactly when a glide outlives it.

Likely shape: derive `gestureContinues` from live glide state (velocity above the halt threshold)
OR the existing time window — not the window alone. You own the final form; justify it.

**Do not break reversal.** Lines 104-110: a reversal notch during a live glide must still halt the
glide and step from rest. That behaviour is deliberate and has its own invariant.

## Why the gate missed it — fix this too, it is the durable half

`scripts/behavioral-contracts.sh` asserts follow-on `totalDistanceRows` within 10% of a from-rest
gesture. DISTANCE ONLY. A second gesture can travel the right total distance and still visibly
hitch at the boundary. Continuity across the gesture boundary is ungated.

Add the contract:
- Drive gesture 1, then gesture 2 at a delay that lands INSIDE the live glide but OUTSIDE the
  continuation window — that specific timing IS the reproduction. Sweep a few delays and report
  which ones reproduce; name the window you found.
- Assert per-frame continuity across the boundary: **a same-direction notch may never reduce
  instantaneous velocity.** No frame where rows-crossed collapses relative to the pre-boundary
  rate.
- **Positive control (required):** restore the clock-only continuation, run the new assertion, and
  show it goes red naming the boundary frame. A check that can only pass is not an instrument.
- Prefer per-frame row-crossing COUNTS over wall-clock FPS wherever the property allows — counts
  are load-invariant and this suite is already contention-sensitive.

Record the invariant with its Impossible-if-true clause: *a same-direction notch delivered during a
live glide can never reduce instantaneous velocity.*

## Verification — exact exit codes

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`, `bash scripts/behavioral-contracts.sh` 3x, and the
momentum/scroll smokes 3x. Report the reproduction delays, the before/after boundary numbers, and
the positive-control red. Report added wall-clock; keep it small.

Full descriptive identifier names, 80 columns, ivue conventions (subclass `$Class`, never `Class`).
Commit `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; clean tree.
