# READY report — #529 (panel-chrome contention flake)

Branch `fleet/529-panel-chrome-rapid-expand-flake`, commits `d6b8945e` and
`7a355925`. Status: READY. Verification numbers are final and appear in the
Verification section.

## In plain words

Two different bugs made panel tests time out under gate load. First: the app
would finish a change and paint it, but the note it writes for the test
runner still said the old state, and nothing ever rewrote the note — so the
test waited thirty seconds for news that was never coming. Now the app
rewrites the note at the end of every frame it settles. Second: the app
keeps a map of what is under the mouse, and that map updates a moment after
the screen does. The test clicked a splitter that had just moved, before the
map caught up, so the click went to the thing that used to be there and the
drag was lost. Now the test hovers first, waits for the splitter to light
up (proof the map is current), then clicks.

## Census — every sighting, the exact wait, the classification

All seven sightings timed out in `awaitStatusWithoutFrame`
(scripts/harness/HarnessSmoke.ts:279), 30 s, polling `status.json` every 5 ms.

| # | Gate log directory | Failing wait | Class |
|---|---|---|---|
| 1 | /tmp/merge-gate-failures.bd0013ddbc854489.1526167 (gate-514 r1) | `two rapid expand clicks complete one symmetric cycle` (100000-line) | B |
| 2 | /tmp/merge-gate-failures.255636bb2d9f2721.1816399 (gate-518 r1) | `100000-line add header press cancels cleanly` | A |
| 3 | /tmp/merge-gate-failures.ca4dd900a63d01c3.1995990 (gate-521 r1) | `120-column a drag begun on the last cell of the drag span still resizes the panel` | C |
| 4 | /tmp/merge-gate-failures.ca4dd900a63d01c3.2060381 (gate-521 r2) | `10-line add header press cancels cleanly` | A |
| 5 | /tmp/merge-gate-failures.3f8ff73176461a37.2151814 (gate-504 r1) | `two rapid expand clicks complete one symmetric cycle` (100000-line) | B |
| 6 | /tmp/merge-gate-failures.88c479c540e591d8.2311648 (gate-505 r1) | `100000-line add header press cancels cleanly` | A |
| 7 | /tmp/merge-gate-failures.88c479c540e591d8.2361561 (gate-505 r2) | `100000-line add header press cancels cleanly` | A |

Premise correction (brief seed item 1): the gate-514 r1 log fails at the
rapid-expand wait, not at "10-line add header press cancels cleanly" as the
brief stated. The press-cancel wait appears in sightings 2, 4, 6, 7.

## Reproduction verdict

Reproduces. Method: 4 concurrent copies of the full smoke on a 16-core idle
machine (the gate's contention tier runs this smoke beside the parallel
smoke fleet; 4-way self-contention reproduces the load shape).

- Pre-fix: 3 failures in 12 contention runs, all at `add header press
  cancels cleanly` (twice 10-line, once 100000-line). Solo: green.
- The focused probe (below) reproduced the same starvation SOLO within 2-4
  iterations of looping the single step, which is what made the mechanism
  observable.

## Class A — `add header press cancels cleanly` (4 of 7 sightings): a real load-starved publisher. FIXED

Walk (mutation → publisher → condition): Escape → `listPopup.close` →
`BoundedListPopup.close()` (model closes, renderables hidden synchronously)
→ the coarse paint effect republishes `AppStatusProjection` → a completed
frame's `frameTick` calls `StatusChannel.settle` → `status.json` → the wait.

The defect: an already-queued frame can render AFTER `close()` mutated the
renderables (so the screen shows the popup gone) but BEFORE the reactive
effect republished the projection. That frame settles and flushes the
PREVIOUS projection (`boundedListPopupOpen: true`). The effect then
republishes in memory and requests a render, but OpenTUI coalesces the
same-turn request — the exact hazard the record "Rendering is one coarse
frame effect" already names — and the app goes quiescent. No later frame
ever flushes the corrected snapshot. The status file lies until the next
input. The wait is honest; the publisher starves.

Decisive probe evidence
([probe-529-press-cancel-loop.ts](probe-529-press-cancel-loop.ts), staged
autopsy): at timeout the SCREEN no longer paints the popup while
`status.json` says `open=true`, frame counter frozen; a second Escape
changes nothing (the model is already closed, so it is a no-op); one mouse
move later the file updates to `open=false` in one frame. Pixels fresh,
snapshot stale, publisher parked.

Fix (`d6b8945e`, src/modules/app/Bootstrap.ts): `frameTick` republishes
`AppStatusProjection` at the settle boundary, before
`StatusChannel.settle`, in harness-observing runs only
(`StatusChannel.observing`). The flushed snapshot now reflects the model of
the frame that settles, by construction. Production runs pay nothing.

Positive control: the probe IS the planted failure — pre-fix it froze at
the pre-close state within 2-4 iterations in three consecutive runs;
post-fix, two 50-iteration runs clean.

## Class B — `two rapid expand clicks complete one symmetric cycle` (2 of 7): same generator as A

The wait observes a status transition (`frame` advanced AND
`panelExpanded === false`) that lands in the LAST frame of the burst — the
same last-frame-skew shape. Never reproduced independently in 32 local
smoke runs (it is the rarest class), so the claim is by generator, not by a
separate reproduction: the settle-boundary republish removes the only
mechanism by which a completed, painted toggle can stay unpublished.

## Class C — the splitter edge drag (1 of 7): a lost gesture, not a starved publisher. FIXED

Post-fix contention round 4 still failed this wait (88-column arm), which
split the class: with the publisher now frame-consistent, a persisting
timeout means the model never changed — the drag itself was lost.

Instrumented dispatch logging (temporary, reverted) proved it: the renderer
received down/drag/up at the edge cell; NO panel handler received anything;
a byte-identical retry 32 s later dispatched normally and resized. Cause:
OpenTUI resolves mouse targets from a native per-frame hit grid that lags
the painted frame (it marks the grid dirty and re-checks hover only after
the next native render). The smoke pressed a just-relaid-out splitter cell
with no hover, inside that lag window, so the press dispatched by the
previous frame's geometry (the old tab row) and the whole gesture was
consumed there. Load widens the window; the probe hit it solo at roughly
one in six edge drags.

Fix (`7a355925`, scripts/harness/smoke-panel-chrome-harness.ts): the two
edge-drag steps now park off the strip, wait for the hover tone to drop
(absence first — the previous drag leaves the pointer on the moved strip,
which would pre-satisfy the presence wait), hover the edge cell, wait for
the reveal (the strip foreground brightens to the palette `fg`), then
press. The reveal is dispatched through the same hit grid as the press, so
observing it proves the grid resolves the splitter at that exact cell.
Hover-precedes-click is the recorded gesture law ([AGENTS.md](../../../../AGENTS.md) rule 5); these
two steps were the deviation — the sibling divider drag that always moves
first never flaked. No timeout widened, no assertion weakened, no skip.

Positive control:
[probe-529-drag-span-loop.ts](probe-529-drag-span-loop.ts) keeps the old
blind gesture behind a `blind` argument — it loses a drag within a few
iterations and the identical retry succeeds; hover mode ran 60/60 clean.

## Verification

- `bunx tsc --noEmit` → 0.
- Invariants checker `--all` + `--refs` → 0 problems (pre-existing legacy
  charset notes only).
- Smoke solo ×5 → green (with class-A fix; rerun ×5 green with both fixes,
  on `7a355925`).
- Smoke under contention on `7a355925`, 5 rounds × 4 concurrent = 20 runs
  with both fixes → 20 green / 20, zero failures (pre-fix baseline: 3
  failures in 12 runs of the same configuration).
- `bun test` on `7a355925` → 2431 pass, 0 fail (72581 expect calls, 371
  files, 20.9 s).
- `scripts/conventions-gate.sh` on `7a355925` → PASS (static-getter-naming
  874 files, retired-smoke-reference 317 files, all ast-query censuses 0
  matches).
- Probes: press-cancel 2×50 iterations clean post-fix (3/3 runs froze
  pre-fix); drag 60/60 hover mode clean, blind positive control red.

## Invariants in scope — the brief's question answered

The panel records in
[ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) ("Panel
controls share paint and hit geometry" and neighbors) are NOT stressed:
both defects live below the panel layer. The stressed record was
[app.invariants.md](../../../../src/modules/app/app.invariants.md) "Rendering
is one coarse frame effect": its Impossible-if-true already forbade "a
state-changing input whose only repaint request is coalesced into an
in-flight frame before the new projection", and its microtask-ordering
defense did not cover the input-turn race. Refined (`d6b8945e`): Mechanism
now names the settle-boundary republish as the structural backstop for the
published snapshot, Impossible-if-true adds the starved-wait shape (a
settled status file disagreeing with its own settled frame's model while
quiescent), Evidence cites the probe.

The harness-side truth this establishes, for the record's future readers:
the emulator screen, the native hit grid, and the settled status file are
three clocks. The settle republish yokes the status file to the settled
frame; the hover-reveal gesture yokes a press to the hit grid. Waits that
mix the clocks without one of these yokes are the flake class.

## Bycatch

- FIXED (in-scope, `7a355925`): the two splitter edge-drag smoke steps
  pressed without hover, violating the recorded hover-precedes-click
  gesture law. Fixed as part of class C.
- Likely same generator as class A: the contention tier's
  `plugin-manifest lifecycle` failure in gate-514 r1
  (/tmp/merge-gate-failures.bd0013ddbc854489.1526167) timed out in
  `awaitStatusWithoutFrame` waiting for "the terminal runtime opens its
  pane before being uninstalled" — a status-transition wait with the same
  starved-publisher signature. Expect the settle republish to cure it; not
  separately reproduced (out of scope).
- Different class, NOT covered by these fixes: the gate-514 r1
  `scrollbars` contention failure timed out on a GRID condition
  (`awaitGridCondition` in PtyTestDriver.ts:453), i.e. pixels, not status.
  One line of evidence only; observed once; not investigated.
- Suspect (code smell, not driven): `BoundedListPopup.close()` hides its
  renderables synchronously inside input handling while every other paint
  mutation flows through the coarse effect — it works, but it is the
  reason a stray frame can paint a state the projection has not published
  yet. A distillation candidate for the record's owner, not fixed here.
- The blind-press pattern may exist in other smokes (this task fixed only
  the panel-chrome edge drags). A census of `kind: 'press'` sends with no
  preceding hover-verified move would find the remaining members of class
  C across the suite.

## Instrument feedback

- EASY: the warm status-file poll plus `awaitGridCondition` made the
  staged autopsies cheap; the probe pattern (loop one step, autopsy on
  timeout with a liveness jiggle) found in minutes what seven gate logs
  could not.
- MISSING (ask): a driver verb that proves "the hit grid resolves renderable
  X at cell (c,r)" without depending on each surface having a visible hover
  reveal. Today the proof rides the hover paint, which not every control
  has. An env-gated hit-grid echo (like the pointer trail) would make
  hover-verified pressing universal.
- MISSING (ask): `waitForHoverState` (DriveSession) compares whole-row text,
  which misses reveals that only change color. A cell-attribute variant
  would have matched this splitter case.

## Files changed

- src/modules/app/Bootstrap.ts — settle-boundary republish (class A/B).
- [src/modules/app/app.invariants.md](../../../../src/modules/app/app.invariants.md) — record refinement.
- scripts/harness/smoke-panel-chrome-harness.ts — hover-verified edge
  drags (class C).
- .invar/tasks/in-progress/529-panel-chrome-rapid-expand-flake/
  probe-529-press-cancel-loop.ts and probe-529-drag-span-loop.ts — the two
  looping probes with autopsies and positive controls (committed on the
  branch; the drag probe's `blind` argument preserves the red mode).
