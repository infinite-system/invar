# #408 — workspace state never leaks across workspaces

State: IN-PROGRESS
Priority: user-directed
Engine: claude
Environment: linux
Model: opus-5
Effort: medium
Assignment note: census-heavy audit + fix; opus slot free; must NOT
collide with #404's in-flight panel files.

## The request (user, 2026-07-30, VERBATIM)

"Another refinement which might be big in scope though sounds simple,
per workspace state must remain what it was, opening different panels in
different workspace should remain open in that workspace only not leak
to other workspaces, positioning of things should remain to that
workspace only"

## Shape

1. CENSUS first: enumerate EVERY piece of UI state (panel open/expanded,
   dock visibility + widths, active pane/tab selections, splitter
   positions, scroll positions, pane list pinned state, right dock
   content, overlays...) and classify each: workspace-scoped (must
   travel with the workspace) vs app-global (theme, monitoring, ...).
   The record "Each workspace owns one panel world" is the anchor — the
   census tests where reality deviates.
2. REPRODUCE each leak by driving: open/position things in workspace A,
   switch to B, assert B's own state; switch back, assert A restored.
3. FIX the leaking ones EXCEPT panel-model files #404 is rebuilding
   (PanelHost/PanelTabBar/panel persistence) — for those, REPORT the
   leak precisely so #404 inherits the requirement; fix the rest
   (dock widths, editor/scroll, overlays, etc.).
4. Contract: a workspace-isolation smoke arm per state class; the
   workspace records refine to name the full scoped-state set.

## Addendum (user, same day, VERBATIM)

"yes modular architecture should be preserved and better strengthened by
this change"

Reading: fixes land at the module seams — workspace scoping flows
through each module's own cold-state contribution (the workspace seam),
never through a central grab-bag of flags. If the census finds state
that has no clean owner module, the fix includes giving it one. Seam
rule: the shared generator is the workspace cold-state serialization;
modules contribute to it, nothing reaches into other modules.
