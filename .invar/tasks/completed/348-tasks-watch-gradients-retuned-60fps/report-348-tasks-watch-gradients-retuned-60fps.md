# READY #348 — tasks:watch gradients retuned for 60fps

Commit: `21b008c3` — "tasks:watch motion steps on wall-clock time, not on paint frames (#348)"
GATE_EXIT=0 (merge-gate: ALL-PASS, total 4m10s, read from the commit's gate log)
Branch: `fleet/348-tasks-watch-gradients-retuned-60fps` — worktree clean, not pushed.

## What was wrong — measured, not assumed

The brief says the motion runs 2x too fast because #329 (tasks-watch animation
tick restored) moved the paint rate from 30 fps to 60 fps. **That premise is
wrong.** The measured error was 9.96x, and the paint rate never was 30 fps in
the watch.

History says so directly. Before #329, `tasks:watch` passed `dataTick` — a
counter that advanced once every 2 s data tick — as the motion step. #329
replaced it with `tasksWatchRenderer.animationFrame`, the 60 fps paint ordinal,
and every ramp, glyph, and breath table then advanced once per painted frame.

The design speed is recorded in the tables themselves and is still honoured by
the in-app dashboard pane: six motion steps a second (the pane ticks at 30 fps
and divided by `TASKS_MOTION_PAINTS_PER_STEP = 5`). Twelve breath frames at six
steps a second is the "one breath ~2 s" the comment promises.

Driven measurement on the unchanged code, real `tasks:watch` in a PTY against a
throwaway fixture ledger:

```
motionStepMilliseconds=16.7 (design 166.7)
motionSpeedRatioAgainstDesign=9.96x
paintFramesPerMotionStep=1.0
motionCycleSeconds=0.40
animationFramesPerSecond=60.0
```

One motion step held for a single frame — 16.7 ms — and the whole cycle passed
in 0.40 s.

## The fix — time is the generator

The phase is now a pure function of elapsed time, in one place both consumers
import:

- `scripts/tasks/tasks-status.ts` exports `TASKS_MOTION_STEPS_PER_SECOND` (6),
  `TASKS_MOTION_STEP_MILLISECONDS` (166.67), and
  `tasksMotionStepAtElapsed(elapsedMilliseconds)`.
- `scripts/tasks/TasksWatchRenderer.ts` gained
  `animationElapsedMillisecondsAtFrame(animationFrame)` and the instance getter
  `animationElapsedMilliseconds`. The animation-row callback now receives the
  frame's elapsed TIME, not its ordinal. Frames remain the sampling; time is the
  content.
- The CLI watch feeds the renderer's animation clock into the live lens and the
  gate badge.
- The dashboard pane feeds its own motion clock
  (`TasksDashboardOverview.animationElapsedMilliseconds`) into the same
  function, so `TASKS_MOTION_PAINTS_PER_STEP` is gone. There is now exactly one
  cadence, not a paint-count vocabulary beside a time-based one.

The pane's painted output is unchanged by construction:
`floor(paint * (1000/30) / (1000/6)) === floor(paint / 5)` for every paint.

**Change pops rode the same defect and were repaired with it.** `notePop` /
`popSuffix` aged in paint frames against `POP_LIFETIME_FRAMES = 60` while their
comment promised "~2 s". Counted in the pre-#329 2 s data ticks that constant
was 120 s; counted in 60 fps frames it was 1 s. It is now
`POP_LIFETIME_MILLISECONDS = 2_000` against the same wall clock, which is what
the comment always claimed.

One label was corrected as part of the same change: the watch header said
`60fps motion`. It now says `60fps paint` — the paint rate is 60 fps, the motion
is six steps a second.

## Time-based proof

`scripts/tasks/TasksWatchRenderer.test.ts`, three new tests:

1. *the motion phase is a pure function of elapsed time* — fixed timestamps, not
   per-frame deltas: `t=0 → 0`, `166 → 0`, `167 → 1`, `1000 → 6`, `2000 → 12`;
   twelve breath frames span 2.000 s. Both polarities: negative elapsed and NaN
   read as step 0 rather than a negative index or NaN.
2. *the motion phase at a moment is the same at 30 FPS and at 60 FPS* — samples
   4 s at 30, 60, and 120 fps; every moment the slowest rate observes, the
   faster rates paint identically, and all three reach the same highest phase
   (24). Doubling the rate adds smoothness, never distance.
3. *the animation row content depends on the clock, not on the frame ordinal* —
   drives the real renderer with an injected clock at 30 fps and at 60 fps over
   the same 2 s. 60 painted frames against 120, and at every shared timestamp
   the painted phase is equal. The two seconds end on step 12: one breath.

**Positive control.** I planted the frame-ordinal phase back
(`floor(elapsed / (1000/60))` in `tasksMotionStepAtElapsed`) and re-ran: 3 of
11 tests went RED, including the speed clause —
`expect(paintedAtThirty.at(-1)?.[1]).toBe(12)` reported `Received: 120`. The
plant was removed and the file restored byte-for-byte; the suite is green.

## Driven 60fps look check — after

Same probe, same fixture, real `tasks:watch` through a PTY:

```
motionStepMilliseconds=166.7 (design 166.7)
motionSpeedRatioAgainstDesign=1.00x
motionCycleSeconds=4.00
animationFramesPerSecond=6.0
```

Confirmed over a 6 s and a 12 s capture. The gradient now holds each step for
one sixth of a second and glides; the exploring row's cycle is 4.0 s because its
8 glyphs and 6 colours only agree after 24 steps (a building row's breath is
12 steps, ~2 s).

`animationFramesPerSecond` falling from 60 to 6 is not a lost tick. The timer
still wakes at 60 fps; an animation frame whose row is unchanged writes nothing
at all, so the terminal now receives a tenth of the bytes for the same visible
motion. Idle quiescence is untouched — the settled-idle arms still assert zero
writes and zero timers.

The static lenses (`tasks:live`, `tasks:all`) still print the still form
(`➤ exploring`) with no motion, verified by driving them against the fixture.

The probe is committed at
[348-tasks-watch-motion-cadence-probe.ts](348-tasks-watch-motion-cadence-probe.ts)
with a header stating what it runs and how to read every number.

## Gate chain

- `bunx tsc --noEmit` — clean.
- `bun test scripts/tasks/TasksWatchRenderer.test.ts` — 11 pass, 345 assertions.
- `bun test src/modules/tasks-dashboard` — 38 pass.
- `bun scripts/tasks/tasks-status.ts --self-test` — all signals fire, clean
  control silent.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` —
  1233 annotations resolved, 231 lattice links, **0 problems**.
- `bash scripts/conventions-gate.sh` — PASS.
- `bun scripts/harness/smoke-tasks-dashboard-harness.ts` — ALL-PASS standalone.
- Commit through the pre-commit hook: **merge-gate ALL-PASS, GATE_EXIT=0**.

The first commit attempt was blocked by a RED gate. I did not bypass it: the
failing arm is a pre-existing intermittent, described under Bycatch, and the
retried commit went green on its own gate run. Its retry tally names
`smoke: panel-split harness` — #359 (panel split agent terminal order
intermittent), a named class, not chased.

## Invariants in scope — record by record

Scope derived from touched paths: `scripts/tasks/**` (no record of its own) and
`src/modules/tasks-dashboard/**`
([tasks-dashboard.invariants.md](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md)).

- **Task truth lives in the folders the CLI reads** — HOLDS, untouched. No task
  fact moved; only the phase clock did. The probe asserts nothing about records.
- **Dashboard motion exists only while observed** — HOLDS, and **refined**. The
  idle clauses are unchanged and still gated: a hidden pane keeps no timer, a
  held READY row does not repaint, and the settled idle watch still writes zero
  bytes. Its shared-tables clause said the pane uses the exact exported ramps
  and glyph frames; it now also says both step on the exported wall-clock
  cadence, and *Impossible if true* gained "a motion step derived from a frame
  or paint ordinal" — the exact defect this task removed. Evidence and
  Mechanism name `tasksMotionStepAtElapsed`. Last refined bumped to 2026-07-30.
- **Fleet extras name their repository scope** — HOLDS, untouched. The probe
  drives a fixture `INVAR_TASKS_ROOT` with no worktrees; fleet readers were not
  altered.
- **Tasks stay hidden by default** — HOLDS, untouched. No activation or
  visibility path changed; its plugin tests pass.
- **The CLI lenses are the dashboard's one generator** — HOLDS, and **refined**,
  and this is the record that decided the shape of the fix. Adding a time-based
  step to the watch while leaving the pane on a paint count would have created a
  second motion vocabulary — the fork this record forbids. The pane therefore
  moved onto the same exported function, `TASKS_MOTION_PAINTS_PER_STEP` was
  removed rather than left beside it, and the record's export list and
  no-second-X list now name the cadence. Last refined bumped to 2026-07-30.
- **The tasks dashboard is a pane content citizen** — HOLDS, untouched. No
  registration, disposal, or projection changed; uninstall/reinstall arms pass.
- **An absent task tree is stated, never blank** — HOLDS, untouched. The
  absent-tree arm passes.
- **Each dashboard lens has one stable row shape** — HOLDS. Row construction is
  untouched; only the colour and glyph indices' clock changed. Two-row Live and
  one-row Active/Done arms pass.
- **Dashboard controls state their selection and next action** — HOLDS,
  untouched.
- **Task actions use the workspace and runtime seams** — HOLDS, untouched.

Also checked, from the root [project.invariants.md](../../../../project.invariants.md):
*Seams are drawn at the shared generator* — the fix collapses two cadence
expressions into one and is the reason the pane was included. *Cost tracks the
actively observed set* — HOLDS and improves: emitted animation frames per second
fell from 60 to 6 for the same motion.

**Missed records:** none in scope. `scripts/tasks/` itself has no
`*.invariants.md`; that gap is reported under Bycatch.

## Bycatch

- **A wait that does not observe its condition, in a gated smoke** (NOT FIXED —
  it blocked my first commit and is the reason for a second gate run).
  `scripts/harness/smoke-tasks-dashboard-harness.ts:352` reads
  `driver.snapshot().findText('#902 planted-ready')` immediately after awaiting
  the STATUS FILE for `rightDockActiveContent === 'tasks'`. The status flip and
  the grid paint are different events, so under gate load the row text is not on
  the grid yet and the smoke throws "The READY task status target disappeared
  before its click". Reproduced once inside the full merge-gate; the same smoke
  passes standalone, and the following gate run passed. This is convention 7 (a
  wait must observe a condition) violated in the instrument, not a product
  defect. The fix is an `awaitGridCondition` on the row text before the snapshot
  read. Failure log:
  `/tmp/merge-gate-failures.c91c97207f629d29.1156017/behavioral-contracts-felt-invariants-.log`.

- **Comment drift, now corrected inside this task's diff** (FIXED in `21b008c3`,
  not a separate commit because the lines are the very lines the task retunes).
  The breath table said "Twelve frames advancing every fifth paint at 30 fps",
  a paint-count rule the watch never obeyed and that this task replaces; the pop
  comment claimed "~2 s" for a constant that measured 120 s and then 1 s; the
  watch header printed "60fps motion" for motion that ran at 60 steps a second
  by accident and at 6 by design.

- **Contract-layer gap: `scripts/tasks/` has no `*.invariants.md`.** The watch
  makes real promises that no record holds: the settled idle dashboard writes
  zero bytes and schedules zero timers; an animation frame emits one matched DEC
  2026 bracket and no full clear; one animation row's output stays bounded at
  100,000 rows; and now, motion speed is frame-rate invariant. Those clauses are
  asserted in `TasksWatchRenderer.test.ts` and in #329's capture probe, but they
  are owned by no contract. The nearest record,
  [tasks-dashboard.invariants.md](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md),
  governs `src/modules/tasks-dashboard/` and only reaches the CLI as its
  generator. Reporting the gap, not authoring the record.

- **A capture probe in a completed task folder is now near its own timeout**
  (SUSPECT, not verified). `.invar/tasks/completed/329-tasks-watch-animation-tick-restored/329-tasks-watch-animation-capture-probe.ts`
  waits for 24 completed animation frames within 5 s. That was ~0.4 s of writes
  before this change; emitted frames are now 6 a second, so the same 24 frames
  need ~4 s of the 5 s budget. It is a task-folder scratch and the gate does not
  run it, so nothing is red — but anyone re-running it should expect it to be
  tight, and its `REQUIRED_ANIMATION_FRAMES` now means ten times more wall time
  than when it was written.

- **Known flaky classes seen and named, not chased:** `smoke: panel-chrome
  harness` (#214, panel chrome agent close intermittent) passed only on retry in
  the first gate run; `smoke: panel-split harness` (#359, panel split agent
  terminal order intermittent) passed only on retry in the second, green run.

- **Plain nonsense, none observed** beyond the drift listed above.

## Files changed

- `scripts/tasks/tasks-status.ts` — the exported cadence; live lens, gate badge,
  and pop decay moved onto elapsed time; header label.
- `scripts/tasks/TasksWatchRenderer.ts` — elapsed-time accessors; the animation
  callback now takes time.
- `scripts/tasks/TasksWatchRenderer.test.ts` — three new contract tests; two
  existing tests re-expressed in time.
- `src/modules/tasks-dashboard/TasksDashboardOverview.ts` — the pane's motion
  clock in milliseconds.
- `src/modules/tasks-dashboard/TasksDashboardPaneRenderer.ts` and
  `TasksDashboardPaneContent.ts` — the render context carries elapsed time and
  indexes the tables through the shared function.
- `src/modules/tasks-dashboard/TasksDashboardPaneRenderer.test.ts` — contexts
  expressed in motion steps.
- [src/modules/tasks-dashboard/tasks-dashboard.invariants.md](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
  — two records refined.
- `.invar/tasks/in-progress/348-tasks-watch-gradients-retuned-60fps/348-tasks-watch-motion-cadence-probe.ts`
  — new driving probe.
