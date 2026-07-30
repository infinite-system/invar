# #373 — a one-cell hole in the bottom border of dual-scrollbar boxes

State: ACTIVE
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Bycatch from #345 (user-visible, reproduced 3x, pre-existing)

Reproduce: bun run drive --geometry 100x30 --open
src/modules/ui/SolidThumbScrollBar.ts --key Control+j
Row 15: both the editor and structure boxes show a BLANK cell between the
last horizontal border glyph and the closing rounded corner. Identical
with the pre-#345 glyph, so not the glyph swap. Builder hypothesis
(labelled hypothesis, not diagnosis): the two-axis corner reservation,
since it appears at the bottom-right of boxes carrying BOTH scrollbars.

## Work

Reproduce first; separate the corner-reservation hypothesis from rivals
(border walk off-by-one; scrollbar track length) by measurement, then fix
and assert the full border run in an existing smoke.
