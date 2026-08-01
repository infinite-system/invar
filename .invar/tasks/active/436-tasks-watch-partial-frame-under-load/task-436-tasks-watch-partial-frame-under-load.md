# Task #436 — real tasks:watch commits a partial frame under gate load

Priority: flake-evidence
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
State: ACTIVE

## What

`smoke: terminal harness` fails inside the full merge gate (66 parallel
PTY jobs) at:
`real tasks:watch produced no blank or partial completed frame (16 outer frames)`
(assertion near line 1280 of `scripts/harness/smoke-terminal-harness.ts`).
The same smoke passes solo, in both host gate-registry states (missing
registry and a planted running gate).

## Evidence (2026-08-01, conductor A/B at full gate concurrency)

- `/tmp/gate-433-combined-1785580001.log` — #433 round-1 tree: step PASSED.
- `/tmp/gate-433-r3-1785581587.log` — #433 round-3 tree: FAILED.
- `/tmp/gate-433-r3b-1785581962.log` — round-3 tree, all builders holding: FAILED.
- `/tmp/gate-main-baseline-1785582277.log` — MAIN, builders holding: FAILED.
  Failure detail: `/tmp/merge-gate-failures.56f877be132c8fa5.2965340/smoke-terminal-harness-.log`.

Main fails without any #433 change: the defect is pre-existing and
load-marginal (one green in four full-pool runs).

## Wanted

Separate product from instrument: does the app truly commit a blank or
partial completed frame for the embedded tasks:watch terminal under
load, or does the observation window mis-attribute frames? Deliberate
contention is the reproduction instrument, per doctrine: never widen a
threshold to clear it. If the product commits partial frames, fix the
frame commit path. If the instrument mis-reads, fix the instrument and
plant a true partial frame as the positive control.
