# #371 — git-watch smoke passes only on retry under gate load

State: COMPLETED — 70ec2e7f — git-watch smoke sequences its keys; race dead
Priority: flake-evidence
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Evidence (two sightings, 2026-07-30, same night)

1. #344 gate (green run): RETRY TALLY named smoke: git-watch harness —
   passed only on retry.
2. #343 gate (green run): git-watch one starvation-class timeout, passed
   its automatic clean retry, visible in the tally.

## Reading

Starvation family under pool load, same shape as #359. Two sightings in
one night across unrelated diffs.

## Work

A wait must be a condition: find the git-watch wait that load can starve
and bind it to its real publisher. Do not widen timeouts.

## Sighting 2026-08-03 (gate-487 round 2, contention tier)

FAIL contention: git-watch harness; log preserved at
/tmp/merge-gate-failures.736e0d6511a85855.148088/. Non-blocking tier;
gate exited 0. Counts toward this task's recurrence evidence.
