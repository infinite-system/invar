# READY report — #538 (panel-chrome flake, second wave)

Branch `fleet/538-panel-chrome-flake-second-wave`, commit `8d50d6df`.
Status: READY. All verification numbers are final and appear below.

## In plain words

The test clicks the panel's expand button twice, fast, at the same spot.
But the first click makes the panel grow, and the button jumps from the
bottom of the screen to the top. On a quiet machine both clicks slip in
before the app redraws, so the second click still lands on the button. On
a busy machine the app redraws between the clicks, the second click hits
the panel body where the button used to be, and the panel stays big
forever while the test waits for it to shrink. The app was healthy the
whole time. Now the test waits for the panel to grow, finds where the
button moved to, proves the mouse really reaches it (the button lights up
under hover), and clicks it there.

## The exact failing wait — both post-fix logs

Both gate logs fail in the SAME wait, at different scale tiers:

- gate-535-r2 (`/tmp/merge-gate-failures.ccd48cd6b5416f57.3535209/contention-panel-chrome-*.log`):
  `Timed out waiting for two rapid expand clicks complete one symmetric cycle`
  at the 10-line tier, in `awaitStatusWithoutFrame`
  ([HarnessSmoke.ts](../../../../scripts/harness/HarnessSmoke.ts) line 279),
  30 s, polling `status.json` every 5 ms.
- gate-537 (`/tmp/merge-gate-failures.62c3db60c64b5adb.3950930/contention-panel-chrome-*.log`):
  the same wait at the 100000-line tier.

This is the wait #529 (panel-chrome rapid-expand flake) called class B and
claimed fixed "by generator only". That claim was wrong, a premise
correction to the prior art: the settle-boundary republish fixed the
starved-publisher classes, but this wait dies to a different mechanism.

## Reproduction verdict — reproduces, 4 of 4 under contention

Probe: [probe-538-rapid-expand-loop.ts](probe-538-rapid-expand-loop.ts)
(committed in this task folder). It loops only the failing step — read
geometry once, two blind clicks at the expand cell, wait for
`frame > frameBefore && panelExpanded === false` — with a staged autopsy
on timeout: status samples, 3 s idle, a liveness jiggle, then a recovery
click at fresh geometry.

- Solo, faithful gesture: 50 of 50 iterations clean, ~15 ms per cycle.
- Under 4-way contention (4 concurrent probe copies): 4 of 4 copies
  failed, each within 1-2 iterations. Identical autopsy every time.
- Planted positive control (`gap` argument: let the expanded frame settle
  between the two clicks, then click the stale cell — real double-click
  timing): deterministic timeout on iteration 1. The red mode stays in
  the probe.

## Diagnosis — which clock each side of the wait reads

The wait is honest. It reads the settled status file (the frame-settle
clock), and every autopsy showed that clock current and agreeing with the
emulator screen: `panelExpanded=true`, tab strip painted at the expanded
row, `renderQuiescent=true`, frames advancing on a jiggle (publisher
alive). This is NOT the #529 starved-publisher class.

The gesture is the defect. The second click is AIMED by a stale clock
(the status snapshot read before click 1: control at row 22, column 115
at the smoke's 120x40) and DISPATCHED through the renderer's native
per-frame hit grid. Expansion relocates the tab row (the expanded panel
substitutes the editor-center rows —
[layout.invariants.md](../../../../src/modules/layout/layout.invariants.md)
"Expanded panel overrides only the editor center rows"; measured: row 33
to row 3 at 220x60, row 22 to row 3 at 120x40; columns unchanged). So the
second blind click only reaches the Restore control while the hit grid
still holds the PRE-expand generation. Under load a native render lands
between the clicks, the grid rebuilds, and the click dispatches into the
expanded panel body. No restore is issued; the wait times out truthfully.
The autopsy's recovery click at the control's CURRENT cell restored the
panel within one frame, every time. The app was healthy; the click was lost.

## Fix (`8d50d6df`, [smoke-panel-chrome-harness.ts](../../../../scripts/harness/smoke-panel-chrome-harness.ts))

Gesture-side, the #529 class-C precedent (hover-precedes-click as a hit
grid yoke). After the first expand click the step now:

1. waits for `panelExpanded === true` (a real condition, not a sleep),
2. re-reads the tab-bar geometry and finds the Restore control's current
   cell,
3. hovers it and waits for the hover reveal (background flips to the
   shared `cursorLine` hover tone; the reveal is dispatched through the
   same hit grid as the press, so observing it proves the grid resolves
   the control at that cell),
4. clicks, and keeps the ORIGINAL wait and assertion untouched
   (`frame > frameBeforeRapidCycle && panelExpanded === false`, then the
   exact-state graph check).

No timeout widened, no assertion weakened, no tier skipped. The #514
property this step protects (repeated fast expand activation always has
a symmetric exit, with Restore reachable and functional immediately after
expand) is still driven, now at the fastest rate the app can actually
accept a second AIMED activation. The old encoding ("same cell twice,
blind") tested a race in the instrument, not a property of the app: a
real user's second click at that spot would also land in the panel body,
and the app handling that by focusing the panel is correct behavior.

## Verification

- `bunx tsc --noEmit` → 0.
- Invariants checker `--all` and `--refs` → 0 problems (1428 annotations,
  287 lattice links resolved).
- Smoke solo ×5 → 5 of 5 ALL-PASS.
- Smoke under 3-way contention, 5 rounds × 3 concurrent = 15 runs → 15 of
  15 ALL-PASS (pre-fix baseline: the probe's faithful loop failed 4 of 4
  copies under 4-way contention within 2 iterations).
- `bun test` → 2499 pass, 0 fail (72882 expect calls, 386 files, 21.2 s).
- `scripts/conventions-gate.sh` → PASS.
- Positive controls: the probe's faithful blind loop IS the pre-fix red
  (4/4 under contention); its `gap` mode plants the defect
  deterministically and stays committed as the red mode.

## Invariants in scope — the brief's question answered

"Rendering is one coarse frame effect"
([app.invariants.md](../../../../src/modules/app/app.invariants.md)) is
NOT stressed further by the second wave. Every autopsy showed the settled
status file agreeing with the settled frame's model while quiescent, the
exact shape the #529 refinement declared impossible, holding. The second
wave lives in a different clock pair entirely: stale gesture aim versus
the native hit grid, which that record does not govern. No refinement
proposed.

## Bycatch

- Premise correction (prior art, not code): #529's report classified this
  wait as class B ("same generator as A", fixed by the settle republish).
  The second wave proves that classification wrong — the wait dies to the
  class-C mechanism (lost gesture), which #529 fixed only for the
  splitter edge drags. Its "harness-side truth" paragraph named the three
  clocks correctly; the class-B verdict just picked the wrong one.
- Contract-layer gap: the hit-grid clock law — a press dispatches through
  the native per-frame hit grid, which lags relayout, so a press onto
  just-relaid-out geometry needs a grid yoke (hover reveal). The law now
  underlies two landed fixes (#529 class C, this task) but exists only in
  [AGENTS.md](../../../../AGENTS.md) rule-5 prose and code comments. No record in
  [harness.invariants.md](../../../../scripts/harness/harness.invariants.md)
  names it (grep for "hit grid" finds nothing). The gap is the report;
  not authored here.
- Census candidate (repeating #529's unfinished bycatch, still open): the
  suite may hold more blind presses onto just-relocated geometry. This
  task's instance was a click after a LAYOUT-CHANGING click; the #529
  census only swept drags. A census of click/press sends whose target
  geometry was read before a layout-mutating action would find remaining
  members.
- None observed beyond these: no mispainted cells, no focus jumps, no
  stray panes or leftover files (probe homes are mkdtemp and removed; the
  drive server was stopped).

## Instrument feedback

- EASY: the #529 probe pattern (loop one step, staged autopsy, liveness
  jiggle, recovery click) located the mechanism in one probe run; the
  planted-gap mode made it deterministic.
- ASK (repeat of #529's, now with a second paying customer): a driver
  verb proving "the hit grid resolves renderable X at cell (c,r)" without
  each surface needing a visible hover reveal. Both fixes ride a
  palette-color reveal; a control with no hover paint could not be yoked
  this way.

## Files changed

- [smoke-panel-chrome-harness.ts](../../../../scripts/harness/smoke-panel-chrome-harness.ts)
  — the rapid-expand step aims its second activation at the moved Restore
  control through the hover-reveal yoke.
- [probe-538-rapid-expand-loop.ts](probe-538-rapid-expand-loop.ts) — the
  looping probe with autopsy and the planted-gap red mode.
