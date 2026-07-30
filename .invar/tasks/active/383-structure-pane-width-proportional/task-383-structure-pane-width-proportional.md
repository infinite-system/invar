# #383 — the structure pane opens too wide; the editor is the prominent actor

State: ACTIVE
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## The report (user, 2026-07-30 ~08:1x, verbatim intent)

On small screens the structure pane opens WIDER than the editor. Make the
structure pane proportional and less prominent — "the editor should be
the prominent actor."

## The shape

1. Find where the structure pane's initial width comes from (fixed cells?
   content-derived?). On small terminals a fixed width can exceed the
   editor's remaining share — that inversion is the defect.
2. Make the width PROPORTIONAL with a sane bound: e.g. structure takes at
   most ~25-30% of the row (design call — pick and state it), never more
   than the editor's share; a minimum for usability; clamp on terminal
   resize too.
3. Drive at several geometries (wide, 100x30, 80x24): assert editor width
   > structure width at every size once both are open. User-resize (drag)
   still wins within bounds — respect an explicit user drag over the
   default proportion (state how persistence interacts).

## Invariants in scope (candidates)

- Layout/scroll records: "A scrollable pane height is an input not an
  output" has a width sibling flavor here — pane width should be a layout
  INPUT, not content-derived output. Check structure module records
  ("The structure pane shows itself for a supported document" etc.) and
  layout contracts; propose refinements if the proportion rule deserves a
  record.
