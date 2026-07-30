# #386 — every theme-owned glyph vanishes at 120x36

State: IN-PROGRESS
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Bycatch from #375 (reproduced twice; likely the user's invisible-icon generator)

At 120x36 in the 500-task drive, ALL theme-owned glyphs vanished (cycle,
file-tree, status, task action glyphs); counts and projection stayed
correct. Same glyphs paint fine at 150x40. Unicode AND ascii both
affected. Pre-existing shared narrow-terminal paint path — #375 did not
touch it. Suspect: the glyph ladder / theme glyph resolution keyed off
geometry somewhere it should not be.

This is very likely the deeper generator of the user's original
invisible-attach-icon report (his terminal runs narrower than 150 cols).

## Work

Reproduce at 120x36 vs 150x40; find where geometry gates theme glyph
resolution; fix; assert glyph cells non-blank at BOTH geometries in the
dashboard smoke. Check the theme.invariants.md glyph-ladder record —
refine it if it never stated geometry-independence.
