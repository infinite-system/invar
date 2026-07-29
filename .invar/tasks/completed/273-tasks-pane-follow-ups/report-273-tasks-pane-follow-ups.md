# READY — Tasks pane follow-ups

Task: [tasks pane follow-ups](task-273-tasks-pane-follow-ups.md)

Commit: `2c97516ebd9e62480b6d63cda760e40614ff95dc`

## Result

The tasks pane is now a compact fleet cockpit. All five requested arms are complete.

- Watch motion imports the breath frames, compass glyphs, building and exploring ramps, gate
  ramp, and paint cadence from
  [tasks-status.ts](../../../../scripts/tasks/tasks-status.ts). Building and exploring rows use
  a moving glyph and per-letter phase shimmer. READY stays still. A hidden pane performs no
  task-tree read and owns no timer.
- A click on the session line opens a terminal-runtime pane that runs
  `tmux attach -t <session>`. The driven missing session exited and stated its failure inside
  that terminal pane.
- Each task has pinned workspace, task record, latest brief, and latest report actions. Paint,
  hit testing, and tooltips use one geometry in
  [TasksDashboardPaneRenderer.ts](../../../../src/modules/tasks-dashboard/TasksDashboardPaneRenderer.ts).
  Missing worktrees and artifacts state the miss in the detail row.
- The main Invar checkout shows the fleet gate glance, line deltas, and the sticky
  exploring-to-building phase. Other workspaces show the main-checkout scope notice and perform
  no fleet reads.
- `tasksDashboardShowByDefault` is contributed with a false default. The default-off PTY boot
  left the dock hidden and the model unobserved. The opt-in unit path revealed Tasks without
  taking keyboard focus.

The implementation extends the public pane seams instead of teaching the host about Tasks.
[ApplicationContributor.interface.ts](../../../../src/modules/app/ApplicationContributor.interface.ts)
offers an opaque runtime-open request. The terminal runtime still owns the PTY. The optional
`PaneContent.tooltipAt` method lets any pane describe its own tooltip from its own action
geometry. [RootView.ts](../../../../src/modules/ui/RootView.ts) only routes that generic answer.
Task, brief, and report files still use `openFileInTab`; worktrees use `WorkspaceSet.open`.

The contract now records observed-only motion, fleet scope, default visibility, and all row
actions in
[tasks-dashboard.invariants.md](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md).
The generic tooltip and runtime records were refined in
[ui.invariants.md](../../../../src/modules/ui/ui.invariants.md).

## Driven evidence

The first default drive used the main Invar checkout at `120x36`. The pane started hidden. An
activity-bar click showed a compact gate line and live rows for tasks 289 and 273. Each task used
one status row and one action row at the default 28-column dock width.

The extended
[tasks dashboard PTY smoke](../../../../scripts/harness/smoke-tasks-dashboard-harness.ts) then
drove these user paths:

- default-off boot with `tasksAnimationPaint=0`;
- a visible building row advancing past three motion paints;
- a missing report stating `No latest report exists for #901.`;
- report-action tooltip dwell and report opening in the editor;
- session-line click creating `tasks-session-902`, followed by the gone tmux session exiting in
  the terminal pane;
- LIVE, ACTIVE, and DONE lens navigation and cycling;
- record opening, plugin uninstall, reinstall, and absent-tree degradation;
- the same compact visible-window behavior with four tasks and with 500 tasks. The large model
  contained 1,001 physical rows and painted only its visible leading window.

The fixture workspace was outside the main checkout. It displayed the fleet-scope notice and
did not claim main-checkout deltas. The main-checkout drive displayed the real gate glance and
fleet phases.

## Positive controls

Each acceptance arm went red with one planted defect. I removed every plant before the final
pass.

1. Motion: an early return in the motion tick failed with
   `Expected: > 0, Received: 0`.
2. Tmux runtime: bypassing `openRuntimePane` failed with
   `Expected length: 1, Received length: 0`.
3. Row actions: suppressing the missing-report state failed with
   `Expected: "No latest report exists for #901.", Received: null`.
4. Fleet scope: forcing all workspaces into fleet scope triggered
   `An unrelated workspace must not read fleet facts`.
5. Default visibility: changing the contributed default to true failed with
   `Expected: false, Received: true` for the hidden dock.

## Verification

- `bun test` — PASS: 1,918 tests, 0 failures, 68,585 expectations.
- `bun run typecheck` — PASS.
- `bun scripts/harness/smoke-tasks-dashboard-harness.ts` — PASS, including the 500-task scale
  arm.
- `bun scripts/harness/smoke-plugin-manifest-harness.ts` — PASS.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — PASS: 1,123
  annotations, 221 lattice links, 0 problems.
- `bun run check` — PASS.
- The commit hook's full merge gate passed before commit `2c97516e`.
- The worktree is clean.

## Bycatch

- The copied root relay for the
  [dispatch brief](brief-273-1-tasks-pane-follow-ups.md) used a task-folder-relative contract
  path and omitted the required invariant anchor. The invariant checker reproduced the problem
  twice. I corrected the ignored local relay so the final checker could resolve it. No product
  file or task record needed a separate fix.
