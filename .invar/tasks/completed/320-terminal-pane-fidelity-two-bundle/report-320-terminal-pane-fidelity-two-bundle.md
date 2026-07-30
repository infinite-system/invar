# READY — terminal pane fidelity two-task bundle

READY

The bundle is complete on `fleet/320-terminal-pane-fidelity-two-bundle`.
The worktree is clean.

## Task 320 — theme defaults and the VSCode ANSI palette

[Task 320 (terminal theme defaults and ANSI palette)](../../active/320-terminal-default-bg-theme-and-vscode-ansi-palette/task-320-terminal-default-bg-theme-and-vscode-ansi-palette.md)
is complete in commit
`c8c8723a94304684a92e5d31712ca96f54f832aa`
(`Terminal pane theme fidelity (#320)`).

### Diagnosis

The default terminal cells used fixed xterm colors. The baseline drive found
foreground `192,192,192` and background `0,0,0` at both scales. The ANSI white
slot was also `192,192,192`. Explicit truecolor stayed exact. The fixed
defaults explain the black Claude background and the dark robbyrussell colors.

### Change

- [ThemePalettes.ts](../../../../src/modules/theme/ThemePalettes.ts) now owns
  terminal foreground, background, and all 16 ANSI slots for both theme
  polarities. The default ANSI values follow the
  [VSCode terminal palette source](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminal/common/terminalColorRegistry.ts)
  and its
  [terminal theme token model](https://code.visualstudio.com/api/references/theme-color#integrated-terminal-colors).
- [TerminalPaneRenderer.ts](../../../../src/modules/terminal/TerminalPaneRenderer.ts)
  reads theme tokens for default cells and unmodified ANSI slots. Explicit
  RGB, indexed slots 16 through 255, and OSC 4 overrides stay child-owned.
- [TerminalEmulator.ts](../../../../src/modules/terminal/TerminalEmulator.ts)
  records OSC 4 overrides and honors OSC 104 resets.
- The evolved
  [theme contract](../../../../src/modules/theme/theme.invariants.md) and
  [terminal contract](../../../../src/modules/terminal/terminal.invariants.md)
  state the authority boundary.

### Drive evidence

The
[task 320 diagnostic probe](320-terminal-theme-diagnostic-probe.ts)
ran the real oh-my-zsh prompt and real Claude inside the pane. It also changed
the live theme through the user interface.

At `100x30` and at the 100,000-line `160x50` scale:

- robbyrussell green was `13,188,121,255`, VSCode `#0dbc79`.
- robbyrussell blue was `36,114,200,255`, VSCode `#2472c8`.
- dark Claude defaults were background `22,22,30,255` and foreground
  `169,177,214,255`.
- light Claude defaults were background `212,214,228,255` and foreground
  `52,59,88,255`.
- Claude kept pure-white explicit cells in both themes. The small drive found
  one. The large drive found two.

The theme switch changed defaults and palette slots. It did not change
explicit truecolor, indexed-color, or OSC 4 lanes.

### Positive control

I changed the dark green token from `#0dbc79` to `#0dbc78`.
`bun test src/modules/theme/ThemePalettes.test.ts` failed with the exact
one-channel difference. I removed the plant. The targeted tests and real
terminal smoke then passed.

## Task 321 — synchronized child repaints

[Task 321 (terminal child TUI repaint flicker)](../../active/321-terminal-flicker-child-tui-repaints/task-321-terminal-flicker-child-tui-repaints.md)
is complete in commit
`f0a860bfa05a597dda2054975de8b923f4615e4c`
(`Terminal synchronized repaint fidelity (#321)`).

### Diagnosis

Before the change, real `tasks:watch` wrote 9,316 bytes in 350 ms. The capture
contained nine cursor-home commands, nine CSI `0J` clear-to-end commands, and
no synchronized-output markers. The pane exposed intermediate grids:

- The small-scale drive had eight observations. Its last update fell from
  seven nonblank rows to three and lost the summary.
- The large-scale drive fell from 16 nonblank rows to nine before the complete
  frame returned.

The child sent destructive partial frames, and
[TerminalInstance.ts](../../../../src/modules/terminal/TerminalInstance.ts)
published every parser update. The flicker therefore had one cause at each end
of the pipe.

### Change

- `TerminalInstance` now holds repaint revisions while child DEC private mode
  2026 is active. It commits once at DECRST. Ordinary children keep their
  existing repaint cadence.
- An unclosed bracket releases after one second. Later output stays live until
  the child closes the mode. This follows the
  [tmux one-second guard](https://github.com/tmux/tmux/blob/master/screen-write.c#L1014-L1059)
  and the
  [DEC 2026 synchronized-output protocol](https://contour-terminal.org/vt-extensions/synchronized-output/).
- [TasksWatchRenderer.ts](../../../../scripts/tasks/TasksWatchRenderer.ts)
  emits one synchronized frame with cursor-home row diffs and clear-to-end-of-line
  commands. It emits no full-screen clear and no unchanged row.
- [tasks-status.ts](../../../../scripts/tasks/tasks-status.ts) now repaints on
  ledger data ticks instead of a fixed 30 FPS loop.
- The
  [terminal contract](../../../../src/modules/terminal/terminal.invariants.md)
  records the atomic commit, normal-output polarity, and timeout behavior.

### Drive evidence

After the change, the raw 2.5-second `tasks:watch` capture was 1,408 bytes. It
contained three matched DEC 2026 brackets: initial paint, one data tick, and
screen restore. It had one alternate-screen entry, two cursor-home commands,
and no CSI `0J` or `2J` full clear.

The
[task 321 diagnostic probe](321-terminal-synchronized-update-diagnostic-probe.ts)
ran the real watcher inside the real terminal pane. At `100x30` and at the
100,000-line `160x50` scale, it observed the shell frame and one complete
dashboard frame. It observed zero blank or partial completed frames at either
scale.

The gated terminal smoke also drove the real watcher. It saw three outer
frames and one complete initial dashboard commit. The unit fixtures prove
one repaint for a closed DEC 2026 bracket, release for an unclosed bracket,
and unchanged cadence for a non-2026 child.

### Positive controls

I made `holdSynchronizedUpdate` decline the hold. The DEC 2026 unit fixture
failed because the interior writes advanced the repaint revision from zero to
two. I removed the plant.

I changed the watcher end marker from DEC 2026 reset to DEC 2025 reset. The
renderer fixture failed on the exact closing marker. I removed the plant.

The final targeted pass had 19 tests and no failures. The terminal harness
passed.

## Final verification

- The invariant checker found 1,159 annotations, 223 links, and zero problems.
- `bunx prettier --check .` passed.
- `git diff 67ce5a57..HEAD --check` passed.
- The normal pre-commit hook accepted final commit `f0a860bf` with
  `GATE_EXIT=0`.
- `git status --short` prints nothing.

## Bycatch

- FIXED in `159e7ea5326f4aa929f2169a452ecc68463fe663`: three unrelated active-task
  metadata files lacked their required final newline. The formatter gate found
  the defect. The fix only restores those newlines.
- FIXED in `3c6371e748af28f2319d414297a37d07793eaffe`: the terminal harness waited
  for a child capture file to exist but did not wait for its first bytes. A
  gate run read the file between creation and write. The one-file fix waits
  for nonempty bytes.
- FIXED in task 320: the theme contract still cited the removed
  `src/modules/theme/__tests__/theme.test.ts` path. The evolved record now
  cites live tests and the terminal authority record.
- The supplied [bundle brief](brief-320-1-terminal-pane-fidelity-two-bundle.md)
  has dead task-record links. Both omit the `tasks` path component. I used the
  live task records linked in this report and did not edit the dispatch brief.
- PRE-EXISTING FLAKES: concurrent hook runs timed out in panel split, panel
  chrome, shortcut help, and scrollbar smokes. Panel chrome passed alone in
  about one second. Later clean-start hook runs passed the same smokes, some
  on their built-in retry. The failures moved between harnesses and did not
  follow this change. Examples remain in
  `/tmp/merge-gate-failures.2429060`,
  `/tmp/merge-gate-failures.2510534`,
  `/tmp/merge-gate-failures.2615936`,
  `/tmp/merge-gate-failures.2671545`, and
  `/tmp/merge-gate-failures.2773539`.
- CONTRACT GAP: [scripts/tasks](../../../../scripts/tasks/) owns live dashboard
  rendering policy but has no local invariants record or lattice. Task 321
  records the pane-facing synchronized-output promise in the terminal
  contract. A later design task should decide whether the task renderer needs
  its own contract family.
