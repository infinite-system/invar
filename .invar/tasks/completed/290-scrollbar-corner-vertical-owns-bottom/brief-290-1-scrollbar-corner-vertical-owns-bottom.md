# Brief — #290: the corner belongs to the vertical bar; horizontal matches its colors

Read first: [task-290-scrollbar-corner-vertical-owns-bottom.md](task-290-scrollbar-corner-vertical-owns-bottom.md)
— USER-DIRECTED, verbatim-derived; the record governs. #289 has landed,
so the preview's both-axis bars are on main — your fix covers them too.

Two arms, one generator:

1. **Corner precedence.** The vertical bar runs the FULL pane height to
   the bottom; the horizontal bar ends where the vertical bar's column
   begins (the corner cell is the vertical bar's). Fix at the shared
   geometry generator the SolidThumbScrollBar consumers lay out — once,
   so editor, preview, and every two-bar pane agree. Thumb math must use
   the new track lengths (full-height track changes the vertical ratio);
   the gated continuous-drag assertions stay green under the new
   mapping. Positive control: assert the corner cell paints
   vertical-bar content and the horizontal track's last column is
   vertical-track-minus-one — break the layout, red.
2. **Color parity.** The horizontal thumb reads accent-blue today; it
   must match the vertical's grey/white — one color pair per theme,
   BOTH axes, chosen at the shared painter. #284 (theme captured at
   construction) has NOT landed: do not duplicate its fix, but your
   assertion must hold under a live theme switch — if that exposes
   #284's defect, quote it and report; do not fix #284's seam here.

Both themes, both scales, real defaults.

## Invariants in scope

[One scrollbar painter gives each axis equal visual weight](../../../../src/modules/ui/ui.invariants.md#one-scrollbar-painter-gives-each-axis-equal-visual-weight)
(extend its geometry component) and the track-derivation record in
[ui.invariants.md](../../../../src/modules/ui/ui.invariants.md);
[#284](../../active/284-scrollbar-theme-captured-at-construction/task-284-scrollbar-theme-captured-at-construction.md)
coordination note above.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report: both arms driven with positive controls at both scales and
themes, drag assertions green under the new mapping, the theme-switch
observation for #284 quoted if seen, green `bun test` + scrollbar/editor
smokes. The conductor gates at landing.
