# 290 — the corner belongs to the vertical bar: full height; horizontal ends at its edge

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium
Priority: USER-DIRECTED (2026-07-29 13:0x, verbatim)
Sequencing: AFTER #289 lands — same shared-painter seam; avoid a two-writer collision.

## Outline

User: today the VERTICAL scrollbar ends above the horizontal bar's row;
it should be reversed — the vertical bar runs the full pane height to
the window/pane bottom, and the HORIZONTAL bar ends where the vertical
bar's column begins (the corner cell belongs to the vertical bar).

Fix at the shared geometry generator (the extents SolidThumbScrollBar's
consumers lay out — ScrollbarSync and, by then, #289's preview bars),
ONCE, so every pane with both bars agrees. Thumb math must use the new
track lengths (a full-height track changes the vertical ratio; the
gated continuous-drag assertions must stay green with the new mapping).
Update the "One scrollbar painter gives each axis equal visual weight"
record's geometry component; both themes; positive control: assert the
corner cell paints vertical-bar content and the horizontal track's last
column is vertical-track minus one — break the layout, red.

## Invariants in scope

- The scrollbar records (#282's painter record — extend its geometry);
  ScrollbarSync consumers; the gated ScrollbarThumbDrag contract.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## Sources

- User message 2026-07-29 13:0x; [#282](../../completed/282-scrollbar-drag-broken-and-horizontal-thickness/task-282-scrollbar-drag-broken-and-horizontal-thickness.md).
