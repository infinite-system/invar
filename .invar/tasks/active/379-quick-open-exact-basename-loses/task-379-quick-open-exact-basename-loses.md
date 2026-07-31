# #379 — quick open ranks a sibling above an exact basename match

State: ACTIVE
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## Bycatch from #347 (reproduced every census run)

Typing the FULL basename report-299-structure-filter-uses-shared-input-
generator.md leaves task-299-...md selected first (2 matches). An exact-
basename query losing to a sibling is a scoring defect (suspect, not
diagnosed — #347's census works around it by stepping selection).

## Work

Reproduce; read the scorer; make exact-basename matches rank first; add
the assertion to the quickopen smoke.
