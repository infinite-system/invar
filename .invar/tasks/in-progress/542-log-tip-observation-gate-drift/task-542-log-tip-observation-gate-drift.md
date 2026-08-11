# 542 — log tip observation gate drift

Priority: verification-integrity
State: IN-PROGRESS
Engine: claude
Environment: linux
Model: fable-5
Effort: medium

## In plain words

The git contract says a hidden git panel never probes the repository,
but the code lost that gate: with a non-checked-out branch selected, a
hidden panel runs one git subprocess every five seconds. Restore the
gate and fix the contract's stale state name.

## Source of truth

tmp/TASK-log-tip-observation-gate-drift.md (ivue-side Fable's census
finding, 2026-08-11): the record references `sidebarView` which no
longer exists anywhere in src; GitWorkspace.reconcileLogTip:478-513 has
no observation gate; blast radius is narrow (leak only when a
non-checked-out branch is selected).

## Conductor's resolution pick

Resolution 1 (restore the gate): "cost tracks the actively observed
set" is a project invariant — the record was right and the code
drifted. The contract's wording updates to the current observation
state name in the same change (a refines with evidence, declared in
the report).

## Note for the morning queue (not this task)

A mechanical checker arm for "contract cites an identifier absent from
src" — the invariants audit does this by judgment; a grep arm in
check_invariants.mjs could do it mechanically.
