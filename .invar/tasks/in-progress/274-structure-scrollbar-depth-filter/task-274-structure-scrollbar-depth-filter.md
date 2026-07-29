# 274 — structure pane: scrollbar, per-file depth (fold internals by default), filter

State: IN-PROGRESS
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: USER-DIRECTED (2026-07-29 09:0x, verbatim)

## Outline

User refinements to the structure pane (#35/#238's citizen), three arms on
the one pane generator:

1. **Scrollbar + good scrolling.** "Structure should have scrollbars like
   everything else." The scrollbar projection pattern exists (editor,
   tasks-dashboard pane both project one) — same seam, same look, wheel +
   drag + keyboard parity. If the structure pane's row list shares a
   generator with the tasks pane's windowed renderer, distill rather than
   copy (seam at the shared generator).

2. **Depth level, per file.** Default: function INTERNALS folded — one
   level folded, i.e. top-level symbols and their direct children visible,
   function bodies' inner symbols collapsed. User: "you should be able to
   set level of depth per file." So: a default depth policy (setting),
   plus per-file override (persisted per workspace or session — argue the
   scope), plus fold/unfold interaction on rows (the code-folding
   vocabulary: same glyphs/gestures as editor folds where sensible).

3. **Filter.** Type-to-filter within the pane (the Quick Open matcher is
   the precedent — reuse its match/highlight generator if importable, do
   not re-implement scoring). Filter narrows rows, keeps jump-on-Enter,
   Escape clears.

All three hold under real defaults (structure default-ON right dock) at
both scales (the 100k-line fixture suppresses language structure by
design — use the markdown TOC and the smaller code fixtures for depth
arms; say so). Positive controls per arm.

## Invariants in scope

- `structure.invariants.md` (the citizen + answers-or-declines records);
  the scrollbar projection record; the settings records for the new keys;
  ui.invariants.md right-dock records.

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- User message 2026-07-29 09:0x (verbatim in session); #35/#238 reports.
