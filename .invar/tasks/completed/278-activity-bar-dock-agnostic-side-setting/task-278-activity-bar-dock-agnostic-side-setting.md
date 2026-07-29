# 278 — the activity surface is dock-agnostic; a pane's side is the user's setting

State: COMPLETED — 83554f14 — activity surface serves both docks; dockSide is a live setting; optional right mirror
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: USER-DIRECTED (2026-07-29 09:4x)

## Outline

User observations, verbatim-derived: the tasks pane has no activity-bar
icon; should the right sidebar mirror the left's activity bar?; "there has
to be ability to select which side you want the plugin at."

Three arms, generator first:

1. **Dock-agnostic activity surface.** The activity bar currently serves
   the primary (left) dock only — right-dock citizens' activityAction is
   dead (#235 report; #262 filed the orphan). Fix at the generator: one
   activity entry per REGISTERED pane content, whatever dock it lives in;
   click shows/toggles/focuses the pane where it docks. This revives
   activityAction for structure and tasks. Fold #262 in (close it in your
   report if your fix makes it moot).

2. **Per-pane side setting.** `<pane>.dockSide: left|right` (naming per
   the settings convention — check precedent), default = the plugin's
   suggestion (structure right, tasks right today). Changing the setting
   moves the pane live (the PanelHost content-set machinery #238/#259
   built should carry this; one focus owner per #259's record). Persisted
   like any contributed setting (#264 landed round-trip-unknowns — new
   keys survive boots by construction).

3. **Optional mirrored right activity bar** behind a setting
   (default off), so the user can try the symmetric look. A rendering arm
   over the dock-agnostic surface — no second source of truth about what
   panes exist.

Real defaults, both scales, uninstall symmetry (an uninstalled pane's
entry disappears from the surface — both polarities). Positive control
per arm.

## Invariants in scope

- ui.invariants.md (activity bar records, right-dock records, #259's
  one-focus-owner); the PanelHost content-set records; settings records
  (new keys); #262's task (fold or close with evidence).

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- User messages 2026-07-29 09:3x-09:4x; report-235 (dead activityAction);
  #262.
