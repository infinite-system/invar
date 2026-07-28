# 200 — p50 8-12 ms against a 4.928 ms reviewed baseline in 11 of 11 gates

State: TODO
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default

## Outline

Warned in 11 of 11 gates, report-only, so it never blocks. Same metric as the earlier latency
investigation, now 1.6–2.4× its RE-REVIEWED baseline of 4.928 ms.

Two things make it worth its own task rather than a note:

1. **The number moved again.** The earlier investigation re-reviewed the baseline upward after
   establishing an intrinsic cost. The distribution is now above that reviewed figure, consistently, in
   every run — so either a new contributor landed after it, or the re-review was already generous.
2. **The instrument cannot stop it.** The check is report-only, so eleven consecutive warnings produced
   eleven ALL-PASS gates. This is precisely what the earlier task's SECOND HALF was meant to close: it
   added a trailing-history trend comparison, deliberately report-only because a blocking rule was
   uncalibrated at the time. That was right then. Eleven firings without consequence is the calibration
   data the blocking decision was waiting for.

**Load caveat, stated honestly:** these were quiet-locked runs with zero degraded lock entries, so
contention is not available as an explanation — but they were full-gate runs with a live pool.

Order of work: measure standalone under the quiet lock with load average beside every number. If 8–12 ms
does NOT reproduce standalone, the finding is that the gate's own pool inflates the metric it reports —
its own defect and a different repair. If it does reproduce, bisect from the baseline commit forward; do
not reason structurally first, since four structural diagnoses were overturned by measurement on this
metric before. Then decide the instrument's status with the eleven-run evidence in hand.

Widening the FAIL threshold is forbidden. The permitted outcomes are a defect, a declared intrinsic cost
with the baseline re-reviewed UPWARD in writing, or a ranked ladder of accumulating contributors.

## Sources

- `brief-200-1-input-byte-latency-above-baseline.md`
