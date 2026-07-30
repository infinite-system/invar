# #372 — the separator painter cannot see the ASCII glyph tier

State: ACTIVE
Priority: architecture-hygiene
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Bycatch from #345 (contract gap, pre-existing)

SeparatorAppearance.paint takes a buffer and a colour — no Theme access —
so settings.glyphMode='ascii' cannot reach it; every glyph it can paint
(the old lower-half block, the new heavy line, light line) is non-ASCII.
Every OTHER glyph tiers through theme.glyphLevel; this painter is an
undeclared exception. The panel-chrome smoke's "repeat every heading
interaction at the ascii tier" section passes while never checking the
separator glyph — the ascii-tier claim has a hole exactly here.

## Work

Plumb glyphLevel into the Static painter (seam change; two consumers —
SeparatorAppearance + SolidThumbScrollBar's shared marks), pick ASCII
fallbacks (e.g. '-' / '='), extend the ascii-tier smoke section to assert
the separator row. Shared seam changes verify every consumer.
