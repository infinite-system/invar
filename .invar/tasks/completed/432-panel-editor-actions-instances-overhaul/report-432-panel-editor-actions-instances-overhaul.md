# READY: panel, editor actions, and instances overhaul

#432 (panel, editor actions, and instances overhaul) is ready for conductor review.

Task commit: `30c620d9417964d6f7005aab01c49cf5f1ddab98`

Separate bycatch commit: `c5447952779d951bb03f04be54f86d5b1aae89b4`

## Outcome

The panel now follows the confirmed three-layer design.

- The editor bottom border owns document actions. The actions remain present when the panel is closed.
- The thin, subtle splitter starts flush at the panel edge. It owns only expand and close.
- The tab row owns padded, draggable plugin tabs, `+ Plugin`, and the right-aligned instances toggle and count.
- The instances list owns contextual adds, closed connectors, bare rows, and hover-only split and close controls.
- Terminal subwindows put a padded close button on their first content row. Terminal output starts on the next row.
- Terminal close and quit use the new generic dialog. The input-carrying go-to-line prompt subclasses the same model.
- Database can create parallel Database instances. Agent `/exit` and `/quit` replace the Agent with a terminal in the same split slot.
- The new [design contract](../../../worktrees/432-panel-editor-actions-instances-overhaul/design.invariants.md) records the six design rules established by this work.

The main implementation is in [RootView](../../../../src/modules/ui/RootView.ts), [PanelTabBar](../../../../src/modules/ui/PanelTabBar.ts), [PanelContentsList](../../../../src/modules/ui/PanelContentsList.ts), [PanelHost](../../../../src/modules/ui/PanelHost.ts), [Dialog](../../../../src/modules/ui/Dialog.ts), and [DragReorder](../../../../src/modules/ui/DragReorder.ts). The new panel-layer invariant is in [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md).

## Driven evidence

I drove defaults before changes and after changes at both ends of the scale.

- The 10-line and 100,000-line fixtures produced the same 120-column geometry: editor actions on row 21, splitter on row 22, tabs on row 23, a flush drag span from column 37 with width 77 and zero paint padding, and the instances control ending at column 120.
- Tab drag changed the plugin order. `+ Plugin` offered only Terminal and Database. The Database instances add offered only Database and created `database-2` without replacing the first instance.
- The terminal close button opened the generic confirmation and Escape kept the terminal open.
- The instance list hid row controls at rest, showed them on hover, and painted `╭`, `├`, and `╰` across a split family.
- An Invar Agent `/exit` replaced the Agent with a terminal in the same split position.

Markdown action results, observed then fixed:

- Word wrap previously changed the source editor while the preview kept its state. It now changes the preview's Markdown wrapping state.
- Go to line previously targeted the source editor. It now scrolls the preview to the requested source line through the preview mapping.
- Go to bottom previously targeted the source editor. It now moved the preview to scroll top 740 for 772 rendered rows in a 32-row viewport.

## Regression contracts

I extended [the panel chrome smoke](../../../../scripts/harness/smoke-panel-chrome-harness.ts), [the panel split smoke](../../../../scripts/harness/smoke-panel-split-harness.ts), [the terminal smoke](../../../../scripts/harness/smoke-terminal-harness.ts), and the existing workspace and task smokes. Unit coverage includes the generic [Dialog test](../../../../src/modules/ui/Dialog.test.ts) and [DragReorder test](../../../../src/modules/ui/DragReorder.test.ts).

The required positive controls went red and were removed:

- Requiring panel visibility for editor actions failed after panel close.
- Restoring one splitter paint-pad cell timed out on the flush-line condition.
- Removing the tab's trailing pad failed the exact close-padding assertion.
- Using a middle connector for the first row timed out on first-and-last closure.
- Painting row controls without hover failed the hidden-at-rest assertion.

## Verification

- `bun run typecheck`: pass.
- Invariant checker: pass, 1,320 annotations resolved, 263 lattice links resolved, zero problems.
- Focused unit run: 9 tests pass, 30 assertions.
- Panel chrome, panel split, Markdown, terminal, tasks, workspace-layout isolation, and Tasks Dashboard PTY drives: pass.
- Coverage ratchet: pass across 392 inspected files.
- Final `bun run gate`: red overall. Formatting, invariant structure and references, coverage, reactive observations, unit tests, build, all 66 parallel PTY jobs, agent permissions, overlay dialogs, and input-byte ordering passed. Two unrelated blockers remained during that run:
  - The conventions gate reports that `.claude/skills/ui-task` is absent from the [AGENTS skills index](../../../../AGENTS.md).
  - The Tasks Dashboard behavioral drive read a status change before the matching grid paint. It failed both attempts. The separate bycatch commit fixes that condition wait, and the complete standalone Tasks Dashboard drive passes after the fix.
- The panel chrome drive timed out once at the 88-column last-cell drag and passed its built-in retry. The gate classifies that as a flake, not a clean green.
- Worktree state after both commits: clean.

## Bycatch

- PRE-EXISTING: [AGENTS.md](../../../../AGENTS.md) does not list the existing [UI task skill](../../../../.claude/skills/ui-task/SKILL.md). The conventions gate reported this in the first and final gate runs. I did not alter shared repository law inside this UI task.
- FIXED in `c5447952779d951bb03f04be54f86d5b1aae89b4`: [the Tasks Dashboard smoke](../../../../scripts/harness/smoke-tasks-dashboard-harness.ts) trusted right-dock status before the READY row repainted. Both behavioral-contract attempts reproduced it. The smoke now waits for the unique READY row before addressing its session action. A complete standalone drive passed after the fix.
- The final panel chrome run timed out once while waiting for the 88-column drag from the last splitter cell. Its built-in retry passed. It did not reproduce a second time.
- The first gate run's scrollbar smoke needed one starvation retry and then passed. It did not reproduce in the final gate.
- The final behavioral run's first plugin-manifest attempt timed out while waiting for settled Structure scrollbar geometry. The retry passed that drive. It did not reproduce a second time.
