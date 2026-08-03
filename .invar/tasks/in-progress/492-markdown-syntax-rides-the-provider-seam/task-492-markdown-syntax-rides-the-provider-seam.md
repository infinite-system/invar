# Task 492 — markdown syntax rides the provider seam like vue

Priority: architecture-hygiene
Engine: codex
Environment: any
Model: 5.6-sol
Effort: medium
State: IN-PROGRESS

## In plain words

The syntax module hardwires a builtin markdown tokenizer, LangId
union member, and extension map, while the vue plugin already ships
its syntax through the document-syntax-source provider. Make markdown
ride the same seam, so the asymmetry (and the hardwiring) disappears.

## Scope (census row 8 — [report](../../completed/488-core-to-plugin-coupling-census/report-488-core-to-plugin-coupling-census.md))

Highlighter.ts + LanguageRegistry.ts markdown sites (4). VuePlugin is
the model. Re-run the 488 census scripts as the measure.
