# 224 — Momentum reads an ambient clock through a default parameter

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: architecture-hygiene

## Outline

Bycatch of #222, reproduced by reading all 14 production call sites
(`bun scripts/ast-query.ts named-calls queueImpulse`).

`src/modules/system/Momentum.ts:69` and `:121` default
`currentTimestampMilliseconds` to `performance.now()`. All 14 production
callers pass two arguments, so the ambient read fires every time. Two
consequences:

1. The app holds two clocks (`Clock` = wall `Date.now`, Momentum = monotonic
   `performance.now`). A single `now()` clock seam would force Momentum to
   suppress monotonicity — the interface-honesty tell on the smallest seam.
2. Scroll physics are not reproducible from their arguments.

The repair is NOT a getter: make the parameter required and pass the frame
timestamp the callers already hold. `UndoStore` has the shape at
`src/modules/storage/UndoStore.ts:45`. The physics become fully pure and a
second clock leaves the app. Scale parity binds (scroll path): fingerprints
identical before and after at both scales.

## Sources

- `.invar/tasks/completed/222-provider-seam-analysis-and-convention/` — report
  Bycatch item 1 and [analysis-222-classification.md](../../completed/222-provider-seam-analysis-and-convention/analysis-222-classification.md).
