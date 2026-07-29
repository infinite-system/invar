# Brief — #273: the tasks pane becomes the cockpit — animation, tmux PTY, action icons, fleet extras

Read first: `.invar/tasks/in-progress/273-tasks-pane-follow-ups/task-273-*.md`
— five arms, all user-directed, in his words there.

1. **Watch-parity animation, compact**: the pane's rows move like
   `bun tasks:watch` — breathing gradient dot (building), exploring
   compass ramp, gold gate ramp, shimmer — by IMPORTING the ramp/glyph
   tables from scripts/tasks/tasks-status.ts (the one motion vocabulary;
   copying is the named seam failure). ivue-driven ticks ONLY while the
   pane is observed; an unobserved pane does zero work.
2. **tmux link opens a PTY**: clicking a task's session line opens a
   terminal pane running `tmux attach -t <session>` through the existing
   agent/terminal pane seam. A gone session states itself in-pane.
3. **Row action icons**: open worktree as workspace (workspace-tabs
   seam), open the task record file, open latest brief, open latest report — via the
   workspace open seam (#235's pattern); tooltips; a missing file states
   the miss.
4. **Fleet extras where honest**: gate glance (reads the
   /tmp/fleet-watch-gates registry), ± line deltas, exploring/building
   phase — these anchor to the INVAR repo; state that scoping honestly
   in-pane when the opened workspace is not the fleet repo (degrade,
   never pretend).
5. **`tasksDashboardShowByDefault`** setting, default off, #238's
   pattern.

Real defaults, uninstall symmetry, panes measured never assumed. Positive
control per arm. Lint your report links before READY
(per [AGENTS.md](../../../../AGENTS.md)).

## Invariants in scope

- [tasks-dashboard.invariants.md](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md) (#235's records — extend); the terminal/
  agent pane seam records; workspace-tabs records; settings records;
  the watch's motion vocabulary as exported generator.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report: five arms driven with evidence + controls, seam decisions
argued, links linted, green `bun test` + tasks-dashboard/manifest
smokes. The conductor gates at landing.
