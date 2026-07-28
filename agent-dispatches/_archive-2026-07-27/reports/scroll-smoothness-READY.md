# Scroll smoothness: measured, bisected, NOT attributable to the named window

Branch `fix-scroll-smoothness` in `/tmp/conductor-smooth`, one commit on top of `e6450c6`:
`17e370e Measure glide smoothness, and gate it`. Worktree clean, on branch.

**Headline: the numbers came out flat.** Not just across the five named commits — across six
commits spanning 24 hours of history, reaching back before progressive impulse gain landed. No
metric moves. I did not change the momentum constants, the scroll code, or `ScrollbarSync`. What
shipped is the instrument that was missing and the contract that was missing.

---

## 1. The instrument

`scripts/harness/measure-scroll-smoothness.ts` — drives ONE fast wheel fling on a 4000-line fixture
at the real PTY (120x40, default settings, which happen to match the product owner's own
`settings.json`: `linesPerNotch: 1`, `wordWrap: false`, `fastScrollModifier: "none"`).

**What it observes.** For every completed synchronized frame of the gesture it reads the *lowest
visible `line NNNN content` index in the emulator grid*. That number IS that frame's `scrollTop`, so
each sample is exactly the position painted in that frame — no status-file publish race, no frame
ordinals. From the sequence it derives: moving-frame count, total distance, per-frame delta
distribution (max / mean / full histogram), peak velocity in rows per second from the frames' own
byte-arrival timestamps, frames per second, and **bytes per frame** (`observedByteCount` deltas — the
quantity a real terminal converts into frame *time*, so a paint-cost regression shows up here).

**Terminator.** Rendering is demand-driven: while any glide runs the app holds one live render
request; the instant every animation settles the request is dropped and frame production stops.
"No frame within 700 ms" therefore *observes rest* rather than assuming silence. No bare sleeps.

**Why it can bisect.** It imports `PtyTestDriver` and `HarnessInput` only, and polls the status file
with its own local loop. `HarnessSmoke`'s status helpers changed signature inside the window, and
`workspaceScrollMomentumAtRest` does not exist in the older builds — routing through either would have
failed at exactly the commits that needed measuring. My first attempt did fail that way; the
version-independent rewrite is what made the table below possible.

**One correction worth recording.** Sent as 12 separate PTY writes, the identical gesture lands on one
of *three* quantized outcomes differing by ~35% in both distance and peak velocity. Cause: the train
straddles two input regimes — the app either reads several notches in one chunk (their impulses
compound before any frame decays them) or reads them one at a time across frames (each impulse
decayed before the next lands). Because `Momentum.addImpulse` computes progressive gain from the
*current* velocity, where the chunk boundary falls changes the peak reached. Sending the whole train
in ONE write removes it, and the measurement then compares builds instead of comparing PTY chunk
boundaries. Without that fix the instrument would have produced a ±35% spread that could be read as
any regression you liked.

---

## 2. The bisect

Deterministic instrument, 2 rounds x 3 gestures = 6 flings per commit, round-robin across commits so
machine load could not bias one of them. Ranges are min-max over the 6 flings.

| commit | moving frames | distance (rows) | max frame delta | mean delta | peak (rows/s) | fps | bytes/frame |
|---|---|---|---|---|---|---|---|
| `40d244b~1` (before progressive gain, 07-25 03:04) | 17-19 | 36-48 | 5-7 | 2.00-2.53 | 138-191 | 19.6-22.2 | 3202-3205 |
| `eae4a5b` flyweight + acceleration | 17-18 | 36-48 | 5-7 | 2.12-2.67 | 134-192 | 19.6-21.6 | 3105-3109 |
| `447a93d` Invert Git into the plugin canvas | 17-19 | 36-48 | 5-7 | 2.12-2.53 | 129-188 | 17.5-22.5 | 2944-3108 |
| `f10f778` Restore plugin-contributed dock chrome | 17-19 | 36-48 | 5-7 | 2.12-2.53 | 136-191 | 20.0-22.6 | 3105-3108 |
| `0460495` Restore live plugin canvas observations | 17-19 | 36-48 | 5-7 | 2.00-2.53 | 133-193 | 16.3-22.3 | 2952-3108 |
| `e6450c6` current main | 17-19 | 36-48 | 5-7 | 2.00-2.67 | 133-193 | 20.2-22.6 | 3105-3109 |

**Flat on every axis.** Identical bimodal outcome at every commit (48 rows / 7-row peak step for a
fling after an idle app, 36 rows / 5-row peak step for one following a previous fling). The only
movement anywhere in the table is bytes per frame *falling* ~100 bytes at `df27d46` — paint got
marginally cheaper, the opposite direction from a regression.

I also ran the noisier multi-write version over `40d244b~1 · 40d244b · 1ae7ec2 · df27d46 · eae4a5b ·
e6450c6` (2 rounds). The same three quantized outcomes appear at every one of those commits too,
including the pre-gain baseline — which is how I established the spread was the measurement rather
than the physics.

**So: the regression is not in the five named commits, and not anywhere in the last 24 hours of the
editor wheel-glide path.** Where it is *not* is now a fact rather than an inference. `df27d46`
(question 2 in the brief) is inside the measured range and clean.

**Suspect #1 is cleared, empirically.** `ScrollbarSync` does not feed its own input back per frame.
`applyBar` writes `bar.scrollPosition` inside `applying = true`, and the bar's `onChange` early-returns
while that flag is set, so the write-back fires only on a real drag. The per-frame positions confirm it
independently: a quantized write-back for a 4000-line file in a ~38-row track would snap `scrollTop` to
~105-row multiples, showing as long runs of zero punctuated by huge jumps. The actual sequence is
`7 14 20 25 29 33 36 39 41 43 45 47 48 49 50 51 52 53 54 55` — a clean monotonic decay,
histogram `{7:1, 6:1, 5:1, 4:2, 3:2, 2:4, 1:8}`, exactly the shape the decay curve should produce.

---

## 3. What the numbers DO say — a standing property, not tonight's change

Two things are real, measurable, present identically at every commit, and worth the product owner's
attention on their own terms:

1. **A fling runs at 19-23 fps against `targetFps: 30`.** So a ~1-second glide arrives as ~18 steps
   of up to 7 rows instead of ~30 smaller ones. That is genuine, quantified choppiness — it just did
   not appear tonight.
2. **The same gesture does not always produce the same motion.** A fling that follows an idle app
   travels 48 rows and peaks near the 220 rows/s ceiling; a fling that follows a previous fling
   travels 36 rows and peaks near 140 — a 25% distance and 45% peak-velocity deficit, reproducible
   run after run. Mechanism: `Momentum.addImpulse` derives progressive gain from the *current*
   velocity, which decays with wall-clock time between notches, so how many frames land between the
   notches of one gesture changes the peak that gesture reaches. This is the closest thing I found to
   "the velocity is less when going fast" — sometimes it genuinely is, by 45%, for an identical
   gesture. It is also present in the pre-progressive-gain build, so it is not a `40d244b` regression,
   and gain-from-velocity is a deliberate user-requested product decision. **I have not touched it.**
   It is a defect I can name but not one this task's evidence licenses me to change.

I did not fix anything, because the bisect named nothing. Per the brief, saying so is the finding.

---

## 4. The ratchet

`glide-smoothness`, in `scripts/behavioral-contracts.sh` immediately after `momentum-glide` (whose
blind spot it covers), driven by the instrument with `SMOOTHNESS_GESTURES=2`. Three bounds, each
computed from a value the app itself declares — none fitted to an observation:

| assertion | bound | derivation | observed |
|---|---|---|---|
| choppiness ceiling | no frame advances > **15 rows** | `verticalFlingCeiling` 220 rows/s ÷ `targetFps` 30 = 7.3 rows per frame at full speed; 15 = two budgets, so exceeding it means the loop skipped >= 2 consecutive frames | 5-7 |
| cadence floor | >= **10 moving frames** | the decay curve fixes the duration: ln(220/3)/ln(1/0.015) = 1.02 s from the ceiling to `stopVelocity` 3, so ~30 frames at cadence; under 10 is below a third | 17-19 |
| travel floor | fastest trial >= **24 rows** | with `linesPerNotch: 1` the 12-notch fling *requests* 12 rows; momentum that cannot double raw notch travel is not a fling | 36-48 |

The ceiling catches symptom (a), choppiness. The travel floor catches symptom (b), lost peak
velocity, without reading a clock. All three keep >= 1.5x headroom against a loaded machine while
still catching a halving. `behavioral-contracts.sh` already runs `quiet_serial_smoke`, so the timing
sensitivity is correctly bucketed with no new registration.

**Proven to fail loudly.** With the three bounds inverted on a scratch copy, all three redden and
quote the observed figures; exit 1. A check that can only fail toward "pass" is not a check.

New invariant recorded: **"A fast glide crosses rows in many small steps"** in
`src/modules/ui/ui.invariants.md`, alongside the three sibling scroll contracts. It states the
property `gain` cannot see, names the three mechanisms that bound the step size (`residual` carried
inside the momentum value, the single live render request held for the glide's duration, the
`dtSeconds` clamp), and lists "a renderer that writes a quantized copy of the integrator's position
back into the viewport each frame" in its impossible set — so if suspect #1 ever becomes true, this
contract is what fails.

---

## 5. Exit codes

| command | exit |
|---|---|
| `bunx tsc --noEmit` | **0** |
| `bun test` | **0** (1388 pass, 0 fail, 16101 expects, 220 files) |
| `bash scripts/behavioral-contracts.sh` | **0** — ALL-PASS, including the 3 new assertions |
| `bun scripts/check-coverage-ratchet.ts` | **0** (274 files, no undeclared decrease; growth only) |
| `check_invariants.mjs --all` | **0** |
| `check_invariants.mjs --refs` | **0** (717 annotations resolved, 45 lattice links, 0 problems) |
| `bash scripts/conventions-gate.sh` | **0** (file-grammar PASS, 0 violations) |
| `bun scripts/harness/smoke-scrollbars-harness.ts` x3 | **0 / 0 / 0** — ALL-PASS each run |
| positive control (bounds inverted) | **1** — all three assertions red, as required |

`scripts/merge-gate.sh` not run. Nothing pushed, merged, tagged, or deleted.

---

## 6. Where to look next

The regression is outside the measured code path. In descending order of what the evidence supports:

1. **The terminal / emulator path, not the app.** Byte cost per frame is unchanged (it *fell*), so if
   the product owner's terminal now delivers fewer frames for the same bytes, the app looks choppier
   with no app change. The instrument reports `bytes/frame` and `fps` separately precisely so that
   split is decidable — run it under the real terminal profile.
2. **Machine load during the test.** A fleet was active. My instrument sees 19-23 fps on an
   otherwise-idle 16-core box; under contention the frame count drops, the steps grow, and once frame
   time passes `MAXIMUM_DELTA_TIME_SECONDS` (100 ms) the `dt` clamp under-integrates the glide —
   which lowers rows-per-second while *preserving* total displacement. That is the exact reported
   symptom pair, produced with no code change at all, and it is the single hypothesis that explains
   both halves at once.
3. **The layout I could not reproduce.** The product owner's session has the agent pane, two
   terminals, and a right dock open (`panelContentOrder`, `rightDockWidth: 32`); my fixture had a bare
   editor plus tree. If tonight's plugin-canvas landings made per-frame observation cost grow, it
   would only show with those panes mounted. The instrument would need a layout variant to settle it —
   that is the one measurement gap I am leaving open, and it is the first thing I would do next.
