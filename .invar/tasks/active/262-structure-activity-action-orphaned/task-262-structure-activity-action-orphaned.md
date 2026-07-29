# 262 — StructurePaneContent.activityAction has no consumer since the right-dock move

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: architecture-hygiene

## Outline

Bycatch of #238: the structure pane left the primary dock, and the
activity bar serves the primary dock only, so
`StructurePaneContent.activityAction` ("view.showStructure") now has no
consumer. A harmless field today; dead affordances are how rot starts
(#243/#253's whole campaign was cleaning the last generation of these).

Delete it — after checking both polarities: grep AND AST for consumers
(the #220 lesson: a member can be consumed reflectively via the manifest);
confirm the interface it implements marks the member optional or remove it
from the interface if the structure pane was its only implementor. While
there: the report's transient boot headline ("No file is open." for ~30ms
before the first debounced refresh) is NOT to be fixed here — note only if
a smoke starts asserting boot frames.

## Invariants in scope

- [structure.invariants.md](../../../../src/modules/structure/structure.invariants.md) — the citizen record if it names the activity
  action; the pane interface records.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- `report-238-...md`, Bycatch item 6.
