# Task #434 — the no-registry gate message can never render

Priority: architecture-hygiene
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
State: ACTIVE

## What

`TasksDashboardPaneRenderer.ts` formats `Gate: no fleet gate registry.`
only when a gate row has a null glance. `TasksDashboardOverview.ts`
creates a gate row only when the glance is NOT null. The branch cannot
paint. Bycatch from #433 round 3 (builder evidence: opened Tasks at
150 by 40 with no fixture registry, message absent twice).

## Wanted

Decide the true design first: either the no-registry state deserves a
visible row (then the overview creates one and the smoke drives it), or
it does not (then the dead renderer branch is deleted). Remove the
capability, not the misuse. Whichever way, the tasks-dashboard smoke
locks the chosen end state through the registry fixture seam that #433
built (INVAR_FLEET_GATE_REGISTRY).

## Evidence

[#433 round 3 report](../../in-progress/433-tasks-dashboard-auto-reveal-priced-out/report-433-3-2-isolate-gate-registry.md), Bycatch section.
