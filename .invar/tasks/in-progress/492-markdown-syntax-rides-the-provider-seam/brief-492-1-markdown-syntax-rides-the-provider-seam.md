# Brief 492-1 — markdown syntax rides the provider seam like vue

## In plain words

The syntax module hardwires a markdown tokenizer, LangId member, and
extension map, while the vue plugin ships its syntax through the
document-syntax-source provider. Make markdown ride the same seam.

## Reproduce by DRIVING first

Drive a markdown file open: highlighting, preview, fences. Screen
must render the same after the move. VuePlugin is the working model —
read how it registers 'document-syntax-source' first.

## Your map

[The #488 census report](../../completed/488-core-to-plugin-coupling-census/report-488-core-to-plugin-coupling-census.md)
row 8: Highlighter.ts + LanguageRegistry.ts markdown sites (builtin
tokenizer, LangId union member, extension map). The markdown plugin
absorbs them through the provider seam. Re-run
census-488-vocabulary.ts; markdown's syntax sites must reach zero.
HoverCard/ThemeIcons language-id maps are OUT of scope (row 11).

## Invariants in scope

- Provider rendezvous is host carried ([src/modules/plugins/plugins.invariants.md](../../../../src/modules/plugins/plugins.invariants.md)).
- Syntax/markdown records in their modules' *.invariants.md — check
  and answer record by record; name misses.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy even when None observed.

## Instrument feedback

EASY / CONFUSING / MISSING; asks get converted.

## Rules

Never run scripts/merge-gate.sh. Commit on your branch; READY report
in the task folder. Locking smoke at the END (markdown highlight via
the provider seam).

Commit note: the pre-commit hook auto-runs the full gate; use the
documented SKIP_GATE=1 bypass on your branch commits (the conductor
gates the combined tree at landing).
