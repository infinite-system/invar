# READY — #404 (panel two-row chrome and pane-level add)

Commit: `3000e75594c29e52293a7614e1056df60fb48ee0`

Gate: `GATE_EXIT=0`

## Result

The panel now has a splitter row and a separate outer tab row. Outer tabs create content
containers. The lower Add menu creates full-width window groups inside the selected
container. It offers exactly Terminal, AI Agent (Claude), and Invar Agent.

Add never creates a split. Each new window starts as a full-width singleton group. The
explicit Split button in the pinned right list adds a window to that group. Only one group
is visible at a time. Split members use joined glyphs. Dragging supports group reorder,
member reorder inside a split group, and member detach into a full-width group.

The right list can stay pinned and can be resized. Its width, pin state, group order, split
membership, selected group, and selected member persist per workspace and across relaunch.
Duplicate window types receive unique labels.

The main seams are [PanelHost](../../../worktrees/404-panel-two-row-chrome-and-pane-level-add/src/modules/ui/PanelHost.ts),
[PanelContentsList](../../../worktrees/404-panel-two-row-chrome-and-pane-level-add/src/modules/ui/PanelContentsList.ts),
[PanelTabBar](../../../worktrees/404-panel-two-row-chrome-and-pane-level-add/src/modules/ui/PanelTabBar.ts),
and [PanelWorkspaceState](../../../worktrees/404-panel-two-row-chrome-and-pane-level-add/src/modules/ui/PanelWorkspaceState.ts).
The result follows the [filed task](task-404-panel-two-row-chrome-and-pane-level-add.md),
[windows-not-tabs clarification](brief-404-4-2-windows-not-tabs.md), and
[full-width split-group clarification](brief-404-6-3-full-width-default-split-groups.md).

## Driven evidence

- The default frame placed the splitter on row 22 and outer tabs on row 23.
- The restored editor controls performed Wrap, Go to Line, and Go to Bottom from the shared
  splitter row.
- Two lower Add actions produced groups `[["terminal"],["terminal-2"]]`. Only
  `terminal-2` was visible.
- One explicit Split action produced
  `[["terminal","terminal-3"],["terminal-2"]]` and painted the joined split.
- The pane list stayed pinned at width 20 after focus returned to the body.
- The same drive used the shared 10-line and 100,000-line fixtures. Both kept 15 panel rows,
  the same chrome geometry, the same visible cells, and a quiescent final frame.

The real-path contracts are in the
[panel chrome smoke](../../../worktrees/404-panel-two-row-chrome-and-pane-level-add/scripts/harness/smoke-panel-chrome-harness.ts)
and
[panel split smoke](../../../worktrees/404-panel-two-row-chrome-and-pane-level-add/scripts/harness/smoke-panel-split-harness.ts).

## Verification

- The complete pre-commit merge gate passed with `GATE_EXIT=0`.
- All 65 parallel PTY smokes passed. The three serial jobs and behavioral contracts passed.
- The focused unit run passed 115 tests.
- The invariant checker resolved 1,236 annotations and 231 lattice links with zero problems.
- Positive controls made the tab blank-cell, persisted list-pin, explicit group split, and
  group-reorder checks fail before their correct forms were restored.
- The worktree is clean after commit.

## Bycatch

- The final gate's editor smoke had one starvation-class timeout. Its allowed quiet retry
  passed. The gate recorded the retry as a flake. It did not reproduce again in this gate.
- An earlier gate measured the report-only input-byte p50 at 8.158 ms against its 6.406 ms
  warning line. The final gate measured 4.892 ms and passed. This looks load-sensitive and
  is outside this task.
- The invariant checker reports that “Hierarchical pane rows share one compact indent” in
  [the UI lattice](../../../worktrees/404-panel-two-row-chrome-and-pane-level-add/src/modules/ui/ui.lattice.md)
  has no reference. The final checker reproduced the note.
- The invariant checker reports that “Peer plugins can have different lifetimes” in
  [the plugin invariants](../../../worktrees/404-panel-two-row-chrome-and-pane-level-add/src/modules/plugins/plugins.invariants.md)
  has no annotation. The final checker reproduced the note.
