# TASK — wheel events JAM the glide they should be feeding (#138, user-diagnosed)

Work ONLY in `/tmp/conductor-glidejam` (branch `fix-glide-input-interference`).
Do NOT run `scripts/merge-gate.sh`. Do NOT push, merge, tag, or delete branches — the
conductor lands work. Report to `/tmp/glide-jam-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`.

## The user's report, verbatim — this is the whole specification

*"now the problem is the scroll interferes with the scroll, somehow the scroll event jams
the scroll, the rendering is not the problem — once i scroll enough this fixed version
glides very well -> too well! It starts gliding over hundreds of rows very quickly and
render properly when I do NOT touch the mouse scroll wheel, but when I do, it interrupts
and stalls again, so the wiring from scrolling to the scroll effect has to be throttled or
debounced, checkout lodash library, we have not been using it too much but they have lots
of primitives for throttle and debounce that we can use without reinventing the wheel. The
diff view is still heavier but the same bug persists, the scroll should not fire 150 times
and throttle the active scroll operation, it should hop onto the current animation process
and glide with it, but not too much, right now the glide is too damn long lol, should it
also be a setting? maybe?"*

Read that twice. **The user has already localized the defect and named the correct fix.**
An untouched glide renders hundreds of rows perfectly — so rendering is NOT the bottleneck,
and any theory that blames render cost is contradicted by their evidence before you start.

The defect is at the seam between **wheel input** and the **running animation**.

## What this closes

This is the mechanism behind #138, the multi-second freeze a builder drove for an hour and
could not reproduce. That non-reproduction now looks like an INSTRUMENT gap, and fixing it
is part of this task — see "The harness gap" below.

## ⚑ REPRODUCE BY DRIVING FIRST. Write no assertion yet.

Start a glide, let it run, then inject wheel events INTO the live glide and watch it stall.
Until you have seen that, you have nothing. Drive **defaults first** — the user runs a
`verticalFlingCeiling` of 320 while the default is 220, and most people are on defaults.

## Ranked hypotheses — let measurement rank them, not this list

1. **TWO OWNERS OF THE SCROLL POSITION.** The wheel handler advances scroll directly while
   the momentum animator also advances it, so each event fights the animation instead of
   feeding it. This exact shape has now bitten this repo twice: `OverlayLayer.requestPaint`
   had two owners of the frame request, and `NarrationProjection.bargeIn` published through
   the wrong owner. **One generator must own the scroll position; input contributes
   impulses to it and nothing else moves it.**
2. **Per-event synchronous work starves the frame loop** — each of ~150 events/second does
   layout or a full scroll operation on the input path, so the animation never gets a slot.
3. **Each event restarts or re-initialises the animation**, resetting its accumulated
   velocity — a continuation bug of the kind already fixed once in `Momentum`.

State which you confirmed and which you eliminated, with the measurement for each.

## The fix the user described — and the order it must be applied in

*"it should hop onto the current animation process and glide with it."* That is the
structural fix: a wheel event during a live glide **joins** the animation as an impulse.

**Throttling is a coalescing measure at the event boundary, not the cure.** Get the
ownership right first; then, if 150 events/second still costs measurably more than the
coalesced equivalent, coalesce them. If you find throttling is what makes the jam go away,
say so plainly — that would mean hypothesis 2 dominates and the ownership was already fine.

**On lodash — the user asked for it explicitly, so evaluate it and honour the request
unless you find a real reason not to.** Do not hand-roll a throttle. Report: which import
form you used (a single-function import, not the whole library), the added dependency
weight, and whether the seam is genuinely one call site or many. If you conclude lodash is
the wrong tool here, that is allowed, but you must justify it — "we could write it
ourselves" is exactly the reasoning the user rejected.

## Glide duration — reduce the default AND add the setting

*"the glide is too damn long lol, should it also be a setting? maybe?"*

Do both, in this order:
1. **Reduce the default** so the out-of-box glide stops feeling long. "Too long" is a
   complaint about the default, and a setting does not fix a bad default.
2. **Add the setting** through the existing settings mechanism, so it is discoverable,
   persisted, and documented like every other scroll setting.

Report the before/after default with the row-travel numbers behind your choice. Do not
guess a value — drive several and say which you picked and why.

## Both surfaces

The user reports the diff view is heavier but has the **same** bug. Fix it at the shared
generator, not twice. If diff genuinely needs its own handling, that is a finding worth
stating — but a per-surface fix for one defect is a seam violation and needs justification.

## The harness gap — close it, this is half the task

Our instrument drove continuous input for 3 seconds and saw no stall, while the user hits
it immediately. The likeliest reason: **synthetic notches do not arrive at a real trackpad's
rate or in its burst shape.** A real wheel fires ~150 events/second in bursts; if the
harness sends them slower or evenly spaced, it never creates the collision.

Measure the harness's actual injection rate, compare it to the real rate the user's gesture
produces, and drive at the real rate. Then assert this on **counts, not wall-clock**:
events-in versus impulses-applied versus rows-travelled, so the contract is load-invariant
and cannot be excused by a busy machine.

**Positive control is mandatory:** reintroduce the jam deliberately and require the new
assertion to go red. Quote the failing line. An assertion that has never failed is not an
instrument.

## Scale parity

100k lines and 2k lines must behave identically — same events-to-impulses ratio, same
glide. That is the property the whole editor is named for.

## Bycatch

Report other bugs you notice. Do not chase them. Fix one only if it is small, obvious,
clearly correct, and in a file you already touched — list each separately.

## Verification — quote exact exit codes

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`, and the scroll/glide smokes 3x. ONE verification
pass at the end — do not run the full checker suite while iterating. Never read `$?` after
a pipeline.

Full descriptive identifier names (no abbreviations), 80 columns, ivue conventions
(subclass `$Class`, never `Class`). Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>` and leave the tree clean.
