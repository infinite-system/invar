# 273 — tasks pane follow-ups: fleet extras, wall-display auto-show

State: IN-PROGRESS
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium
Priority: user-roadmap-extension

## Outline

Named follow-ups from #235's report, deferred at the seam:

1. Fleet extras in the pane — gate glance (reads /tmp/fleet-watch-gates),
   ±line deltas, exploring/building phase — once those readers grow
   workspace-anchored forms (today they anchor to the Invar repo, not the
   opened workspace; that anchoring decision is the real work).
2. `tasksDashboardShowByDefault` for the wall-display case, symmetric with
   `structureShowByDefault` (#238's pattern).

The user's cycling-wall-display intent (#235 outline) is the driver for
both. Do not re-implement any reader; the seam law from
tasks-dashboard.invariants.md governs.

## Arms added by the user (2026-07-29 12:3x, verbatim intent)

3. **Watch-parity animation, a bit more compact.** The pane's rows render
   like `tasks:watch` — full motion vocabulary (breathing gradient dot,
   shimmer 'building', exploring compass, gold gate ramp), compacted for
   pane width. #235 chose still glyphs deliberately; the user now wants
   the live feel — port the ANIMATION generator from the watch (share
   the ramp/glyph tables from tasks-status.ts, never copy), driven by
   ivue ticks only while the pane is observed (no hidden-pane work).
4. **The tmux line opens a PTY.** Clicking a task's tmux link opens a
   terminal pane running `tmux attach -t <session>` (the agent-pane /
   terminal seam exists — use it). Absent session states itself.
5. **Row action icons, neat:** per task — open WORKTREE as workspace
   (workspace-tabs seam), open task.md, open latest brief, open latest
   report (workspace open seam, #235's pattern). Small icon row or
   affordance on selection; tooltips name them. Absent files state
   themselves (a task with no report yet shows the miss honestly).

## Invariants in scope

- `tasks-dashboard.invariants.md`; the settings records for the new key;
  fleet-watch's registry format if the glance ports.

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- `report-235-...md`, "Deliberate decisions" + follow-ups 1-2.
