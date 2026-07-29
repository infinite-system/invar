# 259 — a right-dock click can leave BOTH docks focused

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: user-directed

## Outline

Bycatch of #238, reproducible, host-side: `RootView.ts:399-407` — the
right-dock click handlers blur `panelHost` but not `primaryDockHost`. A
right-dock click while the primary dock is focused leaves BOTH docks
focused, and the primary dock wins the key ladder. This is the exact
double-focus shape that broke Enter in #238's manifest smoke (there fixed
on the command path; the CLICK path still has it).

Reproduce first by driving: focus Extensions (primary), click a structure
row (right dock), press Enter — observe where it routes. Fix at the
generator: whatever "focus this dock" means, it must be one operation that
blurs the others (a focus-set with one owner, not N boolean blurs scattered
per call site). Check the LEFT/primary click handlers for the mirror gap
while there. Lock with a driven assertion on the double-focus scenario.

## Invariants in scope

- `src/modules/ui/ui.invariants.md` — the right-dock toggle record #238
  extended, and any record naming dock focus; if no record states "at most
  one dock holds focus", that gap is part of this task.

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- `report-238-...md`, Bycatch item 3.
