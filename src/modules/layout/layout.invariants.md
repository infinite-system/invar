# Layout — Invariants

Load-bearing rules for `src/modules/layout/` — the reusable draggable-divider model behind both the
sidebar-width divider and the git-split divider. Stands on `project.invariants.md`. `SplitterModel`
is a pure model: pointer positions in, a bounded size out, no renderable. Records are `provisional`
until the coordinator mounts the bar and drives them through a live divider.

## Reality-based invariants

### A split ratio stays within zero and one

**Invariant:** If the splitter reports in ratio mode, then the reported size is always within [0,1] —
a pane cannot own a negative share of the axis nor more than the whole of it.

**Scope:** `SplitterModel` with `mode: 'ratio'` (the git-split divider); the value read from
`size.value` and delivered to `onSizeChange`. Cells mode is unbounded above by design and out of scope.

**Mechanism:** `clamp` intersects the configured [minimumSize, maximumSize] with [0,1] whenever the
mode is ratio, so a mis-configured bound outside [0,1] cannot leak an out-of-range ratio; the seed in
`get size()` is clamped too, so even an out-of-range `initialSize` starts valid.

**Generates:** the host can multiply the ratio by any axis extent to place the divider without
re-validating the range.

**Evidence:** `SplitterModel.ts` `clamp` pins ratio mode into [0,1]; tests "the ratio stays within
zero and one under an extreme drag" and "ratio never escapes [0,1] even with mis-configured bounds"
drive it past both ends.

**Impossible if true:** a ratio-mode `size.value` observed below 0 or above 1.

**Verification:** `bun test src/modules/layout/SplitterModel.test.ts` — the ratio-mode extreme-drag
cases assert 0 and 1 at the limits.

**Status:** provisional

**Last refined:** 2026-07-21

### A pointer delta converts to size through the axis extent

**Invariant:** If the splitter reports in ratio mode, then dragging the pointer by N cells changes the
ratio by N divided by the axis extent — the cell-to-ratio mapping is arithmetic over the total cells,
not a free parameter.

**Scope:** `SplitterModel` ratio-mode drags; `unitsPerCell` and its use in `dragTo`. In cells mode the
factor is exactly 1 (one dragged cell is one cell).

**Mechanism:** `unitsPerCell` returns `1 / totalExtentCells` in ratio mode; `dragTo` multiplies the
pointer delta by it before applying. A zero-or-negative extent yields a factor of 0, so a ratio drag
with no calibrated extent cannot move rather than dividing by zero.

**Generates:** `setExtentCells` — the host recalibrates the same drag math on a window resize by
updating the extent, with no other change.

**Evidence:** `SplitterModel.ts` `unitsPerCell` and `dragTo`; tests "a cell delta converts to a ratio
delta through the extent" (extent 20 → 0.05/cell) and "setExtentCells recalibrates a ratio drag"
(extent 10 → 0.10/cell).

**Impossible if true:** a 4-cell drag over a 20-cell extent moving the ratio by anything other than
0.2.

**Verification:** `bun test src/modules/layout/SplitterModel.test.ts` — the ratio-mode conversion
tests assert the exact ratio.

**Status:** provisional

**Last refined:** 2026-07-21

## Chosen invariants

### Split arrangement follows panel content order

**Invariant:** If `PanelHost` lays out an explicit split group, then cell spans follow that group's
persisted member sequence. Other groups remain full width and hidden until selected.

**Scope:** The bottom-panel content axis in `PanelHost.split`, `addContentToGroup`,
`moveGroupMember`, and `detachGroupMember`. Cell ratios and the panel's root-slot alignment are
outside this ordering rule.

**Mechanism:** `PanelGroup.contentIds` is the split order. `PanelHost.split` creates it explicitly,
`addContentToGroup` appends a newly created pane, `moveGroupMember` reorders it, and
`detachGroupMember` removes one member into a singleton group. `loadActiveSpace` derives the live
layout from the selected group only.

**Generates:** One ordering rule for explicit split creation, split-member drag reorder, and
drag-out detachment; no automatic split on Add.

**Evidence:** `src/modules/ui/PanelHost.ts`; `src/modules/settings/Settings.ts`;
`src/modules/app/Bootstrap.ts`; `src/modules/ui/PanelHost.test.ts`.

**Impossible if true:** Add changing a one-cell group into a split; a reordered split-member row
disagreeing with the cell spans; a detached member remaining in the visible split.

**Verification:** `bun test src/modules/ui/PanelHost.test.ts
src/modules/ui/PanelContentsList.test.ts && bun scripts/harness/smoke-panel-split-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### Layout slots derive from one configuration

**Invariant:** If RootView places a dock, editor center, bottom-panel splitter, container-tab row, or
panel body edge, then that rectangle comes from one `LayoutModel.resolve` result over the live
layout configuration and viewport; no slot re-derives an edge from a sibling renderable. After a
named layout switch, the nonzero rectangles cover every available layout cell exactly once.

**Scope:** The left primary dock, editor center, right dock, bottom panel, and their splitters in
`RootView`, across dock visibility, sidebar position, panel alignment, and each dock vertical-span
setting; plus the named configurations offered by the command-bar Layouts menu.

**Mechanism:** `LayoutModel` consumes viewport cells, configured widths/heights, visibility, and the
layout settings, then emits every slot rectangle in one coordinate space. The panel allocation
contains a one-row container-tab slot followed by a body that is one row shorter. Center and right
panel alignment select the two surviving horizontal ranges. A visible full-height right dock owns
its columns, so the panel right edge stops at the right-dock splitter. If a dock ends at the panel,
`LayoutModel` emits a remainder slot for its released columns below the splitter; `RootView` paints
that plain slot with the panel background without changing either panel chrome row. A hidden dock
resolves to a zero-area slot. `presets()`
publishes Default, Full-height docks, Centered panel, and Focus as named selections over those same
axes instead of enumerating their Cartesian product. RootView applies the rectangles directly.

**Generates:** Live sidebar-side changes; two visible panel alignments; independent full-height or
ends-at-panel docks; a focus layout with zero-area side docks; four named menu presets; a reserved
right-dock slot that future PaneContent citizens can occupy without new root math; no unpainted
region after switching between named layouts.

**Evidence:** `src/modules/layout/LayoutModel.ts`; `src/modules/layout/LayoutModel.test.ts`;
`src/modules/ui/RootView.ts`.

**Impossible if true:** RootView positioning one slot by reading another slot's laid-out edge; a
configuration change requiring a second panel or dock formula; the bottom panel painting over the
lower rows of a visible full-height right dock; a visible full-height dock slot stopping at the panel
splitter; a hidden dock retaining a nonzero slot; a Layouts menu rebuilt from encoded axis
permutations; named-layout slot areas summing to less or more than the available viewport, or any two
named-layout slots overlapping.

**Verification:** `bun test src/modules/layout/LayoutModel.test.ts` plus the live configuration and
counted named-layout tiling assertions in `bun scripts/harness/smoke-layout-harness.ts`, registered in
`scripts/merge-gate.sh`.

**Status:** provisional

**Last refined:** 2026-07-30

### Layout slot sizes are workspace scoped

**Invariant:** If more than one workspace is open, then each workspace owns its own primary-dock
visibility and width, right-dock visibility, content, and width, and bottom-panel height. Selecting a
workspace shows exactly the values that workspace was left with, and a workspace opened now starts at
the application defaults rather than at whatever another workspace was dragged to.

**Scope:** `LayoutSlots`, `WorkspaceLayout`, `WorkspaceLayoutContributor`, the two dock hosts'
`visible` and `activeId`, and the three splitter drags in `RootView` and `PaneSplitters`. The
remaining `LayoutModelOptions` inputs are application PREFERENCES and stay shared by every workspace:
activity-bar visibility on either side, sidebar position, panel alignment, and both dock vertical
spans. Which content the PRIMARY dock shows is scoped separately, by
`Workspace.primaryPaneContentIdentifier`, because that identifier is also the workspace focus target.

**Components:**
- *One owner per size* — `LayoutSlots` holds the three live sizes. Before it existed two of them sat
  in the settings store beside genuine preferences and the third was a local variable inside the root
  view. A value with no owner cannot be scoped.
- *Scoping is a contribution* — `WorkspaceLayout` is an ordinary `WorkspaceContribution`. It captures
  on `suspended` and restores on `resumed`, the same lifecycle the source-control watcher, the
  language client, and the file tree already ride. No host branch decides what travels.
- *Defaults are captured once* — `WorkspaceLayoutContributor` reads the application defaults at its
  first attachment and never again. Reading them live would restore the leak by another route: widen
  workspace A, open workspace B, and B would be born at A's width because A's width had become the
  default.
- *A drag writes two things with two meanings* — the live slot, which is this workspace's geometry,
  and the settings field, which is the size the next session's workspaces start at. A settings-panel
  edit reaches only the workspace on screen.
- *Restoring geometry never moves the keyboard* — the restore writes dock visibility directly rather
  than through `show()` and `hide()`, which also claim focus. Where the keyboard sits belongs to the
  workspace focus model and is restored by its own path.

**Mechanism:** `Bootstrap` seeds `LayoutSlots` from the settings defaults, wires one
`WorkspaceLayoutSlotPorts` adapter over the slots and the two dock hosts, and registers
`WorkspaceLayoutContributor` on the workspace set once the view exists. `WorkspaceSet.activate`
suspends the outgoing workspace before changing the index and resumes the incoming one afterwards, so
capture always precedes restore.

**Generates:** Per-workspace dock widths and bottom-panel height; a right dock that opens in one
project and stays shut in another; a new project that opens at the user's default geometry; a
splitter drag that stops rewriting every other open project's layout.

**Rejected alternatives:** Keep the sizes in the settings store and snapshot them per workspace in
the host — the settings store would then hold values that are not settings, and every new scoped
value would need another line in a central snapshot. Give the docks their own `PanelContentSet` the
way the bottom panel has one — dock contents are singleton views that project the active workspace,
so a per-workspace content set would empty every dock but the first.

**Evidence:** `src/modules/layout/LayoutSlots.ts`; `src/modules/layout/WorkspaceLayout.ts`;
`src/modules/layout/WorkspaceLayoutContributor.ts`;
`src/modules/layout/WorkspaceLayoutSlotPorts.interface.ts`;
`src/modules/layout/WorkspaceLayout.test.ts`;
`src/modules/layout/WorkspaceLayoutContributor.test.ts`;
`src/modules/app/Bootstrap.ts` (the ports adapter and the registration);
`src/modules/ui/PaneSplitters.ts`; `src/modules/ui/RootView.ts`;
`scripts/harness/smoke-workspace-layout-isolation-harness.ts`.

**Impossible if true:** Widening one project's sidebar widening another project's sidebar; opening a
second project inheriting the first project's dock widths or bottom-panel height; a right dock opened
in one project appearing in the next; returning to a project showing another project's geometry; a
restored layout stealing the keyboard.

**Verification:** `bun test src/modules/layout/WorkspaceLayout.test.ts
src/modules/layout/WorkspaceLayoutContributor.test.ts src/modules/layout/LayoutSlots.test.ts && bun
scripts/harness/smoke-workspace-layout-isolation-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-30

### Default panel height scales with the viewport

**Invariant:** If RootView opens the bottom panel without a user-resized height, then
`LayoutModel.defaultBottomPanelRows` gives it 45 percent of the available layout rows, rounded to a
whole row with a three-row minimum.

**Scope:** The initial `panelHeightRows` in `RootView` and
`LayoutModel.defaultBottomPanelRows`. User drag resizing after the panel opens is outside this
default.

**Mechanism:** The protected `LayoutModel.defaultBottomPanelProportion` owns the one 0.45 default.
`defaultBottomPanelRows` applies that proportion to the current layout height, and RootView calls it
only when constructing the bottom panel.

**Generates:** A useful panel body on compact terminals; proportional panel height from 24 through
50 terminal rows; one subclass seam for changing the product default.

**Evidence:** `src/modules/layout/LayoutModel.ts`;
`src/modules/layout/LayoutModel.test.ts` (`default bottom panel height scales with the viewport`);
`scripts/harness/smoke-layout-harness.ts`.

**Impossible if true:** Every viewport opening the panel at one fixed row count; a 24-row terminal
opening a panel taller than the remaining editor; a later render resetting a user's dragged height.

**Verification:** `bun test src/modules/layout/LayoutModel.test.ts && bun
scripts/harness/smoke-layout-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### Expanded panel overrides only the editor center rows

**Invariant:** If the bottom panel is expanded, then its slot occupies the complete vertical extent
of the editor center, its splitter and editor-center slots have zero height, and both dock
rectangles remain exactly the rectangles resolved from the prior unexpanded panel height.

**Scope:** `LayoutModel.resolve`, `PanelHost.expanded`, and the bottom-panel Expand/Restore control in
`RootView`. Horizontal panel alignment and dock configuration remain governed by the shared layout
configuration.

**Mechanism:** `LayoutModel` first resolves the bounded unexpanded panel and splitter geometry. The
expanded override substitutes only the editor-center, bottom-panel, and bottom-panel-splitter row
slots; dock span calculations continue to use the unexpanded splitter edge. RootView passes the
host's expanded state into that one resolver, while the splitter's retained size remains unchanged
for Restore.

**Generates:** VS Code-style editor-center expansion without covering either dock; a zero-row
splitter while expanded; exact restoration of the user's previous panel height.

**Evidence:** `src/modules/layout/LayoutModel.ts`; `src/modules/layout/LayoutModel.test.ts`;
`src/modules/ui/RootView.ts`; `scripts/harness/smoke-panel-chrome-harness.ts`.

**Impossible if true:** Expansion covering a dock; an ends-at-panel dock changing height; expanded
geometry retaining an editor row or live splitter; Restore choosing a default instead of the prior
height.

**Verification:** `bun test src/modules/layout/LayoutModel.test.ts && bun
scripts/harness/smoke-panel-chrome-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### Each dock stays a bounded minority of the row

**Invariant:** If a dock is visible, then its content width is at most 30 percent of the terminal
row and its complete group is strictly less than the editor center width after every resize. The
editor is the prominent actor, so neither dock group can outgrow it.

**Scope:** `LayoutModel.resolve`, `LayoutModel.maximumPrimaryDockColumns`,
`LayoutModel.maximumRightDockColumns`, both dock `SplitterModel` maxima supplied by `RootView`, and
every content either dock hosts. A complete dock group includes its content, splitter, and activity
bar. The stored `Settings.sidebarWidth` and `Settings.rightDockWidth` values are requests. The layout
clamps what it paints and never rewrites either setting.

**Components:**
- *One bound at each dock group, not per pane* — the rule lives in the layout slots, so every current
  and later dock occupant inherits it with no pane-specific width code.
- *The smaller of two bounds wins* — a fixed share of the whole row, and one column less than an
  even split of the columns the editor center and one complete dock group share. The second bound
  accounts for the other dock group.
- *Both requests survive* — a drag persists the user width; a narrow terminal paints the clamped
  width; a wider terminal gives each dragged width back with no second gesture.

**Mechanism:** `maximumDockContentColumns` applies one proportional content cap and one editor
precedence cap. The editor cap accounts for both groups' fixed chrome. `resolve` clamps both
requested content widths before it places any slot, so every frame and resize re-applies the bounds.
`RootView` passes one `LayoutModelOptions` object to `resolve` and both live splitter maxima, so each
divider stops where its painted dock stops.

**Generates:** A usable editor on an 80-column terminal with both docks open; one width law for every
dock citizen; divider travel that matches paint at each terminal width.

**Rejected alternatives:** A larger fixed default width, which inverts again at the next smaller
terminal. A per-pane width, which each new dock occupant would have to re-derive. Rewriting either
stored width on a narrow terminal, which would destroy the user's dragged width.

**Evidence:** `src/modules/layout/LayoutModel.ts`; `src/modules/ui/RootView.ts`;
`src/modules/layout/LayoutModel.test.ts` (both per-width editor-wider cases and the
requests-survive-a-resize case); `scripts/harness/smoke-layout-harness.ts` (the bounded-minority arm
and the 80-column boot arm).

**Impossible if true:** A dock group painted at least as wide as the editor center at a supported
terminal width; dock content claiming more than 30 percent of the row; a terminal resize leaving a
dock wider than its new bound; a resize rewriting either persisted width setting.

**Verification:** `bun test src/modules/layout/LayoutModel.test.ts && bun
scripts/harness/smoke-layout-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-30

### An unexpanded bottom panel leaves one editor row

**Invariant:** If the bottom-panel splitter reaches its maximum, then the unexpanded layout retains
exactly one editor-center row above the one-row splitter and assigns every remaining center row to
the panel's one-row container chrome and body.

**Scope:** The bottom-panel `SplitterModel` maximum supplied by `RootView` and
`LayoutModel.maximumUnexpandedBottomPanelRows`. Expanded mode is governed separately.

**Mechanism:** The maximum is a live function of the current layout-row count:
`totalRows - minimumEditorRows - bottomPanelSplitterRows`. `SplitterModel` resolves that bound for
construction and every drag clamp, so terminal resize changes cannot preserve a stale limit.

**Generates:** Near-full-height drag at every terminal size; one visible editor sliver; one container
chrome row; a bounded panel body that remains valid across resize.

**Evidence:** `src/modules/layout/LayoutModel.ts`; `src/modules/layout/SplitterModel.ts`;
`src/modules/ui/RootView.ts`; `src/modules/layout/LayoutModel.test.ts`;
`src/modules/layout/SplitterModel.test.ts`; `scripts/harness/smoke-panel-chrome-harness.ts`.

**Impossible if true:** A fixed historical 40-row cap; dragging the splitter above row one; terminal
resize leaving the panel larger than its new maximum.

**Verification:** `bun test src/modules/layout/LayoutModel.test.ts
src/modules/layout/SplitterModel.test.ts && bun scripts/harness/smoke-panel-chrome-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### A reported size never leaves its configured bounds

**Invariant:** If any code path sets the splitter size (construction seed or a drag), then the value it
stores and reports is within [minimumSize, maximumSize].

**Scope:** every write to `size` in `SplitterModel` — the `get size()` seed and `dragTo` via
`applySize`. Both the stored `size.value` and the `onSizeChange` payload.

**Mechanism:** the ONLY size writes route through `clamp`; there is no unclamped setter. `dragTo`
applies the pointer delta to the drag-start anchor and clamps the sum, so a drag can never walk the
size past a bound by accumulation.

**Generates:** the host lays panes out directly from `size` with no bounds re-check; persisted values
reloaded as `initialSize` are re-clamped on the next construction.

**Evidence:** `SplitterModel.ts` `clamp` guards every write; tests "clamps at the maximum", "clamps at
the minimum", and "an out-of-range initialSize is clamped at construction".

**Impossible if true:** a `size.value` outside [minimumSize, maximumSize] after any begin/drag/end
sequence.

**Verification:** `bun test src/modules/layout/SplitterModel.test.ts` — the clamp cases drag far past
each bound and assert the bound value.

**Status:** provisional

**Last refined:** 2026-07-21

### Only a drag in progress moves the size

**Invariant:** If `dragTo` is called while no drag is in progress (before `beginDrag` or after
`endDrag`), then the size does not change and no `onSizeChange` fires.

**Scope:** `SplitterModel.dragTo` and the `dragging` flag; the whole begin/drag/end lifecycle.

**Mechanism:** `dragTo` returns immediately unless `dragging.value` is true; `beginDrag` sets the flag
and re-anchors the pointer and size, `endDrag` clears it. Stray pointer moves outside a drag (the host
routes ALL moves, dragging or not) are therefore inert.

**Generates:** the host can forward every pointer-move to `dragTo` without gating on drag state — the
model gates itself.

**Evidence:** `SplitterModel.ts` `dragTo` guard on `dragging.value`; tests "dragTo before beginDrag is
a no-op" and "endDrag stops tracking — later dragTo calls are ignored".

**Impossible if true:** `size.value` changing from a `dragTo` call issued while `dragging.value` is
false.

**Verification:** `bun test src/modules/layout/SplitterModel.test.ts` — the lifecycle cases assert the
size is untouched outside a drag.

**Status:** provisional

**Last refined:** 2026-07-21

### Size changes flow through the onSizeChange seam

**Invariant:** If a drag changes the reported size to a new value, then `onSizeChange` fires exactly
once with that value; a clamped no-change move fires nothing.

**Scope:** `SplitterModel.applySize` and the `onSizeChange` seam; the host wires it to the Settings
store to persist the divider.

**Mechanism:** `applySize` compares the next size to the current one and returns without notifying when
they are equal, otherwise it stores the value and calls `onSizeChange`. The seam defaults to the
constructor callback and is overridable by a subclass.

**Generates:** the host persists the divider by supplying `onSizeChange`, with no polling of `size`.

**Evidence:** `SplitterModel.ts` `applySize` and `onSizeChange`; tests "fires with the new size on
every change" and "does not fire when the clamped size is unchanged".

**Impossible if true:** the size settling on a new value with no `onSizeChange` call, or a run of
`onSizeChange` calls all carrying the same value.

**Verification:** `bun test src/modules/layout/SplitterModel.test.ts` — the persist-seam cases assert
the exact sequence of notified values.

**Status:** provisional

**Last refined:** 2026-07-21

### The splitter model carries no renderable dependency

**Invariant:** If a module imports `SplitterModel`, then it pulls in no OpenTUI, renderable, or
terminal dependency — the model is plain numbers in and out, so its logic is unit-testable with no TUI.

**Scope:** `src/modules/layout/SplitterModel.ts` imports; the boundary where a future editor would be
tempted to reach for a renderable or hit-testing. The bar, hit-testing, and cursor live in the host
(RootView), not here.

**Mechanism:** the model takes scalar pointer positions and reports a scalar size; it imports only
`ivue` and `vue` (reactivity). Rendering and pointer projection are the host's job, kept out of this
file by construction.

**Generates:** the same model backs BOTH dividers (sidebar width and git split) and runs headless in
the test suite.

**Evidence:** `SplitterModel.ts` imports are `ivue` and `vue` only; `SplitterModel.test.ts` drives the
full API with plain numbers and no renderer.

**Impossible if true:** an `import` of OpenTUI or any renderable/terminal module in `SplitterModel.ts`.

**Verification:** `grep -nE "opentui|Renderable|render" src/modules/layout/SplitterModel.ts` returns
nothing; `bun test src/modules/layout/` runs with no TUI.

**Status:** provisional

**Last refined:** 2026-07-21
