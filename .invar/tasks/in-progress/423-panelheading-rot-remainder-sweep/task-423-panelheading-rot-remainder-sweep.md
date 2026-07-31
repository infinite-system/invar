# Task 423 — sweep the last PanelHeading-era naming out of the contracts

Priority: architecture-hygiene
State: IN-PROGRESS
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## Source

#422 bycatch (codex, 2026-07-31), each reproduced once by source
inspection:

1. "The glyph ladder degrades icons single-cell and legible"
   ([theme.invariants.md](../../../../src/modules/theme/theme.invariants.md))
   names $interfaceGlyphVocabularies in Mechanism and Evidence; the
   current symbol is INTERFACE_GLYPH_VOCABULARIES.
2. "The panel contents list mirrors open content"
   ([ui.invariants.md](../../../../src/modules/ui/ui.invariants.md))
   names "panel-heading close" and "panel headings" in Mechanism and
   Generates; PanelHeading was removed at 9ac75e4b.

## Work

Repoint both records. Then CLOSE THE CLASS: case-insensitive grep for
panel-heading, PanelHeading, and interfaceGlyphVocabularies across all
*.invariants.md and *.lattice.md and repair every remaining mention in
the same change — this is the third task in a chain of pairs; the
sweep ends the chain. Checker --all and --refs clean after.
