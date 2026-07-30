# READY — #319 (tasks pane layout, tabs, and play button polish)

## Result

#319 (tasks pane layout, tabs, and play button polish) is ready for review.

Commit: `e26274b9d5e9bf7bbd045042d2b894adca8fde55`

The worktree is clean. I did not push, merge, tag, or land the branch.

The implementation is in:

- [TasksDashboardOverview.ts](../../../../src/modules/tasks-dashboard/TasksDashboardOverview.ts)
- [TasksDashboardPaneContent.ts](../../../../src/modules/tasks-dashboard/TasksDashboardPaneContent.ts)
- [TasksDashboardPaneRenderer.ts](../../../../src/modules/tasks-dashboard/TasksDashboardPaneRenderer.ts)
- [Theme.ts](../../../../src/modules/theme/Theme.ts)
- [ThemeIcons.ts](../../../../src/modules/theme/ThemeIcons.ts)

The new behavior is recorded in
[tasks-dashboard.invariants.md](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md).

## Tooltip seam census

I completed the tooltip census before changing the play control.
`bun scripts/ast-query.ts identifiers tooltipAt --path src/modules --tests` found six
identifier sites:

- [TasksDashboardPaneContent.ts](../../../../src/modules/tasks-dashboard/TasksDashboardPaneContent.ts)
- [StructurePaneContent.ts](../../../../src/modules/structure/StructurePaneContent.ts)
- [StructurePaneContent.test.ts](../../../../src/modules/structure/StructurePaneContent.test.ts)
- [RootView.ts](../../../../src/modules/ui/RootView.ts), with two sites
- [PaneContent.interface.ts](../../../../src/modules/ui/PaneContent.interface.ts)

The shared seam already existed. `PaneContent.tooltipAt` routes through `RootView` into the
shared display-only tooltip. The Tasks pane already used that route for task actions. I
extended the same route for the cycle control. I did not create a Tasks-only tooltip host.

The chosen off semantic is: a second activation stops automatic lens changes and keeps the
current lens selected. The stopped control says `Start automatic lens cycling`. The running
control says `Stop automatic lens cycling`.

## Frame evidence

The real `bun tasks:watch` target used this shape before the edit:

```text
⛭ IN-PROGRESS (4)
  #320 terminal-pane-fidelity-two-bundle
     · building  55m  +769 -153  codex·5.6-sol·high
       tmux attach -t invar/320-terminal-pane-fidelity-two-bundle
```

The default-width Tasks pane showed the old shape:

```text
│ LIVE  ACTIVE  DONE   ▷
│ · #320 terminal-pane-fid
│ tmux invar/32 ▰  ▤  ◫  ✓
```

After the edit, the same default-width pane shows the title and status on separate rows:

```text
│ LIVE   ACTIVE   DONE  ▷
│ · #320 terminal-pane-fi…
│ building  1h… ▰  ▤  ◫  ✓
```

Active and Done now stay on one row:

```text
│ ★ User-directed (1)
│   #903 plant… ▰  ▤  ◫  ✓
│ ✔ #905 plant… ▰  ▤  ◫  ✓
```

FrameProbe read the selected ` ACTIVE ` span by code point. All eight cells had one
background lane. This is six label cells plus one padding cell on each side. Under the dark
theme the lane was `43,47,65,255`. Both adjacent cells differed. After a live switch to the
light theme, the same eight cells changed to `183,193,227,255`; both adjacent cells still
differed. The Active lens stayed selected across the switch.

## Acceptance evidence

### Arm 1 — two-line Live rows

- Positive: the PTY smoke found each Live status exactly one row below its title.
- Negative: renderer tests prove `READY`, `building`, and duration text are absent from the
  title row. They also prove task titles are absent from the status row.
- The status order now follows `tasks:watch`: standing, duration, line delta, and identity.

Evidence:
[TasksDashboardPaneRenderer.test.ts](../../../../src/modules/tasks-dashboard/TasksDashboardPaneRenderer.test.ts)
and
[smoke-tasks-dashboard-harness.ts](../../../../scripts/harness/smoke-tasks-dashboard-harness.ts).

### Arm 2 — cycle tooltip and off action

- Positive: the real pointer path showed both tooltip texts. Starting changed
  `tasksCycling` to `true`. Stopping changed it to `false`.
- Negative: the stopped control did not show the stop glyph or stop tooltip. The running
  control did not show the start glyph or start tooltip.
- Stopping kept `tasksLens="live"` after the observed cycle advance.
- Start and stop glyphs now come from `TaskActionIconSet` at nerd, Unicode, and ASCII tiers.

Evidence:
[TasksDashboardPaneContent.test.ts](../../../../src/modules/tasks-dashboard/TasksDashboardPaneContent.test.ts),
[TasksDashboardPaneRenderer.test.ts](../../../../src/modules/tasks-dashboard/TasksDashboardPaneRenderer.test.ts),
and the PTY smoke.

### Arm 3 — padded persistent tabs

- Positive: the selected tab uses the live palette selection tone. A hovered, unselected tab
  uses the live cursor-line tone.
- Negative: an inactive, unhovered tab has no added background. The cells immediately outside
  the selected eight-cell span do not use the selected background.
- FrameProbe proved the exact one-cell padding under dark and light themes.
- The selection stayed active while focus moved through Settings and while the theme changed.

Evidence:
[TasksDashboardPaneRenderer.test.ts](../../../../src/modules/tasks-dashboard/TasksDashboardPaneRenderer.test.ts)
and the FrameProbe arm in the PTY smoke.

### Arm 4 — one-line Active and Done items

- Positive: the overview emits no detail row for Active or Done. Both lenses paint the task
  text, ellipsis, and four actions on one row at the default 28-column dock width.
- Negative: row-kind tests reject the old extra detail rows. Renderer tests reject the full
  untruncated long name.
- Truncation uses the existing grapheme-safe `WrapText.clipToWidth` seam and the active
  theme's one-cell ellipsis.

Evidence:
[TasksDashboardOverview.test.ts](../../../../src/modules/tasks-dashboard/TasksDashboardOverview.test.ts),
[TasksDashboardPaneRenderer.test.ts](../../../../src/modules/tasks-dashboard/TasksDashboardPaneRenderer.test.ts),
and the default-width PTY frames above.

### Arm 5 — capitalized section headers

- Positive: the pane paints `User-directed` and `Unprioritised`.
- Negative: model and PTY checks reject `user-directed` and `unprioritised`.

Evidence:
[TasksDashboardOverview.test.ts](../../../../src/modules/tasks-dashboard/TasksDashboardOverview.test.ts)
and the Active-lens PTY arm.

## Scale evidence

I drove the shared scale fixtures with `bun run drive --size 10` and
`bun run drive --size 100000`, then opened the Tasks surface at the default width. Both
workspaces had no task tree, as expected. Both painted the same tab geometry and the same
stated unavailable view. The 100,000-line editor did not change the Tasks projection.

The Tasks PTY smoke also built 500 Live tasks. It published `tasksRows=1001`, painted
`#1499 scale-row` in the leading window, kept `#1000 scale-row` outside that window, and
advanced the motion clock. This covers the surface with a large task collection.

## Positive control

I removed both tab padding cells from `renderTabLine` and ran the real Tasks PTY smoke. It
failed with exit 1:

```text
error: Timed out waiting for FrameProbe: the selected Active tab under the dark theme
```

I restored the padded span and reran the same smoke. It passed every arm with exit 0. This
proves the FrameProbe check detects the defect that it guards.

## Verification

The enforcing pre-commit hook ran the full merge gate once for the product commit.

```text
merge-gate: ALL-PASS
GATE_EXIT=0
pre-commit: merge-gate GREEN — commit allowed.
```

The gate passed:

- TypeScript and convention checks
- Prettier
- invariant structure and reference checks
- coverage ratchet
- all unit tests
- binary build
- all 63 parallel PTY smoke jobs
- behavioral contracts
- three serial PTY jobs
- the five-session input-byte timing gate

The gate reported `p50 4.674 ms` and `p95 5.351 ms` for input-byte first-frame ordering.

Three unrelated smokes passed only on their built-in quiet retry:
`panel-split`, `panel-chrome`, and `overlay-dialog`. The gate classified each first attempt
as a starvation-class timeout and recorded the retry tally. See Bycatch.

## Bycatch

- Contract breach: [theme.invariants.md](../../../../src/modules/theme/theme.invariants.md)
  says appearance comes only from theme data. The Tasks domain still has
  `ROUND_AMBER = "#d7af5f"` in
  [TasksDashboardPaneRenderer.ts](../../../../src/modules/tasks-dashboard/TasksDashboardPaneRenderer.ts),
  `PRIORITY_GLYPHS` in
  [TasksDashboardOverview.ts](../../../../src/modules/tasks-dashboard/TasksDashboardOverview.ts),
  and literal `#`/`⛭` pane icons in
  [TasksDashboardPaneContent.ts](../../../../src/modules/tasks-dashboard/TasksDashboardPaneContent.ts).
  I did not change these existing shared appearance choices in #319.
- Distillation possibility:
  [TasksDashboardPaneContent.ts](../../../../src/modules/tasks-dashboard/TasksDashboardPaneContent.ts)
  builds near-identical `TasksDashboardRenderContext` objects in `render`, `tooltipAt`, and
  `onPointerDown`. The shared generator is the pane render context. I did not unify it in this
  task.
- Contract drift:
  [tasks-dashboard.invariants.md](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
  uses structural `grep` commands in the verification for the CLI-generator and pane-citizen
  records. [AGENTS.md](../../../../AGENTS.md) requires `bun scripts/ast-query.ts` for code
  structure. I did not rewrite unrelated record verification in this task.
- Gate flake: `smoke: panel-split harness` timed out on its first attempt. It did not reproduce
  on the built-in quiet retry.
- Gate flake: `smoke: panel-chrome harness` timed out on its first attempt. It did not
  reproduce on the built-in quiet retry.
- Gate flake: `smoke: overlay-dialog harness` timed out on its first attempt. It did not
  reproduce on the built-in quiet retry.

## Handoff

Review commit `e26274b9d5e9bf7bbd045042d2b894adca8fde55` on
`fleet/319-tasks-pane-layout-tabs-and-play-button-polish`. The conductor can gate and land it.
