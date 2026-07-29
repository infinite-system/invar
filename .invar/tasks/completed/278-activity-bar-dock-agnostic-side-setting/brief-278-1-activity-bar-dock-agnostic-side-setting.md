# Brief — #278: dock-agnostic activity surface; a pane's side is the user's setting

Read first: `.invar/tasks/in-progress/278-activity-bar-dock-agnostic-side-setting/task-278-*.md`.

Three arms, generator first:

1. **Dock-agnostic activity surface.** The activity bar serves only the
   primary dock today — right-dock citizens' activityAction is dead
   (structure, tasks; #262 filed the orphan — fold it, close in your
   report if your fix moots it). One activity entry per REGISTERED pane
   content wherever it docks; click shows/toggles/focuses the pane where
   it lives (through #259's one-owner focus set — its smoke stays green).
2. **Per-pane side setting** (`<pane>.dockSide: left|right`, naming per
   the settings convention precedent). Default = the plugin's suggestion.
   Changing it moves the pane LIVE through the PanelHost content-set
   machinery. Contributed keys round-trip boots by #264's law.
3. **Optional mirrored right activity bar** behind a setting, default
   off — a rendering arm over the same surface, no second source of
   truth about what panes exist.

Uninstall symmetry: an uninstalled pane's entry disappears from the
surface (both polarities). Real defaults, both scales, panes measured
never assumed (#268 doctrine). Positive control per arm.

## Invariants in scope

- [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) (activity bar records, right-dock records, #259's
  one-focus-owner); PanelHost content-set records; settings records;
  #262 (fold or close with evidence).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## End state (mechanical)

READY report in the task folder: all three arms driven with evidence +
controls, #262's disposition, the dockSide move driven live both
directions, green `bun test` + activitybar/manifest smokes. The conductor
gates at landing.
