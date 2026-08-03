# Task 493 — ast-query gains imports-of and string-literal census modes

Priority: architecture-hygiene
Engine: claude
Environment: linux
Model: fable-5
Effort: low
State: IN-PROGRESS

## In plain words

The #488 builder had to write two bespoke AST walkers because
scripts/ast-query.ts has no "who imports from module X" mode and no
string-literal census mode. Both are one-predicate additions. Add
them, self-tested, and note them in project.tools.md.

## Seed (from the 488 folder)

census-488-imports.ts and census-488-vocabulary.ts show the exact
walker shapes, including the both-arms controls.
