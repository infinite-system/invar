# Brief #404 round 3 — detail: full-width default, explicit split groups

The task file gained "Detail 2" (user verbatim + the conductor's
VS Code-terminal-list reading). Core change to the pane model:

1. ADD NEVER AUTO-SPLITS. A new terminal/agent window enters as its own
   FULL-WIDTH group. The current always-split-on-add behavior is the
   defect being removed ("often it does not fit").
2. SPLIT IS EXPLICIT: each pane-list item carries a split button that
   joins it with another pane into a split group.
3. The pane list renders split-group membership with joined
   icons/glyphs, and dragging a member OUT dissolves it back to a
   full-width group. Reordering still works.
4. One group visible at a time within the container; the pane list
   selects which. Example target state to drive: one Terminal container
   holding a 3-pane split group plus 2 full-width panes; other
   containers via the outer tabs unchanged.

Persist group structure per workspace like the other sequences. Refute
the one-group-visible reading in the report if the verbatim supports
simultaneous stacked groups better — but never auto-split on add.

## Invariants in scope

Unchanged from round 1; the persisted-sequence records now also carry
group structure — propose the refinement wording.

## Bycatch expected

Unchanged from round 1.
