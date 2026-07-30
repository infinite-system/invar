# #404 — panel chrome v2: two rows, tab close buttons, pane-level add

State: IN-PROGRESS
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## The request (user, 2026-07-30, VERBATIM)

"terminal, database tabs should have close buttons and be on lower line
than splitter, bring back the icons to the left side of splitter, show
pane list button should stick the pane to be shown, should also be
splitter controlled to make smaller, add 1 key space on the right side
before close btn, ellipsis text on resize, should be able to add more
tabs in the same terminal, upper + can add more terminal/database views
just like it is now, should be able to put Invar Agent beside inside
terminal plugin not separately, so the top bottom bar + should only
contain + for tabs, and lower level + should be able to add Terminal/AI
Agent(Claude)/Invar Agent all in same terminal panes, reordering should
still work within the list of terminals in that right pane, closing
right pane sticks it to being closed, to the splitter bar left btns that
we are returning back, add btn go to bottom"

## Decomposed spec (conductor reading — refute any point against the verbatim)

ROW STRUCTURE — two rows instead of one:
1. SPLITTER row (top): left side gets the editor action icons BACK
   (wrap, go-to-line) plus a NEW go-to-bottom button; then pad; then the
   drag span; right controls stay.
2. TAB row (below the splitter): the workspace space tabs
   (Terminal/Database/...) live here, each tab with its own CLOSE button,
   one blank cell before that close button, label ellipsis-truncation on
   narrow widths. The top-level + on this row adds SPACES (tabs) only —
   exactly the current add-space behavior.

PANE LEVEL — inside one space:
3. A space can hold multiple panes (as today), and a LOWER-LEVEL + adds
   panes INTO the current space: Terminal / AI Agent (Claude) / Invar
   Agent side by side in the same space. The Invar Agent must be addable
   INSIDE a terminal space, not only as its own space (refines #356's
   decoupling: separate plugin, composable placement).
4. The pane management list ("show pane list"): the button STICKS —
   pinned open until closed, not click-away; the list region is
   splitter-resizable (can be made smaller); closing it sticks closed
   (persisted). Reordering panes within the list keeps working.

## Constraints

- Persistence: pinned/closed list state and space/pane sequences persist
  per workspace (the #346 records already shape this — refine, do not
  fork).
- All prior #346/#387 wins survive: slim marks, the pad cell, drag hit
  geometry, workspace scoping, auto-cycle, idle quiescence.
- The #384 direction holds: real-UI affordances, no bracket decoration.

## Clarification (user, same day, VERBATIM)

"In the same terminal i meant more terminal/agent/invar agent windows,
not tabs, tabs are outer control to make more terminal containers,
database containers, etc"

Reading confirmed: NO nested tabs inside a container. Tabs (outer row)
create containers; the lower-level + adds WINDOWS (panes) of Terminal /
AI Agent (Claude) / Invar Agent side by side inside the current
container.

## Detail 2 (user, same day, VERBATIM)

"another detail, by default adding terminal/agent puts them full width
with a button on each list item to be able to split them with another
terminal/agent/etc, otherwise it always splits them the more terminals
we add, and often it does not fit, (in the right pane the split
terminals should have icons/glyphs showing those 2 are together, but
you should be able to drag them out too to make separate, so you should
be able to add 3 split panes, and 2 panes that are full width all
within the same Terminal container, and more Terminal (Or other outer
tabs still can be added to contain other sets)"

Reading (VS Code terminal-list model): a container holds an ordered list
of GROUPS. Each group is one full-width pane OR a split group of 2+
panes. Adding a pane creates a new full-width group (never auto-split).
One group is visible at a time; the pane list selects it. Each list item
carries a split button (join with another pane); split-group members
show joined glyphs in the list; dragging a member out makes it a
full-width group again. Example state: one container with 3 split panes
(grouped) plus 2 full-width panes; more containers via outer tabs.

## Detail 3 (user, same day, VERBATIM)

"so you should still be able to re-order split panes in the right pane
controller"

Reading: reordering in the pane list covers BOTH levels — groups within
the container list, and members WITHIN a split group (order of the
split). Drag to reorder both.
