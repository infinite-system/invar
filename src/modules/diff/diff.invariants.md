# Diff — Invariants

Load-bearing rules for `src/modules/diff/`. The module stands on the root bounded-viewport and
appearance-fallback records and the UI scroll-writer and scrollbar-geometry records.

## Reality-based invariants

_None specific to diff rendering. The module consumes terminal viewport, glyph, color, and scroll
geometry constraints recorded by its ancestor contracts._

## Chosen invariants

### Both panes share every aligned row

**Invariant:** If a side-by-side diff renders a row, then both panes resolve that row through the
same `alignedRows` index, with `null` representing the filler side of an addition or deletion.

**Scope:** `DiffAlignment.align`, `DiffView.alignedRowScrollOffset`, and both pane windows rendered
by `DiffView.renderPane`.

**Mechanism:** `DiffAlignment.align` produces one ordered `alignedRows` array. `DiffView` slices
that array once per pane with the same `alignedRowScrollOffset` and viewport size; it never stores
independent vertical offsets for previous and current panes.

**Generates:** synchronized vertical scrolling; one filler row per additive imbalance; stable
line pairing after large insertions and deletions.

**Evidence:** `DiffAlignment.test.ts` pure insert/delete cases and the five-to-five-hundred test;
`DiffView.ts` `renderPane` and `setSharedScrollCoordinate`.

**Impossible if true:** the previous and current panes displaying different aligned-row indices
at the same screen row; a large insertion shifting equal lines onto different screen rows.

**Verification:** `bun test src/modules/diff/` and inspection that both `renderPane` calls read
`alignedRowScrollOffset` without a pane-specific vertical offset.

**Status:** provisional

**Last refined:** 2026-07-21

### Diff panes keep independent find state

**Invariant:** If the base and current diff panes are searched in turn, then each pane retains its
own query, matches, current match, and highlights without changing the other pane's state.

**Scope:** `DiffView.findTarget`, `FindBar.openForTarget`, and per-side highlighting in
`DiffView.renderPane`.

**Mechanism:** Each side owns one `ReadOnlyTextBuffer` and exposes its stable read-only find target.
`FindBar` retains one engine per identifier, while `DiffView` reveals and paints through the side
that supplied the engine.

**Generates:** focused-side Ctrl F; independent base/current searches; simultaneous retained match
highlights; no replace operation against either read-only side.

**Evidence:** `src/modules/diff/DiffView.ts` (`previousTextBuffer`, `currentTextBuffer`,
`findTarget`, `highlightLine`); `src/modules/editor/ReadOnlyTextBuffer.ts` (`findTarget`);
`src/modules/search/FindBar.ts` (`enginesByTargetIdentifier`).

**Impossible if true:** searching current erasing the base query; a base match highlighting current
text; replace mode mutating either diff side.

**Verification:** `bun test src/modules/diff && bash scripts/smoke-markdown.sh`.

**Status:** provisional

**Last refined:** 2026-07-24

### Replace hunks pair before adding fillers

**Invariant:** If one contiguous change hunk contains deleted and added lines, then the first
`min(deleted, added)` pairs are `modified` rows and only the remaining imbalance becomes `added`
or `deleted` filler rows.

**Scope:** change hunks produced by `DiffAlignment.align` between consecutive equal-line anchors.

**Mechanism:** `appendChangedHunk` pairs deleted and added line-number arrays up to
`pairedLineCount`, then emits only the unpaired tail as one-sided rows.

**Generates:** deterministic replacement alignment; real line numbers on both sides of every
`modified` row; fillers only on the shorter side.

**Evidence:** `DiffAlignment.test.ts` replacement cases for both previous-longer and current-longer
hunks.

**Impossible if true:** a replacement hunk emitting an `added` or `deleted` filler while an
unpaired real line still exists on the opposite side.

**Verification:** `bun test src/modules/diff/DiffAlignment.test.ts`.

**Status:** provisional

**Last refined:** 2026-07-21

### Diff rendering stays viewport bounded

**Invariant:** If aligned content exceeds the visible diff body, then each pane highlights and
materializes only the aligned rows and display columns inside the shared viewport, while horizontal
scrollbar geometry depends only on the comparison revision's full-content width and the live
viewport.

**Scope:** `DiffView.renderPane`, `DiffView.sliceLineWindow`, `DiffView.contentWidth`, horizontal
scroll clamping, and horizontal scrollbar sizing.

**Mechanism:** `renderPane` slices `alignment.alignedRows` by `alignedRowScrollOffset` and
`viewportAlignedRowCount`; `sliceLineWindow` crops each real line before `Highlighter` receives it.
Each read-only side loads through `TextDocument`, whose `maximumLineWidth` is computed once per
document revision. `DiffView` takes the maximum of those two caches once when the comparison request
constructs it; a refreshed request constructs a new cache after an edit.

**Generates:** render work bounded by terminal rows and columns; viewport-local syntax
highlighting; one stable full-comparison horizontal extent; a horizontal scrollbar row that cannot
repaint merely because vertical scrolling exposes different lines.

**Evidence:** `DiffView.ts` `renderPane`, `sliceLineWindow`, and `contentWidth`;
`TextDocument.ts` `maximumLineWidth`; `scripts/harness/smoke-scrollbars-harness.ts` compares the
complete horizontal scrollbar row across synchronized vertical-scroll frames and lengthens the
widest line through the editor as a refresh positive control.

**Impossible if true:** one frame highlighting every line in a large diff or tokenizing the full
length of an off-screen line to display one viewport; the horizontal scrollbar row changing while
only the vertical scroll position changes; a refreshed diff retaining the old bar after an edit
lengthens the widest line.

**Verification:** `bun test src/modules/diff src/modules/editor/TextDocument.test.ts && bun
scripts/harness/smoke-scrollbars-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-26

### The editor gutter reflects HEAD changes

**Invariant:** If a normal editor buffer has a git HEAD comparison, then each logical line's first
visual row shows its added, modified, or nearby-deletion status as the same `▎` shape, and the
markers converge after buffer edits, saves, active-document changes, and git reconciliation.

**Scope:** The normal editor in `EditorPaneRenderer`, `GitDocumentState`, and
`GutterDiff.marksByLine`. Excludes the empty editor and `DiffView`, which already renders a diff.

**Mechanism:** `GitWorkspace.refreshDocumentHead` loads the active path
through `GitCommands.fileAtRef` and rejects stale completions.
`GitDocumentState.beginHeadRequest` keeps the last applied HEAD text
authoritative while that request is in flight, and applying identical text
does not advance its decoration revision. An unavailable HEAD is `null` and
produces no projection; a valid tracked empty file remains the distinct `''`.
`GutterDiff.marksByLine` projects
`DiffAlignment.align` rows into a buffer-line map. A deleted run is placed on
the following real line, or the final real line at end of file. When that line
is also modified, modified color wins (`modified` priority exceeds `deleted`)
and the gutter hover retains both `modified` and the deleted line count.

**Generates:** visible working-tree status beside edited lines; one diff algorithm and one git
watcher path for both the side-by-side diff and gutter decorations; one diff-column shape whose
color alone selects added, modified, or deleted.

**Rejected alternatives:** A separate line-diff algorithm or filesystem watcher — either creates a
second authority that can disagree with `DiffAlignment` or `GitWatcher`. An underline for deleted
blocks — it collides with the diagnostic underline vocabulary and makes one gutter column carry two
meanings.

**Evidence:** `src/modules/diff/GutterDiff.test.ts`; `src/modules/git/GitDocumentState.test.ts`;
`scripts/harness/smoke-gutter-diff-harness.ts`; live caller path from `GitWorkspace` through
`GutterDecorations` to `EditorPaneRenderer`.

**Impossible if true:** a continuation row carrying a duplicate marker; an edited tracked line with
no modified-colored gutter glyph after settling; a git reconciliation leaving markers based on the
previous HEAD; a deletion painted as `_` or `▁`; a co-located deletion
disappearing from the hover because modified color won; the normal gutter diff
appearing over `DiffView`; an unchanged background HEAD refresh making a live
gutter marker disappear and reappear.

**Verification:** `bun test src/modules/diff/GutterDiff.test.ts
src/modules/git/GitDocumentState.test.ts && bun
scripts/harness/smoke-gutter-diff-harness.ts`.

**Status:** established

**Last refined:** 2026-07-26

### The overview ruler locates every change block

**Invariant:** If a diff has change blocks beyond or inside the visible window, then the diff view
marks every block's proportional position on the vertical scroll axis without requiring scrolling.

**Scope:** `DiffView.overviewKinds` and `DiffView.synchronizeOverviewRuler` for side-by-side diffs
mounted by `RootView.syncDiffView`.

**Mechanism:** `DiffView.overviewKinds` projects the existing `DiffAlignmentResult.changeBlocks`
intervals onto the vertical scrollbar's track rows in one monotonic pass, then caches that projection
by the immutable alignment and track height. Every unchanged scroll frame reads the cached
viewport-sized result. Active-change tracking independently locates its block with a binary search,
so neither ruler nor toolbar scans all change blocks while gliding. The ruler reads the first aligned
row kind in each overlapping block and uses the same `Palette.added`, `modified`, and `deleted`
colors as the gutters.

**Generates:** a one-cell overview ruler beside the scrollbar; visible top-to-bottom change
distribution; no second diff or scroll authority.

**Rejected alternatives:** Recomputing line differences for the ruler — `DiffAlignment.changeBlocks`
already is the single change-region authority.

**Evidence:** `src/modules/diff/DiffView.test.ts`, including the 100k-row/1,000-block cache cost
ratchet; `scripts/harness/smoke-diff-overview-harness.ts`; live mount
`GitComparisonContent.createComparisonView` to `DiffView.synchronizeOverviewRuler`.

**Impossible if true:** a separated top, middle, or bottom change block existing with no matching
colored ruler cell; an unchanged ruler band painted as a change when it overlaps no change block.

**Verification:** `bun test src/modules/diff/DiffView.test.ts && bun
scripts/harness/smoke-diff-overview-harness.ts`.

**Status:** established

**Last refined:** 2026-07-26

### The diff pane split stays draggable and persistent

**Invariant:** If a user drags the divider between the previous and current diff panes, then both pane
widths change live from one bounded ratio and that ratio is reused by the next diff open.

**Scope:** `DiffView.paneSplitter`, `Settings.diffSplitRatio`, and side-by-side diffs mounted by
`RootView.syncDiffView`.

**Mechanism:** A ratio-mode `SplitterModel` converts captured pointer movement through the live pane
extent. `DiffView` writes every drag tick to `Settings.diffSplitRatio`, derives both widths from that
single value, and saves once when the drag ends.

**Generates:** a one-cell visible grab strip; complementary previous/current widths; live resize;
persisted split geometry across diff instances.

**Evidence:** `src/modules/layout/SplitterModel.test.ts`;
`scripts/harness/smoke-diff-overview-harness.ts`; live caller
`GitComparisonContent.createComparisonView` attaches the shared `Settings` instance to each
`DiffView`.

**Impossible if true:** dragging the divider while the pane widths remain fixed; reopening a diff in
the same session resets a completed split drag to one half; both pane widths growing independently.

**Verification:** `bun scripts/harness/smoke-diff-overview-harness.ts`.

**Status:** established

**Last refined:** 2026-07-21

### Diff selection reuses shared drag behavior

**Invariant:** If text is selected in either read-only diff pane, then its `ReadOnlyTextBuffer`
cursor selection and shared drag-edge behavior extend the underlying pane text while the aligned
diff scrolls.

**Scope:** `SelectionDragBehavior`, `DiffView.createSelectionDragBehavior`, the active read-only
`ReadOnlyTextBuffer`, and Ctrl+C routing in `Bootstrap`, which asks the mounted editor-surface
content whether it owns a selection (`GitComparisonContent.copySelection`) rather than testing a
comparison mode.

**Mechanism:** Both `RootView`'s normal editor and `DiffView` construct `SelectionDragBehavior` with
their own coordinate/scroll callbacks. Diff hit-testing maps an aligned row to its real side line,
stores the range in that side's `ReadOnlyTextBuffer.cursor`, paints it through `SelectableText`,
and copies through `ReadOnlyTextBuffer.copySelection`; filler rows never enter the copied document
range.

**Generates:** per-pane click-drag selection; vertical and horizontal drag-edge autoscroll; exact
underlying-text copy; one pointer-rate and lifecycle rule shared with the editor.

**Rejected alternatives:** A native-only diff selection or a diff-specific selection model —
either can disagree with the shared cursor range that Ctrl+C copies after repaint or scrolling.

**Evidence:** `src/modules/ui/SelectionDragBehavior.test.ts`;
`scripts/harness/smoke-diff-overview-harness.ts`; live callers `RootView` and `DiffView` both
construct `SelectionDragBehavior`.

**Impossible if true:** a diff drag highlight disappearing on repaint; a held bottom-edge drag leaving
the aligned scroll offset unchanged; Ctrl+C copying alignment filler or text outside the model range.

**Verification:** `bun test src/modules/ui/SelectionDragBehavior.test.ts && bun
scripts/harness/smoke-diff-overview-harness.ts`.

**Status:** established

**Last refined:** 2026-07-24

### Base and current stay unambiguous

**Invariant:** If a side-by-side diff is visible, then the left pane is named as the HEAD base, the
right pane is named as the working current file, and Open current is positioned with the right pane
and opens that current path; the hidden buffer-tab row is reclaimed, while adjacent theme-owned
up/down controls navigate changes and identify themselves on hover.

**Scope:** `DiffView.update`, `DiffView.renderHeader`, header-segment hit-testing and tooltip
callbacks, `GitComparisonContent` callbacks, and RootView's buffer-tab height.

**Mechanism:** Pane title rows carry explicit `Base (HEAD)` and `Current (working)` prefixes.
`renderHeader` right-aligns the padded `diffPreviousChange` and `diffNextChange` glyph segments
beside `openFull`; one header hit map dispatches all three, and hover points the shared tooltip at
the navigation segments. RootView assigns the hidden buffer-tab strip zero rows while a contributed
surface owns the editor column. `openFull` resolves and opens the working path.

**Generates:** distinct base/current labels; a spatially associated Open current affordance; compact
previous/next controls with reliable padded hit targets and tooltips; one reclaimed comparison row.

**Evidence:** `scripts/harness/smoke-diff-overview-harness.ts`;
`src/modules/git/GitComparisonContent.ts`; `src/modules/diff/DiffView.ts`.

**Impossible if true:** Open current appearing over the base pane; clicking Open current leaving the
diff open or opening the base revision; both panes carrying labels that do not distinguish their
roles; a blank tab row above the comparison; an unlabeled or reserved navigation mark.

**Verification:** `bun scripts/harness/smoke-diff-overview-harness.ts`.

**Status:** established

**Last refined:** 2026-07-27
