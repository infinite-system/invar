# READY — #404 (panel two-row chrome and pane-level add)

Merge commit: `c951f48d0ac95a34b22c94deb41a23485fcda022`

Parents: `3000e75594c29e52293a7614e1056df60fb48ee0`
and `47325b498af85f44cfab13da44b5d99d962869c9`

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

The merge keeps current main's proportional bounds for both docks, monitoring pane and render-load
attribution, quit-dialog work, watch wrapping, and total layout tiling. The layout model now emits
both dock remainder slots alongside the panel splitter, outer tab row, and panel body.

The main seams are [PanelHost](../../../worktrees/404-panel-two-row-chrome-and-pane-level-add/src/modules/ui/PanelHost.ts),
[PanelContentsList](../../../worktrees/404-panel-two-row-chrome-and-pane-level-add/src/modules/ui/PanelContentsList.ts),
[PanelTabBar](../../../worktrees/404-panel-two-row-chrome-and-pane-level-add/src/modules/ui/PanelTabBar.ts),
and [PanelWorkspaceState](../../../worktrees/404-panel-two-row-chrome-and-pane-level-add/src/modules/ui/PanelWorkspaceState.ts).
The result follows the [filed task](task-404-panel-two-row-chrome-and-pane-level-add.md),
[windows-not-tabs clarification](brief-404-4-2-windows-not-tabs.md), and
[full-width split-group clarification](brief-404-6-3-full-width-default-split-groups.md).
The combined-tree work follows the [merge-round brief](brief-404-8-4-merge-main-and-regate.md).

## Conflict resolutions

- [Panel chrome smoke](../../../worktrees/404-panel-two-row-chrome-and-pane-level-add/scripts/harness/smoke-panel-chrome-harness.ts):
  kept all three editor actions because the separate splitter row removes outer-tab width pressure.
- [Layout invariant record](../../../worktrees/404-panel-two-row-chrome-and-pane-level-add/src/modules/layout/layout.invariants.md):
  combined the two-row panel geometry with dock remainder slots and exact total-layout tiling.
- [RootView](../../../worktrees/404-panel-two-row-chrome-and-pane-level-add/src/modules/ui/RootView.ts):
  kept both remainder renderables and the explicit per-list-item Split callback.

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
- Both dock groups stayed narrower than the editor at 80 and 120 columns. The 80-column
  content widths stayed at or below 30 percent. A wider row restored both saved requests.
- Default, Full-height docks, Centered panel, and Focus each tiled an 80×20 layout exactly
  once. Each result covered 1,600 cells with zero overlap.
- The monitoring pane sampled only while visible, released closed file rows, and attributed
  render requests to named plugins.

The real-path contracts are in the
[panel chrome smoke](../../../worktrees/404-panel-two-row-chrome-and-pane-level-add/scripts/harness/smoke-panel-chrome-harness.ts)
and
[panel split smoke](../../../worktrees/404-panel-two-row-chrome-and-pane-level-add/scripts/harness/smoke-panel-split-harness.ts).

## Verification

- The complete pre-commit merge gate passed with `GATE_EXIT=0`.
- All 65 parallel PTY smokes passed without a retry. The three serial jobs and behavioral
  contracts passed.
- The focused combined-tree run passed 129 tests.
- The invariant checker resolved 1,268 annotations and 231 lattice links with zero problems.
- Positive controls made the tab blank-cell, persisted list-pin, explicit group split, and
  group-reorder checks fail before their correct forms were restored.
- The worktree is clean after commit.

## Bycatch

- The first merge gate's agent-cancel smoke had one starvation-class timeout. Its quiet retry
  passed. The clean final gate passed it on the first attempt.
- The first merge gate's tasks-dashboard contract lost its READY row before the click. The
  exact standalone drive passed, and the clean final full gate passed the contract. No code
  change was needed.
- An earlier gate measured the report-only input-byte p50 at 8.158 ms against its 6.406 ms
  warning line. The final gate measured 4.892 ms and passed. This looks load-sensitive and
  is outside this task.
- The invariant checker reports that “Hierarchical pane rows share one compact indent” in
  [the UI lattice](../../../worktrees/404-panel-two-row-chrome-and-pane-level-add/src/modules/ui/ui.lattice.md)
  has no reference. The final checker reproduced the note.
- The invariant checker reports that “Peer plugins can have different lifetimes” in
  [the plugin invariants](../../../worktrees/404-panel-two-row-chrome-and-pane-level-add/src/modules/plugins/plugins.invariants.md)
  has no annotation. The final checker reproduced the note.
