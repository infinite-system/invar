# Task 514 — terminal instance lifecycle bugs + panel chrome batch

Priority: user-directed
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
State: ACTIVE

## In plain words (user, 2026-08-05, verbatim intents)

1. LIFECYCLE BUG: "sometimes it removes more instances than needed."
2. Bottom status-bar buttons for terminal/agent: "leave only 1 button
   for terminal and it should not create new terminal instance, just
   open the bottom panel." Rename/tooltip: user floated "Open Bottom
   Panel"; conductor proposes TOGGLE semantics matching Ctrl+J with
   tooltip "Toggle Bottom Panel (Ctrl+J)" — builder implements toggle,
   presents both wordings with driven screenshots; user rules at
   review. Whether the agent button also goes: implement
   one-button-total (terminal/panel), note the agent-reach story
   (chord + panel) in the report; user confirms.
3. Instance-row hover buttons: "buttons that show on hover have
   different background color from the button itself" — unify.
4. "+ Terminal" affordance: needs a leading space; must NOT be in
   selected state right away; needs nice hover effect, click effect.

## THE MANDATED TEST PROTOCOL (user-prescribed; the smoke IS this)

Drive, watching the instance list (graph) AFTER EVERY STEP:
create several terminals -> remove ALL -> create several again ->
remove -> create split panes -> create a normal terminal, an invar
agent, a claude agent -> remove them one by one. Every step asserts
the exact expected list; over-removal is the bug being hunted.

## Conductor's driven sighting (2026-08-05, fresh warm server)

On a FRESH boot, key Ctrl+J then waitFor('panelHost.visible', true)
TIMED OUT while panelHost.visible later read true — and graph
responses persistently report settled:false on that boot. Possible
early-boot race or settle stall; investigate as part of the
lifecycle work (it may share a mechanism with over-removal).

## Invariants in scope (candidates)

Panel content order is one persisted sequence; An emptied space
survives its last instance; A persisted pane identity is never
reissued; Every registered panel content is reachable
(ui.invariants.md); Panel controls share paint and hit geometry;
status-bar contribution records (#405/#356 seams — the button change
goes through statusBarSegments, no core special case).

## Item 5 (user, same session): the tasks.json glyph moves

The Open-tasks.json glyph (from #503) moves from the pane frame
header's top-left corner to the hover-button cluster on the RIGHT of
the instance rows — one cluster, one geometry, one hover style.

## Conductor's driven evidence (2026-08-05 ~22:45, fresh reloads x2)

CONFIRMED on screen: the status-bar right cluster paints
"✦  ❯  ⚙  ?  <clock>  ▥" — separate agent (✦) and terminal (❯)
creation buttons exist beside the panel affordance; the welcome text
still shows the #354 Ctrl+P mislabel. NOT yet reproduced: the
over-removal — BLOCKED by early-boot drive flakiness seen twice:
after reload, Ctrl+J + waitForStatus(panelVisible,true) PASSES while
the panel is absent from the captured grid, later probes time out on
"+ Plugin" visibility, and graph responses report settled:false
persistently on that boot. Builder's first job: make the fresh-boot
drive honest (that fix may BE part of the lifecycle bug), then run
the user's protocol verbatim.
