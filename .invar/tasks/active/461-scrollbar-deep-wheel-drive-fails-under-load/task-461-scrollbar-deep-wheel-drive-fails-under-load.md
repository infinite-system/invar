# Task 461 — scrollbar deep wheel drive fails under load

Priority: flake-evidence
State: ACTIVE
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
Source: bycatch from #457 (gate determinism), reported 2026-08-02

Bycatch from #457, reproduced more than once.

The wait `the deep widest line is visible during the wheel drive` in
`scripts/harness/smoke-scrollbars-harness.ts` first passed only on retry,
later failed both attempts on an unchanged commit. #457 moved the smoke to
the report-only contention tier, which stops it blocking but does not
explain it. Final contention samples passed 5/5, so the rate is not 100%.

Find whether this is a product defect under load or a harness wait that
reads a live grid (the mechanism #457 found in the shortcut sheet: reading
`snapshot()` instead of a completed synchronized frame). The shortcut fix is
the model — do not widen any budget.

## Sighting 2026-08-03 (#493 accidental pre-commit gate, contention pool)

FAIL contention: scrollbars harness, HORIZONTAL-THUMB-STABILITY named
in its log. Diff could not reach it (tooling-only change). Counts
toward recurrence.
