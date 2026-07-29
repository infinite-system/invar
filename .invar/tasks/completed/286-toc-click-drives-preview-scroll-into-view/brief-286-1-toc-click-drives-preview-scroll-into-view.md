# Brief — #286: TOC clicks drive the preview; jumps scroll into reading view

Read first: `.invar/tasks/in-progress/286-toc-click-drives-preview-scroll-into-view/task-286-*.md`
— the user's two defects, verbatim-derived.

Short form: (1) a structure-pane TOC click scrolls only the source — the
PREVIEW must follow to the same heading. (2) All jumps currently land the
target at the BOTTOM edge, where the horizontal scrollbar then covers
it — a jump scrolls the target into READING position: top third of the
viewport, small context margin argued, never the last body row. ONE
scroll-into-view generator (check the editor's existing reveal logic
first), consumed by source jump and preview follow — do not write a
third reveal.

Drive at 140x40 with a long document; assert the heading paints in the
top third of BOTH panes. Positive control: break the follow, red. #285
(dead last row) is adjacent — coordinate, do not fix it here.

## Invariants in scope

- markdown split record (sync seam); structure jump records (#35 jump
  ends for Back/Forward); editor reveal record if it becomes the shared
  generator.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if
it reads `None observed`.

## End state (mechanical)

READY report: both defects driven red-then-green, the shared-generator
decision argued, controls quoted, green `bun test` + markdown/structure
smokes. The conductor gates at landing.
