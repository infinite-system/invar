# #345 — horizontal panel separator glyph sits vertically centered

State: ACTIVE
Priority: user-directed
Engine: claude
Environment: linux
Model: opus-5
Effort: medium

## The request (user, 2026-07-30)

The thinner bottom-panel separator is better, but its block is not in the
vertical middle of its row. Center it if a glyph allows.

## Conductor triage (done)

The painter is SeparatorAppearance.paint
(src/modules/ui/SeparatorAppearance.ts:40): horizontal separators draw the
lower-half block U+2584 on the last row — bottom-aligned by construction.
Unicode has NO centered half-height block (block elements fill only from
top or bottom). Centered candidates: heavy horizontal U+2501 (continuous,
about a third the thickness) or light horizontal U+2500 (thin). Recommended:
U+2501 heavy line.

## The change

1. Swap the horizontal glyph to U+2501; keep alpha-blended transparent
   background so the line overlays the theme surface.
2. The file carries the record "One scrollbar painter gives each axis equal
   visual weight" (src/modules/ui/ui.invariants.md) whose reasoning cites
   the lower-half choice. This is a deliberate RE-CHOICE of a chosen
   invariant: update the record's wording in the same diff (propose in the
   report; the landing confirms it).
3. Check both themes and the ASCII glyph tier (glyphMode fallback needs an
   ASCII stand-in, likely '-').
4. Drive it: panel open, separator row screenshot both before/after via
   FrameProbe cells; assert the glyph cell content changed and hit-testing
   (splitter drag) is untouched — paint and hit share one geometry record.
