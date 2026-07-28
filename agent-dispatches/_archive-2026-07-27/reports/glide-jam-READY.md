# READY — wheel input joins the active glide

Commit: `3af155c8eb1db7d98a533cc1b9aed9c44ba063a4`

Branch: `fix-glide-input-interference` (clean; ahead of `origin/main` by 1 and
behind it by 3, intentionally not merged per the task).

## Outcome

Wheel input no longer publishes reactive momentum once per physical event.
Every wheel event appends a plain impulse to the shared `Momentum` value; the
animation tick drains the queue in order and is the sole reactive momentum and
scroll-offset writer. This is one shared generator used by editor, diff, tree,
Git panes, markdown preview, terminal scrollback, and scrollable text panes.

The root bubbled wheel observer now uses the standalone
`lodash.throttle` import at one call site to coalesce only
`renderer.requestRender()` to frame cadence. It does not drop or merge
impulses. Other mouse events retain their synchronous paint behavior.

The default maximum glide tail is now 900 ms after the latest input. The new
`Maximum glide after input (ms)` setting is live, discoverable in the
Scrolling section, persisted through the existing settings store, and bounded
to 100–2000 ms in 50 ms steps.

## Ranked hypotheses

1. **Two owners:** eliminated for the literal scroll offset: input did not
   directly write `scrollTop`; the animation tick already owned it. Confirmed
   an adjacent ownership violation, however: every event and every animation
   tick both wrote the reactive momentum ref. Moving input to the plain pending
   queue leaves one reactive writer.
2. **Per-event synchronous work:** confirmed as dominant. Replanting the old
   reactive assignment produced 209–212 projection passes for 150 events.
   The final runs consume all 150 impulses in only 56–59 projection passes.
   Throttling the root request alone did not materially improve the count;
   removing the per-event reactive publication did.
3. **Animation restart:** eliminated. The old and new paths both preserve
   same-direction physical velocity; final count probes show 150 input events
   become exactly 150 applied impulses. Contrary-direction reset remains the
   intentional precision behavior.

## Harness gap and positive control

The old continuous-input probe sent many notches in one PTY write every
100/200 ms, so it did not apply event-boundary pressure. Individual events
requested every 7 ms measured only about 125–128 events/s through the loaded
app. The calibrated 6 ms producer measures 143.6–149.5 events/s while keeping
the gesture at exactly 150 events.

The new contract records events, applied impulses, projection passes, and rows
travelled for editor and diff at both 2k and 100k lines. It requires exact
event-to-impulse preservation, projections below event count, and 2k/100k
travel within the 8-row maximum-velocity frame budget.

For the mandatory positive control I temporarily restored the old reactive
assignment in editor and diff. The contract exited 1 with:

> error: editor 2000-line rapid input ran 212 projection passes for 150 wheel events

The plant was removed immediately. The permanent synthetic positive control
also reports its expected RED line before each real measurement.

## Driven fingerprints

Final real-rate runs (three passes, all exit 0):

| Run | Surface | 2k events/impulses/projections/rows | 100k events/impulses/projections/rows |
| ---: | --- | --- | --- |
| 1 | editor | 150/150/58/406 | 150/150/58/405 |
| 1 | diff | 150/150/57/402 | 150/150/56/395 |
| 2 | editor | 150/150/59/412 | 150/150/58/406 |
| 2 | diff | 150/150/58/401 | 150/150/57/403 |
| 3 | editor | 150/150/58/406 | 150/150/58/405 |
| 3 | diff | 150/150/58/400 | 150/150/57/402 |

The final full behavioral run measured 150/150 impulses, 57–58 projections,
and 394–405 rows across the four scale/surface cases.

## Glide duration choice

The previous implementation had no duration cap. With the same calibrated
150-event gesture and a 60-second setting to emulate that behavior, editor and
diff travelled 1,079–1,083 rows and ran 173–174 projections at both scales.
The new 900 ms default travels roughly 394–412 rows in the same four cases.

I drove 450, 650, and 850 ms candidates before the final 900 ms value:

- 450 ms: about 340 rows; cut the established sustained-fast segment too far.
- 650 ms: about 384 rows; the existing rapid-ceiling contract failed.
- 850 ms: about 428 rows in the earlier cadence probe, but a full-suite run
  landed at 23 capped frames against the existing 24-frame promise.
- 900 ms: 27 deterministic saturated-tail frames / 197 post-input rows, and
  the full behavioral suite preserves the existing ceiling-duration contract.

Thus 900 ms is the shortest 50 ms settings step with frame-phase margin while
reducing the old unbounded total travel by roughly 62%.

## Lodash evaluation

- Import: `import throttle from 'lodash.throttle'` — the standalone function
  package, never the whole lodash library.
- Seam: one throttle construction in `Bootstrap`, covering the single bubbled
  root wheel render-request boundary.
- Measured installed weight: `lodash.throttle` 16,478 bytes. Its direct type
  package is 3,201 bytes; the transitive `@types/lodash` tree is 869,945 bytes
  and is development-only.

## Invariant review

The change strengthens `One writer per scroll regime per frame` and
`Same-direction notches accumulate until the glide ceiling`. The UI contract
now names the queue/drain mechanism and the real-rate evidence. The relevant
app, diff, editor, settings, system, UI, and workspace contracts remain
upheld; no invariant was weakened or removed.

## Verification — exact exit codes

- `bunx tsc --noEmit` — 0
- `bun test` — 0 (`1642 pass`, `0 fail`)
- `bash scripts/conventions-gate.sh` — 0
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — 0 (`867` annotations, `45` lattice links, `0` problems)
- `bun scripts/check-coverage-ratchet.ts` — 0
- `bash scripts/behavioral-contracts.sh` — 0 (`ALL-PASS`)
- `bun scripts/harness/smoke-scrollbars-harness.ts` runs 1/2/3 — 0/0/0
- calibrated real-rate glide contract runs 1/2/3 — 0/0/0

The task prohibited `scripts/merge-gate.sh`; it was not run.

## Bycatch

- The broad `scripts/smoke-settings-applied.sh` exited 1 because its existing
  `scrollAccelGain 120 scrolls further than 5` single-notch comparison
  observed `0 not > 1`. A deterministic physics probe reproduces the premise
  error: with the current reserved-headroom ceiling curve, gain 5 travels one
  row and gain 120 travels zero for a lone notch. The new maximum-duration
  applied-effect drive itself passed (`29 > 18`). I did not change this
  unrelated contract.

# READY — Round 2 settings gate repairs

Commit: `2442d8f3416fb5249afd3cd022410093830281d2`

Branch: `fix-glide-input-interference` (clean; ahead of `origin/main` by 3).

## Outcome

The TypeScript settings-applied harness now covers all 36 host schema fields
and proves `maximumGlideDurationMilliseconds` changes behavior through the
real PTY. Each value receives the same 150 separately written wheel events at
the accepted 6 ms producer cadence. Both runs must apply all 150 impulses, and
the 1200 ms cap must travel farther than the 300 ms cap by more than one
declared maximum-velocity frame budget (`ceil(220 / 30) = 8` rows). The final
three committed-state runs measured short/long travel of `282/473`,
`274/473`, and `274/479` rows.

The layout red was a stale probe, not an app regression. The initial failing
120x50 frame showed `Sidebar position` and `Bottom panel alignment` at the
bottom of the Settings viewport while the primary-dock span was below it.
Driving Down through the real PTY reached the hidden row; the resulting frame
showed:

- row 45: `Sidebar position`
- row 46: `Bottom panel alignment`
- row 47: selected `Primary dock vertical span (when bottom panel is open)`

The app's shared Settings viewport therefore remained reachable and scrolled
correctly. The smoke now reads `settingsSections`, `settingsLabels`, and
`settingsSelected`, moves by the published descriptor-index delta, waits for
the exact selected label, and proves that selected row is painted. It no
longer assumes the initial frame co-locates three labels.

## Applied-effect positive control

I temporarily made both duration drives use 300 ms. A bare greater-than
comparison first exposed four rows of frame-phase variance and incorrectly
passed, which proved that form was too weak. After binding the comparison to
the one-frame row budget, the planted defect exited 1 with:

> FAIL maximumGlideDurationMilliseconds 1200 travels more rows than 300 by
> more than one frame budget for 150 applied impulses each (281 to 274; frame
> budget 8)

The plant was removed. The real 300/1200 ms values then passed all three
committed-state runs.

## Settings-row blast radius

AST and text sweeps covered every probe that opens Settings or reads its
selection geometry:

- `scripts/harness/smoke-layout-harness.ts` had two initial-frame
  three-label co-location waits. FIXED in this commit with published
  section/descriptor navigation.
- `scripts/harness/smoke-workspace-tabs-harness.ts` and
  `scripts/smoke-workspace-tabs.sh` both require `Workspace tabs` to be
  visible immediately, then click its painted row. They remain green in the
  cited full-gate baseline but are position-sensitive and tracked by #143.
- `scripts/harness/smoke-code-folding-harness.ts` derives the contributed
  row's exact index from `settingsLabels`; the added row changes the index but
  not the probe.
- `scripts/harness/smoke-voice-picker-harness.ts`,
  `scripts/smoke-voice-picker.sh`,
  `scripts/harness/smoke-settings-applied-harness.ts`,
  `scripts/harness/smoke-pixel-preview-harness.ts`, and
  `scripts/harness/smoke-plugin-manifest-harness.ts` navigate until a
  published label is selected. The new row adds one navigation step for later
  sections; none assumes a numeric row.
- `scripts/harness/smoke-overlay-dialog-harness.ts` reads published dialog
  bounds, viewport extent, and scroll position. The content extent grows by
  one row, but its thumb/wheel probes use live geometry.
- `scripts/harness/smoke-clipboard-frame-boundary-harness.ts` discovers the
  first `Scrolling` heading from painted cells; adding a row below that
  heading does not move its target.
- Settings openings in `smoke-agent-cancel-harness.ts`,
  `smoke-mode-coherence-harness.ts`, and the overlay/pixel close-path drives
  assert only modal ownership, bounds, or close behavior and carry no
  settings-row assumption.

No blast-radius item besides the two requested layout waits was changed.

## Invariant review

Derived scope was the root project contract, the harness contract, and the
settings/layout/UI contracts implicated by the two driven smokes. The change
upholds condition-based waits, real-PTY input/output, the terminal-emulator
screen oracle, Settings live application, overlay viewport reachability, and
layout configuration from one source. The final checker resolved 867
annotations and 45 lattice links with zero problems.

## Verification — exact exit codes

- `bun scripts/harness/smoke-settings-applied-harness.ts` committed-state
  runs 1/2/3 — `0/0/0`
- `bun scripts/harness/smoke-layout-harness.ts` committed-state runs 1/2/3
  — `0/0/0`
- applied-effect planted defect — `1` (expected RED, quoted above)
- `bunx tsc --noEmit` — `0`
- `bun test` — `0` (`1642 pass`, `0 fail`)
- `bash scripts/conventions-gate.sh` — `0`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — `0` (`867` annotations, `45` lattice links, `0` problems)
- `bun scripts/check-coverage-ratchet.ts` — `0` (no undeclared decrease)
- `bun scripts/harness/smoke-scrollbars-harness.ts` — `0`
- `bash scripts/smoke-settings-applied.sh` — `1`: its maximum-glide drive
  passed (`29 > 19`) and its 36-field meta-gate passed; the unrelated
  `scrollAccelGain` single-notch claim failed (`0 not > 1`)
- `bash scripts/behavioral-contracts.sh` before the formatting-only
  pre-commit hook — `0`, including 150/150 impulses and 56-59 projection
  passes across editor/diff at 2k/100k
- `bash scripts/behavioral-contracts.sh` on the committed bytes — `1`:
  coalescing and scale checks passed, but the intermittent rapid-ceiling tail
  produced 23 frames against 24; the prior identical semantic source produced
  24 and passed

The task prohibited `scripts/merge-gate.sh`; it was not run. No push, merge,
tag, or branch deletion was performed.

## Bycatch

- REPRODUCED AGAIN: `scripts/smoke-settings-applied.sh` still has the
  unrelated gain-120 single-notch premise from round one; exact drive:
  `scrollAccelGain=5` then `120`, one wheel notch each. It failed `0 not > 1`
  while the new duration drive and schema meta-gate passed.
- INTERMITTENT: the committed behavioral run's rapid-ceiling count was
  `23/24`; the earlier final-source run was `24/24`. The separated peaks,
  150-event coalescing, projection, and scale fingerprints passed in both.
  I did not retune accepted production behavior or weaken the contract.
- OBSERVED ONCE: the standalone smoothness instrument's pre-measurement
  single notch at the schema-minimum 100 ms glide cap applied one impulse but
  traveled zero rows before the cap, so its preflight `scrollTop > 0` wait
  timed out. The 300 ms short-cap drive was reachable and was used for this
  task.

# ROUND 3 — READY

Commit: `9125b0f` (`Make glide accumulation failures phase-independent`)

## Outcome

The glide-accumulation instrument now reports separated-flick accumulation
and rapid-input ceiling sustain as independent production conditions. Each
PASS and FAIL message carries the measurements for its own clause.

The rapid clause no longer counts frames whose integer row crossing happens
to meet `floor(220 / 30)`. It asserts total whole-row travel against a floor
derived from the production mechanism:

`ceil(verticalFlingCeiling * maximumGlideDurationMilliseconds / 1000 - 1)`

At the shipped values this is `ceil(220 * 900 / 1000 - 1) = 197` rows. The
subtracted quantity is not a fitted tolerance: `Momentum.stepMomentum`
integrates capped velocity and may discard only its residual strictly below
one row when the capped tail ends. No production default or physics path was
changed.

The `Same-direction notches accumulate until the glide ceiling` record now
states why completed-frame counts are phase-sensitive and why the live
contract uses total travel instead.

## Newly specific failure

The first full run after splitting happened to pass at `24/24` (exit `0`).
Re-evaluating the exact newly split predicate against the first run of the
required ten-run sequence produced the clause-specific failure:

> FAIL rapid input ceiling duration failed
> (rapidCeilingFrames=23/24,
> rapidSequence=8,6,8,7,7,8,7,8,9,5,7,8,7,8,7,7,7,8,7,7,8,7,7,7,7)

The separated peak measurements in the full split run were independently
healthy: default `19,22,24`; raised `19,31,35`.

## Ten-run frame fingerprint

Every run had 25 moving crossings, 26 observed frames, 27 attributed app
frames, and final visual row 197. The old ceiling-frame count still varied:

1. `23` — `8,6,8,7,7,8,7,8,9,5,7,8,7,8,7,7,7,8,7,7,8,7,7,7,7`
2. `24` — `8,7,8,7,7,8,7,8,7,7,7,8,7,7,8,7,8,7,7,8,7,7,8,7,6`
3. `24` — `8,7,8,7,7,8,7,7,8,7,7,8,7,7,8,7,7,8,7,7,8,7,7,8,6`
4. `23` — `6,7,7,8,7,7,8,7,8,7,7,8,7,7,8,7,7,8,7,7,8,7,8,7,6`
5. `23` — `7,8,7,7,7,8,7,7,8,7,7,8,7,8,7,7,8,7,9,5,8,7,7,8,6`
6. `24` — `7,7,8,7,7,8,7,7,8,7,7,8,7,8,7,7,7,7,8,7,8,8,7,7,6`
7. `23` — `6,8,7,7,8,7,7,7,8,7,8,7,7,8,7,7,8,7,7,8,7,7,8,7,6`
8. `22` — `6,7,8,7,7,8,7,8,7,7,7,8,8,6,8,7,7,8,7,8,7,7,7,8,6`
9. `23` — `6,7,8,7,8,7,7,7,8,7,8,7,7,7,8,7,8,7,7,7,8,7,8,7,6`
10. `24` — `7,8,7,7,8,7,7,8,7,7,8,7,7,8,7,7,8,7,7,7,8,7,7,8,6`

The count sequence is `23,24,24,23,23,24,23,22,23,24`; total visual travel
is `197,197,197,197,197,197,197,197,197,197`. Tick phase redistributes the
same capped integral among 5–9-row completed-frame crossings, so accepting 23
would not have removed the coupling: run 8 already demonstrated 22.

## Positive controls

I temporarily forced each new production condition false, ran the full real
contract, captured the diagnostic, and removed the plant.

- Separated-peaks plant — exit `1`:

  > FAIL separated flick peaks failed to climb (default=19,22,24,
  > raised=19,31,35, delays=210.6,205.8,208.7,207.5ms,
  > defaultSequences=9,4,3,3,2,2/7,5,6,4,4,3/7,6,6,5,4,4,3,3,2,2,2,1,2,1,1,1,1,1,1,1,1,
  > raisedSequences=10,3,3,3,2,2/10,8,7,6,6,4/11,9,8,7,6,6,4,4,4,3,3,2,2,2,1,1,2,1,1,1,1,1)

  The rapid clause simultaneously passed at `rapidTravelRows=197/197`.

- Rapid-travel plant — exit `1`:

  > FAIL rapid input ceiling travel failed (rapidTravelRows=197/197,
  > rapidSequence=6,7,8,7,7,8,7,7,8,8,7,7,7,8,7,7,8,7,7,7,8,7,7,8,6)

  The peaks clause simultaneously passed at default `19,22,24` and raised
  `19,31,35`.

## Verification — exact exit codes

- `bash scripts/behavioral-contracts.sh` final runs 1/2/3 — `0/0/0`; every
  rapid clause measured `rapidTravelRows=197/197`
- `bunx tsc --noEmit` — `0`
- `bun test` — `0` (`1651 pass`, `0 fail`)
- `bash scripts/conventions-gate.sh` — `0`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — `0` (`869` annotations, `45` lattice links, `0` problems)
- `bun scripts/check-coverage-ratchet.ts` — `0` (309 files inspected, no
  undeclared decrease)
- `bash -n scripts/behavioral-contracts.sh` — `0`
- `git diff --check` before commit — `0`
- required commit command with the two files staged — `0`

The task prohibited `scripts/merge-gate.sh`; it was not run. No push, merge,
tag, branch deletion, or production-default retuning was performed.

## Invariant review

Derived scope was the root project contract and the UI contract implicated by
`glide-accumulation`. The change refines, rather than weakens, the recorded
verification: the sustained-ceiling generator is capped velocity integrated
over the configured tail; frame partitioning is an expression of that travel,
not the invariant. The final mechanical checker reported zero problems.

## Bycatch

No new out-of-scope defect was observed. Tracked issues #145 and #146 were not
investigated or changed.
