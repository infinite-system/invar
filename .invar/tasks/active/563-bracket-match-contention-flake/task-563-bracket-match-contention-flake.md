# 563 — bracket match contention flake

Priority: flake-evidence
State: ACTIVE
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## In plain words

The bracket-match check timed out under a full gate run but passes
alone. Same family as #554: a wait that only fails when the machine is
busy hides either a timing bug in the check or a real bug needing load.

## Evidence (2026-08-14)

- gate-562 (serial, branch adds only iv-harness contributors + shapes
  regen — no app/smoke code): FAIL "Timed out waiting for grid
  condition: markerForeground(candidate, '}') ===
  baselineCloserForeground" in smoke-bracket-match-harness.ts. Log:
  /tmp/merge-gate-failures.a0d669ddb282c0d5.1096724.
- Solo in the same worktree: exit 0, 0 FAILs. First recorded sighting.

## The bar

Wait-discipline census: is the wait a condition that can be
false-then-true, or does load perturb what it reads? Drive under
deliberate contention; fix the wait or the product; never widen a
timeout.

## Bycatch expected

Report per AGENTS.md taxonomy, even when None observed.
