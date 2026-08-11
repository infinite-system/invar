# READY report — #547 (bounded-list-popup wheel flake)

Branch `fleet/547-bounded-list-popup-wheel-flake`, commit `7aaf195c`.
Status: READY. Worktree clean (only the
dispatch-generated fundamentals file remains untracked, as dispatched).

## In plain words

The test rolls the mouse wheel over a popup list and waits for the list to
move. Sometimes it never moved. The wheel notch did reach the app, and the
app wrote down "scroll a bit" — but the note that says "please draw a new
picture" was thrown away by the drawing library while it was busy, and the
app never asked again. So the scroll sat in a drawer until the NEXT input of
any kind, and the test stared at a frozen screen for 30 seconds. Now the app
keeps a small timer: if it asked for a picture and none came, it asks again
until one does. The timer stops the moment a picture arrives, so a quiet app
stays quiet.

This is a product bug, not a smoke bug: a real user's wheel notch could do
nothing until their next mouse move.

## The exact failing wait

`awaitGridCondition('wheel scrolling changes the visible popup list or
reveals its tail')` —
[smoke-bounded-list-popup-harness.ts](../../../../scripts/harness/smoke-bounded-list-popup-harness.ts)
(the wheel loop, `PtyTestDriver.awaitGridCondition`, 30 s). Confirmed in the
gate-522 frozen frame (`/tmp/merge-gate-failures.868b1bb114d9a50b.1638619`):
popup open at file-067…file-097, screen frozen, wait timed out.

## Diagnosis — the three-clocks question, answered

The probe
([probe-547-wheel-step-loop.ts](probe-547-wheel-step-loop.ts), committed)
loops the exact wheel step and autopsies a stall instead of dying. Every
stall (5 of 5) gave the identical answer:

- Screen clock: popup viewport UNCHANGED since the wheel (frozen a few rows
  short of the tail).
- Status clock: `boundedListPopupGeometry.firstVisible` frozen,
  `animationFrameCadenceTimerCount=0` (the animation cadence is OFF),
  `workspaceScrollMomentumAtRest=true`. Screen and status AGREE — no clock
  skew.
- Liveness clock: one plain mouse MOVE (no wheel) and the list instantly
  jumps to the clamp. The impulse was PARKED: queued in the momentum
  regime with no frame left to advance it — the exact state the record
  "Wheel impulses start their own frame sequence"
  ([ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)) declares
  impossible.

Mechanism (read from OpenTUI `@opentui/core`,
`chunk-bun-tkm837n2.js` `requestRender`/`loop`/`scheduleRenderAfterFeedIdle`):
`requestRender()` RETURNS WITHOUT RECORDING ANYTHING while
`feedIdleRenderScheduled` or `ordinaryFrameWaitingForFeed` is set (a native
frame was skipped because the output feed was busy — the state machine
load opens), and its `retryable-skip` frame end also erases
`immediateRerenderRequested`. The compensating retry can itself die against
an overlapping async `loop()` (`if (this.rendering) return`). When the
wheel's one `requestRender` falls into such a window, no frame is ever
produced, `frameTick` never runs `advanceAnimationFrame`, and the queued
impulse parks. Load widens the feed-busy windows, which is why the gate's
contention tier saw it on unrelated branches.

## Reproduction verdict (run counts)

Pre-fix (planted defect = the unpatched code, the probe's positive control):

- Solo: 1 stall in 30 iterations (~480 wheel waits), autopsied.
- Under 4x contention (probe + 3 looping copies of the smoke, 16-core
  host): 4 stalls in 60 iterations — roughly double the solo rate.
- All 5 autopsies identical: parked impulse, cadence off, jiggle drains it.

Post-fix:

- Probe solo: 60/60 iterations clean.
- Probe under the same 4x contention: 60/60 clean.
- Smoke solo: 5/5 green.
- Smoke contention: 5 rounds x 4 concurrent = 20/20 green, every exit code
  counted.

## The fix (`7aaf195c`, src/modules/app/Bootstrap.ts)

A render-delivery watchdog inside the existing `requestRender` wrapper:
every request marks "a frame is owed" and arms one timer (two frame
intervals, ~67 ms at 30 fps). If the timer fires with the frame still owed,
it re-requests and re-arms; the first completed frame (`frameTick`) marks
delivery, so the watchdog holds NO timer at rest — idle quiescence is
unchanged (behavioral contracts, including `idle-quiescence`, ALL-PASS).
This cures every drop class by construction instead of enumerating OpenTUI's
internal states, and it covers all momentum consumers (popup, overlays,
transcript, editor routes), not just this smoke's surface. No timeout was
widened, no assertion weakened, no tier skipped; the smoke is untouched.

## Invariants in scope — the brief's question

- "One generator owns each scroll position" and the other
  [scroll.invariants.md](../../../../src/modules/ui/scroll.invariants.md)
  records: NOT stressed. One generator moved the position throughout;
  "Every wheel event becomes one impulse" held (the impulse was queued,
  never dropped — its FRAME was).
- STRESSED under the unstated no-load assumption: "Wheel impulses start
  their own frame sequence" — its Mechanism assumed the one
  `renderer.requestRender()` is always honored. Under feed backpressure it
  is not. Refined (`7aaf195c`): Mechanism now names the delivery watchdog
  as the backstop, Impossible-if-true adds the dropped-and-never-reissued
  request, Evidence and Verification cite the probe.
- "The render loop never wedges"
  ([project.invariants.md](../../../../project.invariants.md)): refined the
  same way — a requested frame that never completes while the app sits
  quiescent is now in its impossibility set, and the watchdog is in its
  Mechanism.

## Verification

- `bunx tsc --noEmit` → 0.
- `bun test` → 2522 pass, 0 fail (72965 expect calls, 389 files).
- Invariants checker `--all` + `--refs` → 0 problems (1442 annotations,
  287 lattice links resolve).
- `bash scripts/behavioral-contracts.sh` → ALL-PASS (run once, at the end).
- `bash scripts/conventions-gate.sh` → PASS.
- Probe and smoke counts as in the reproduction verdict above.
- Positive control: the probe on pre-fix code goes red with the exact
  planted defect (5 autopsied stalls); post-fix it is green 120/120.

## Adversarial drive notes

The probe's loop IS the count-edge attack for this state machine (wheel
repeated to the clamp, popup reopened per iteration — 120 open/scroll/close
cycles post-fix, zero artifacts: popup state, focus, and badge behavior
identical every cycle). The stall families interleaved naturally under
contention with three concurrent full smokes driving every other popup
surface. The smoke itself covers the neighboring gestures (search sweep,
wrap navigation, filter, breadcrumb drill, branch adapter) and stayed green
25/25 runs on the fixed build. Saved-state and scale families do not apply
to this diff (no persistence touched; the watchdog is per-request,
independent of document or list size — the smoke's own 103-item and the
concurrent 100k-fixture contract runs both passed).

## Bycatch

- Suspect (not driven): the same parked-request shape can starve ANY
  demand-rendered mutation whose only request lands in a drop window —
  #529's report already flagged its class-B rarities; the watchdog now
  covers them all, but the `scrollbars` grid-condition sighting from
  gate-514 r1 (one line of evidence, #531 could not recover its wait) is
  plausibly this generator and is now plausibly cured. Not separately
  reproduced.
- Comment drift, upstream: OpenTUI's `reportNativeRenderFailure` logs
  "waiting for the next render request to force repaint" — but its own
  `requestRender` drops that next request in the waiting states. Vendor
  code; noted, not touched.
- None further observed.

## Instrument feedback

- EASY: the autopsy-instead-of-die probe pattern (#529's template) found in
  one solo run what three gate logs could not; the liveness jiggle
  (one mouse move) cleanly split "parked" from "lost".
- MISSING (ask): a driver/status view of the renderer's internal request
  state (requested-but-undelivered frames). The watchdog now makes the
  question moot in the app, but the harness still cannot SEE a dropped
  request — it can only infer one from a frozen screen.

## Files changed

- src/modules/app/Bootstrap.ts — the render-delivery watchdog.
- [src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)
  — "Wheel impulses start their own frame sequence" refinement.
- [project.invariants.md](../../../../project.invariants.md) — "The render
  loop never wedges" refinement.
- [probe-547-wheel-step-loop.ts](probe-547-wheel-step-loop.ts) — the
  looping probe with the three-clocks autopsy (the pre-fix code is its
  planted-defect mode).
