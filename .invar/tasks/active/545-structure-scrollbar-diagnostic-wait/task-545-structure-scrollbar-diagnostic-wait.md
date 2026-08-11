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

## Separate concern noted (2026-08-11): smoke-scrollbars-harness recurring

Distinct from THIS task's structure-pane diagnostic: smoke-scrollbars-harness.ts
fired contention repeatedly on 2026-08-11 gates (#354 r3/r5, #547) AFTER #531
landed a fix for that same smoke. A landed fix + same smoke re-flaking =
either a different wait in it or a reopened concern. Worth its OWN task with
the #529 three-clocks method, not folded here. Log dirs: gate-547
(8c7670443f7abd28.2668310), gate-354 windows.
