# 545 — structure scrollbar diagnostic wait

Priority: flake-evidence
State: ACTIVE
Engine: claude
Environment: linux
Model: fable-5
Effort: low

## In plain words

The plugin-manifest drive sometimes times out waiting for the Structure
pane's scrollbar diagnostics under gate load. Two sightings held; the
third dispatches this task (the #531 evidence-hold pattern).

## Evidence

1. 2026-08-06 (#537 bycatch): full behavioral pass timed out at
   smoke-plugin-manifest-harness.ts:74 (15s wait for Structure scrollbar
   diagnostic geometry); second run green in 10.3s. Did not reproduce.
2. 2026-08-11 (gate-542, contention tier, non-blocking):
   /tmp/merge-gate-failures.6085f6c39f70467b.1521848/ — same wait,
   awaitRightDockScrollbarDiagnostic at :74.

## Outline (when dispatched)

The #529/#531 method: loop the step solo with an autopsy probe (which
clock does each side read — screen / hit grid / status), reproduce
under 3-4x contention, fix wait or publisher, never the timeout.
