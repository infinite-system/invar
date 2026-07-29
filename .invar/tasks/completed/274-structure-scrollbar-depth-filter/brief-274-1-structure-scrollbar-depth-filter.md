# Brief — #274: structure pane — scrollbar, per-file depth, filter (user-directed)

Read first: `.invar/tasks/in-progress/274-structure-scrollbar-depth-filter/task-274-*.md`
— the user's three asks, verbatim-derived. All three arms ride the one
structure pane generator; keep them as one coherent change.

1. Scrollbar + smooth scrolling — project the same scrollbar the editor
   and tasks pane project; wheel/drag/keyboard parity. If the row-list
   windowing wants the tasks pane's renderer, DISTILL a shared generator;
   never copy.
2. Depth: DEFAULT folds function internals (top-level + direct children
   visible, deeper collapsed = "1 level folded"). A setting for the
   default depth; per-file override; fold/unfold on rows using the
   editor's folding vocabulary where it fits. Argue persistence scope
   (session vs workspace) in the report.
3. Filter: type-to-filter, reuse the Quick Open matcher generator if
   importable (do not re-implement scoring), Enter jumps, Escape clears.

Real defaults (structure default-ON, preview left for md), both scales
(100k suppresses language structure by design — use markdown TOC + code
fixtures for depth; state it). Positive control per arm. Smokes measure
panes, never assume widths (#268 doctrine; helpers exist).

## Invariants in scope

- [structure.invariants.md](../../../../src/modules/structure/structure.invariants.md); the scrollbar projection record; settings
  records (new keys); [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) right-dock records.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## End state (mechanical)

READY report in the task folder: three arms driven with evidence +
positive controls, settings named, seam decisions argued, green
`bun test` + structure/manifest smokes. The conductor gates at landing.
