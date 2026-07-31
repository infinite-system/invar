# Task 431 — remove the dead panelAlignment setting and zombie remainder renderables

Priority: architecture-hygiene
State: ACTIVE
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## Source

#430 bycatch (codex, 2026-07-31), each reproduced by the four-case
probe:

1. panelAlignment remains in Settings and presets but
   LayoutModel.resolve no longer reads it — center and right produce
   identical panel edges. Remove the capability, not just the misuse
   (settings surface, presets, records), or re-justify it.
2. primaryDockRemainder / rightDockRemainder now have zero area in
   every layout, but RootView still mounts their renderables. Delete
   the slots and renderables; prove with a structural post-check
   (grep zero references).

Coordinate with #430's landed record wording in layout.invariants.md.
