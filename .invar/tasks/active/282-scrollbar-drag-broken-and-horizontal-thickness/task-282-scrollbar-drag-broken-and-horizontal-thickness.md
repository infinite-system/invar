# 282 — BUG: scrollbar thumb dragging broke (both axes); horizontal bar too thick

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: USER-REPORTED BUG (2026-07-29 10:0x; RECORDED — dispatch first when the queue reopens)

## Outline

User report, verbatim-derived, observed live on current main (post-#274):

1. **Dragging the scrollbar thumb is BROKEN — both horizontal and
   vertical.** This is a REGRESSION the user noticed today; #274 touched
   the shared SolidThumbScrollBar seam (right-dock projection, track
   clicks, ScrollbarSync ownership per #280's drift note) and #259
   changed pointer-focus ownership — both are suspects, but REPRODUCE
   FIRST on current main, then bisect: main vs pre-#274 vs pre-#259 tips
   for the drag gesture specifically (press on thumb, move, release).
   Track clicks reportedly still work; the DRAG path is what broke.
2. **The lower (horizontal) scrollbar should be THINNER** — one cell
   high reads too thick today? Compare with the vertical bar's width and
   the editor chrome; make the horizontal bar visually thinner per the
   user's ask (whatever "thinner" maps to in cells/glyphs — half-block
   glyphs are the likely vocabulary; argue the choice, both themes).

Drag verification must be DRIVEN: press-move-release through the PTY
driver with the mouse protocol, asserting scrollTop/scrollLeft track the
drag continuously (not just endpoint) — both axes, editor and right-dock
bars. Positive control: break the drag handler, watch the assertion red.
Check the first-click warm-up family (#260) does not mask the repro.

## Invariants in scope

- The scrollbar records (SolidThumbScrollBar, ScrollbarSync); #259's
  one-focus-owner record; ui.invariants.md pointer records.

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- User message 2026-07-29 10:0x; #274/#259 landed diffs; #280 (the
  ScrollbarSync comment drift — same seam).
