# Task 484 — per-file smoke reuse: the churn experiment

Priority: user-directed
State: ACTIVE — dispatch AFTER #483 lands (same smoke-file surface)
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## The user's axis (2026-08-03): churn, not latency

Measured: each app instance is 236MB RSS (+~89MB driver); a gate runs
150-300 boot/teardown cycles, each allocating, JIT-warming, and GC-ing that
process. Peak memory is workers x ~325MB and reuse does NOT change it
(scenarios are sequential) — but the churn CPU competes with drive work and
is what makes raising the worker count risky. Hypothesis: remove the churn
in the heaviest files and the same machine runs 8-9 workers instead of 6.

## The experiment (measure, then decide — not a rollout)

1. Pick the five heaviest multi-boot smoke files (count runtime boots).
2. Convert them to ONE app per FILE: scenarios share the instance with a
   VERIFIED reset between (base-state fingerprint through the graph — open
   buffers, panel spaces, subprocess pids, overlay state; mismatch ->
   recycle to a fresh boot, never run on a dirty app).
3. Measure honestly: gate wall-clock and flake rate, 3 runs each at
   6 workers before/after, then 9 workers after. Paired comparison.
4. Report the numbers; the ROLLOUT decision is the user's, made on data.

## Verification

The five files ALL-PASS solo and under the gate; the fingerprint reset
proven both arms (a planted dirty state recycles; a clean reset passes);
the measurement table in the report.
