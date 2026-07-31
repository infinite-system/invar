# Brief 428-1 — make the fold-dense contract genuinely count-based

Read the task file: the fold-dense row floor (>=1000) sits inside the
load jitter band and has now BLOCKED TWO unrelated landings in one
day (green history 1004; reds at 995 twice, FPS healthy every time —
artifacts referenced in the task file and tmp/gate-382.log /
tmp/gate-429-run2.log).

Work order:
1. Read the contract stage in [behavioral-contracts.sh](../../../../scripts/behavioral-contracts.sh)
   (CONTRACT fold-dense-stack) and the driver
   [measure-scroll-smoothness.ts](../../../../scripts/harness/measure-scroll-smoothness.ts).
   Establish WHY rowsTravelled varies: the gesture is time-driven, so
   travelled rows depend on load.
2. Preferred fix: drive by ROWS — command the gesture to a fixed
   row-count target and stop there; assert the stack shape and the
   75000-line checkpoint AT that row. rowsTravelled becomes exact and
   the >= floor becomes ==. If the driver cannot stop on a row
   boundary, second choice: derive the floor from commanded travel
   minus measured jitter (paired sampling, state the derivation) —
   never a hand-set number inside the band.
3. Keep FPS as a report-only trend (floor 28 stays, it has never been
   the trip).
4. Both arms: a genuinely truncated drive (plant: stop the gesture
   early) must still go red. Prove it, remove the plant.
5. Run the contract stage 3x consecutively under a concurrent full
   bun test to show the flake is gone (state all three results).
6. Verification: tsc; the behavioral-contracts fold-dense stage green
   3x; checker --all/--refs.

Rules: no full merge-gate.sh; no push; commit on the branch; READY
report here.

## Invariants in scope
- Any felt/behavioral-contract records ([harness.invariants.md](../../../../scripts/harness/harness.invariants.md)) — "Harness waits observe conditions not frame ordinals" governs the gesture; answer it. Refute any missed.

## Bycatch expected
Report per [AGENTS.md](../../../../AGENTS.md) taxonomy; include a ## Bycatch section
even when it reads: None observed.
