# #380 — an idle Invar instance burns 15-25 percent CPU

State: ACTIVE
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## The report (user, 2026-07-30 ~07:5x, PRIORITIZED)

The user's instance (older --smol build, main checkout) idles at 15-25%
CPU. Memory fine (150-200MB). User hypothesis: active tasks processing.
"It shouldn't be using so much CPU."

## Ranked candidates (measure, do not assume)

a. Tasks LIVE animation: the user's instance shows LIVE rows for the
   conductor's builder lanes; if the spinner/gradient path animates at
   frame rate while rows exist, CPU follows even when the user is idle.
   The idle-quiescence contract says motion only while OBSERVED — check
   whether "observed" is gated on pane VISIBILITY or merely row
   existence, and whether the animation repaints full frames instead of
   row diffs.
b. A timer/interval that survives pane close (the #343/#348 spinner and
   gradient work is adjacent — check gating on both).
c. tasks.json / ledger polling at a hot interval (fs polling instead of
   watch).
d. Renderer loop running unconditionally at 60fps regardless of dirt.

## Method

1. Reproduce: run the app with fixture LIVE tasks, measure idle CPU
   (pidstat/top sampling — cwd-based selection per #376's rule).
2. Profile where the cycles go (bun --inspect or sampling profiler; or
   bisect by toggling: close the tasks pane — does CPU drop? no LIVE
   rows — does it drop? pane hidden but rows exist — ?). The toggle
   matrix IS the measurement.
3. Fix the generator (gate animation on visibility AND liveness; row-diff
   not full repaint; event-driven not polling), then assert: idle
   instance with no visible animation <=2% CPU sustained, and add the
   count/gating assertion to the dashboard smoke (timeless, not a CPU%
   threshold in the gate — CPU% is the report metric, the CONTRACT is
   "no timer runs when nothing animates").

## Rules

No merge-gate.sh by hand; no SKIP_GATE; commit through the hook; commit
BEFORE READY; real hash + GATE_EXIT in header; report to main-checkout
folder. Known flaky classes: #214 #359 #362 #364 #371. Never drive the
app with this repo's real tasks.json (fixtures only — safety rail).

## Invariants in scope

Dashboard motion exists only while observed (tasks-dashboard contract) —
this task may VIOLATE-or-REFINE it: if "observed" is defined as row
existence rather than visibility, the record needs sharpening. Answer
record by record; list missed records.
