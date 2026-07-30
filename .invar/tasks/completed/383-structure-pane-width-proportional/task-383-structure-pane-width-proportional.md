# #383 — the right panel is proportional; the editor is the prominent actor

State: COMPLETED — 97b0a60f — right panel proportional: editor stays prominent (two-bound clamp at the layout generator)
Priority: user-directed
Engine: claude
Environment: linux
Model: opus-5
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

## Widened scope (user, same conversation): the whole right panel

The proportional rule applies HOLISTICALLY to the right panel, not just
the structure pane — whatever content occupies the right side (structure,
pane list, any future right-panel occupant) obeys the same law: the
editor is the prominent actor; the right panel takes a bounded
proportion, never exceeding the editor's share, at every geometry. One
generator for the rule (the right-panel layout), not per-pane copies —
fix it at the panel level so every current and future occupant inherits
it.
