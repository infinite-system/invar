# Brief #387 round 1 — slim vertical splitter + left pad cell

## Goal

Two user requests on the splitter chrome, plus a conditional sweep:

1. The horizontal bottom splitter's slim centered glyph (U+2501, landed in
   #345) is liked. Try the same slim treatment on the VERTICAL splitters —
   the vertical one is currently fatter. Candidate: U+2503 heavy vertical
   (the axis sibling). DRIVE it: open the app in the harness, look at the
   right-dock and any other vertical splitter, compare weight against the
   horizontal one. If it reads well (equal visual weight across axes,
   clearly visible, not chunky), adopt it.
2. USER SCOPE WIDENING: if the slim vertical works, apply the slim pair to
   EVERY splitter surface in the app. Census the splitter paint sites first
   (grep for the current glyphs and the separator/splitter painters — do
   not trust memory); if sites duplicate paint logic, prefer one shared
   painter.
3. The bottom horizontal splitter gets ONE blank cell of padding before it
   starts on the LEFT side. This also creates a 1-cell gap between the
   go-to-line icon and the splitter.

## Method — inner loop is driving

Reproduce the current look by driving first. Iterate glyph/padding ->
drive -> look. Write contracts only after the look is right: count-based
assertions (pad cell blank at the splitter's left origin; splitter glyph
cell content; hit-test grab still works at the pad cell edge and full
former extent). One verification pass at the end.

## Hard constraints

- Paint changes only — the DRAG HIT AREA must not shrink. Renderer and
  hit-tester share one geometry; the pad cell changes where paint begins,
  not where grab works.
- If the slim vertical does NOT read well, say so with a captured frame and
  keep the current vertical; parts 2 collapses, part 3 still lands.
- Commit BEFORE writing READY; the report header carries the real commit
  hash and GATE_EXIT read from the hook output. Report goes to the MAIN
  checkout task folder: the main checkout is at `/home/parallels/dev/invar`;
  write the report into its in-progress task folder for this task, named
  report dash 387 dash the task slug, with the md extension.

## Invariants in scope

- "Splitter paint and hit testing share one geometry" — [src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) — the pad cell and glyph swap must not split paint from hit geometry.
- The splitter visual-weight record refined by #345 (locate it in [src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) by grepping for the U+2501 adoption) — the vertical adoption refines it again; propose wording.
- "Layout slots derive from one configuration" — [src/modules/layout/layout.invariants.md](../../../../src/modules/layout/layout.invariants.md) — the pad must not become a second layout quantity derived outside resolve.
- "The right dock stays a bounded minority of the row" — [src/modules/layout/layout.invariants.md](../../../../src/modules/layout/layout.invariants.md) — landed minutes ago (#383); your vertical splitter work touches the same chrome; do not disturb the live maximum wiring.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s bycatch taxonomy (runtime defects, invariant
violations in function, comment drift, distillation possibilities,
generator drift, plain nonsense). Carry a Bycatch section even when it
reads None observed.
