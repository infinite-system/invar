# 286 — structure TOC click drives the PREVIEW too, and jumps scroll INTO VIEW for reading

State: IN-PROGRESS
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: USER-DIRECTED (2026-07-29 12:1x, verbatim)

## Outline

Two user-reported defects in the markdown/structure jump path:

1. **Clicking a structure-pane TOC heading moves only the source; the
   PREVIEW must follow.** The preview is the pane you READ — a TOC click
   should scroll the preview to that heading (source and preview both,
   through whatever revision-sync seam the split already has).
2. **Jumps land the target at the BOTTOM edge — and the horizontal
   scrollbar then covers it.** A jump must scroll the target INTO VIEW
   for reading: the heading lands near the TOP of the viewport (a small
   context margin above is fine; argue the offset), never under the
   trailing-edge scrollbar row. This applies to the source pane jump AND
   the new preview follow — one scroll-into-view generator, two
   consumers (check the editor's existing reveal logic for the shared
   generator; do not write a third).

Verify by DRIVING at 140x40 with a long document
(project.conductor.archive.md class): click a deep TOC heading, assert
the heading row paints in the TOP third of both panes and is not the
last body row (the #285 dead-row family — coordinate, don't fix that
one). Positive control: break the follow, watch the assertion red.

## Invariants in scope

- The markdown split record (revision/scroll sync); the structure jump
  records (#35's convention — both jump ends recorded for Back/Forward);
  the editor reveal record if it becomes the shared generator.

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if
it reads `None observed`.

## Sources

- User message 2026-07-29 12:1x; [#274](../274-structure-scrollbar-depth-filter/task-274-structure-scrollbar-depth-filter.md) (depth/filter);
  [#285](../285-preview-last-body-row-hit-test/task-285-preview-last-body-row-hit-test.md) (dead last row).
