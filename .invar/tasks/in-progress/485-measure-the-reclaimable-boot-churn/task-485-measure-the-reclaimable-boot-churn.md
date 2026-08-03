# Task 485 — measure the reclaimable boot churn

Priority: user-directed
State: IN-PROGRESS
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## The user's call (2026-08-03): "measure #1"

Before anyone converts a smoke to shared-app-per-file, measure how much
boot churn is actually reclaimable. #484 proved some boots ARE the coverage
(restart persistence); this task classifies every runtime boot and sums the
rest.

## The work — MEASUREMENT ONLY, no conversions

1. Use #484's landed instruments
   (.invar/tasks/completed/484-per-file-smoke-reuse-experiment/:
   the runtime boot counter preload and the source census).
2. Count runtime boots per live smoke file (run each solo with the counter).
3. CLASSIFY each boot by reading the scenario that causes it:
   - SEMANTIC: the boot itself is the assertion or a hard requirement —
     restart persistence, fresh-home isolation the scenario depends on,
     capability re-negotiation, geometry set at construction that the
     scenario's assertions require.
   - RECLAIMABLE: a helper rerun where a shared app plus the graph-verified
     reset would prove the same claims.
   When genuinely uncertain, classify SEMANTIC and say so — an overclaimed
   reclaimable is worse than a missed one.
4. Report table: file | runtime boots | semantic | reclaimable | one-line
   reason for the reclaimable ones. Totals: reclaimable boots per full gate,
   as a percent of all boots, and as MB-boots of churn (x236MB).

## Verification

The counter's own positive control (a file with a known boot count); the
classification of the #484-named files must match its findings (pixel
preview: 4 semantic restart boots). NO merge-gate; SKIP_GATE=1 for the
report commit. The report ends with the numbers — the conversion decision
stays with the user.
