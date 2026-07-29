# 273 — tasks pane follow-ups: fleet extras, wall-display auto-show

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium
Priority: user-roadmap-extension

## Outline

Named follow-ups from #235's report, deferred at the seam:

1. Fleet extras in the pane — gate glance (reads /tmp/fleet-watch-gates),
   ±line deltas, exploring/building phase — once those readers grow
   workspace-anchored forms (today they anchor to the Invar repo, not the
   opened workspace; that anchoring decision is the real work).
2. `tasksDashboardShowByDefault` for the wall-display case, symmetric with
   `structureShowByDefault` (#238's pattern).

The user's cycling-wall-display intent (#235 outline) is the driver for
both. Do not re-implement any reader; the seam law from
tasks-dashboard.invariants.md governs.

## Invariants in scope

- `tasks-dashboard.invariants.md`; the settings records for the new key;
  fleet-watch's registry format if the glance ports.

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- `report-235-...md`, "Deliberate decisions" + follow-ups 1-2.
