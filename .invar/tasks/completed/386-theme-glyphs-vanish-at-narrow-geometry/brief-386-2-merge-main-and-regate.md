# Brief #386 round 2 — merge main forward and re-gate the combined tree

## Why

Main landed the workspace panel tab-bar redesign (task 346, commit
068a7375) after your gate ran. Your branch and that landing both changed
scripts/harness/smoke-tasks-dashboard-harness.ts — yours adds the exact
glyph-cell arms, main's changes the rest wait to observe the scroll
transition (the building row leaves the viewport while held scale rows
stay visible) because the DEGRADED badge can push READY off-grid in the
bounded dock. Both changes must survive the merge. Main also redesigned
the bottom panel chrome (tabs instead of pane titles) — if any of your
dashboard arms read pane chrome, adapt them to the tab row.

## End state

1. main merged into fleet/386-theme-glyphs-vanish-at-narrow-geometry.
2. Full commit-hook gate green ON THE COMBINED TREE.
3. A new report (or one newer than this filing) with the merge commit
   hash, GATE_EXIT, and one line per conflict resolution.
4. Worktree clean; no push, no land.

## Invariants in scope

Same set as round 1 (theme, terminal, dashboard, harness records you
audited). No new records expected from the merge; say so if one appears.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy; carry the section even when it reads None
observed.
