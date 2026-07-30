# #359 — panel-split smoke intermittently times out on agent,terminal order

State: ACTIVE
Priority: flake-evidence
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Evidence (three sightings, 2026-07-30, one night)

Assertion every time: Timed out waiting for status condition:
status.panelContentOrder.join(',') === 'agent,terminal' &&
status.panelCellIds.join(',') === 'agent,terminal'
(scripts/harness/smoke-panel-split-harness.ts)

1. #351 final gate: first attempt timed out, quiet retry green (builder
   report, not reproduced twice there).
2. #350 gate (RED run): 1 pass 3 fail of 4 WITH the media diff; 3 pass
   1 fail of 4 on the STASHED base tree — fails on base, intermittent,
   unrelated to the media change.
3. #350 builder's standalone re-runs confirm the rate varies with load.

## Reading

Starvation-class under gate pool load; pre-existing on main. Not the #214
panel-chrome class (different smoke, different assertion).

## Work

A wait must be a condition: find why panelContentOrder/panelCellIds can
publish late or in another order under load, and make the wait observe the
real publisher (or fix the ordering). Do not widen the timeout.
