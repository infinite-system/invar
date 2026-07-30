# UI — Invariants

Load-bearing rules for `src/modules/ui/` (`RootView` and the frame it builds). Stands on
`project.invariants.md`. The rendering-mechanism record is `provisional` because the M3 code
drives rendering imperatively; wiring the coarse frame effect promotes it.

## Reality-based invariants

### A scrollable pane height is an input not an output

**Invariant:** If a pane virtualizes its content by rendering only the window that fits its height,
then that height MUST be fixed independently of the pane's own content — viewport-derived, computed,
or pinned. If the layout lets the height derive from the content, the window walk feeds itself
(taller container → wider window → more rendered → taller container) and the fixpoint is the whole
list.

**Scope:** every scrollable/virtualized pane under OpenTUI's Yoga flex layout — the editor code
area, the file tree, the git changes list, and the git commit log.

**Mechanism:** the render window is a function of container height (`GitPaneContent.render` passes
`PaneRenderContext.height` to `GitPaneRenderer.bodyHeight`; the editor reads its host-supplied
viewport height through `SourceTextPaneContent`). A flex chain whose parent sizes to content closes
the loop. Pinning the height (sidebar `width`+`height:'100%'`, `editorArea`
`flexGrow:1`+`height:'100%'`, code area `flexGrow:1`) breaks it. Cross-substrate transfer from the
browser `VirtualScroller` (`min-height:0` / viewport-pinned there) — the reality is substrate-
independent; only the pinning mechanism rebinds (CSS flex → Yoga flex).

**Generates:** a stable render window; bounded per-frame cost while scrolling.

**Evidence:** all scrollable panes derive their window height from a pinned ancestor, never from
content. Upheld. (In the browser host this ran away to 2,565→5,265 items in 12s behind a
content-sized container — the impossibility this predicts.)

**Impossible if true:** a scrollable pane whose height derives from its own rendered content (the
window diverges toward the full list).

**Verification:** review — every scrollable pane's height traces to a viewport-pinned ancestor;
a FrameProbe check that rendered-row count stays bounded while wheel-scrolling a large log.

**Status:** established

**Last refined:** 2026-07-21

## Chosen invariants

### Status text is assembled from ordered contributions

**Invariant:** If text appears in the status bar, then it comes from an ordered
`StatusBarSegmentContribution`; the status host joins segments without naming their domains and
owns the row's one-cell left margin.

**Scope:** `StatusBarSegments`, `CoreStatusBarSegments`, the source-control blame segment, and
`StatusBar`.

**Mechanism:** Core registers its ordinary workspace/editor segments and plugins register their
segments during application activation. `StatusBar` supplies a generic context, joins the registry
result, and prefixes one space. Segments carry no private leading margin. The source-control blame
segment starts with the tiered `statusUser` glyph, one space, then its author and date.

**Generates:** Existing non-plugin status text and plugin-owned blame text through one projection
surface; project and author rows aligned by one margin authority; icon, space, and author cells
that stay stable across glyph tiers.

**Evidence:** `StatusBarSegments.ts`; `CoreStatusBarSegments.ts`; `StatusBar.ts`;
`GitPlugin.ts` `segments`.

**Impossible if true:** `StatusBar` importing or querying a concrete plugin controller; plugin
status text requiring a new host field or rendering branch.

**Verification:** `bun test src/modules/ui/StatusBarSegments.test.ts
src/modules/ui/CoreStatusBarSegments.test.ts src/modules/git/GitPlugin.test.ts`.

**Status:** established

**Last refined:** 2026-07-26

### Plugin panes use the shared pane and popup hosts

**Invariant:** If a plugin contributes a pane or bounded selection popup, then it registers
`PaneContent` with `PanelHost` and uses `BoundedListPopup` or `ContextMenu`; the root view and input
router remain domain-agnostic.

**Scope:** The primary dock, `PaneContent`, `PanelHost`, `BoundedListPopup`, `ContextMenu`, the file
tree pane, and the source-control pane and branch selector.

**Mechanism:** `ActivityBar`, `Sidebar`, and `RootView` project and route only the active
`PaneContent`. `GitPaneContent` owns its rendering and pointer behavior and asks the existing popup
hosts for branch and row actions.

**Generates:** File-tree and plugin panes on one host; buffer selection and branch selection on one
bounded-popup implementation; no parallel plugin pane stack.

**Evidence:** `PaneContent.interface.ts`; `PanelHost.ts`; `RootView.ts`; `Sidebar.ts`;
`src/modules/filetree/FileTreePaneContent.ts`; `GitPaneContent.ts`.

**Impossible if true:** A plugin pane requiring a domain-specific branch in `RootView`, `Sidebar`,
or `ActivityBar`; a plugin implementing independent popup placement, filtering, and row hit tests.

**Verification:** `bun test src/modules/ui/PanelHost.test.ts
src/modules/git/GitPaneContent.test.ts && bash scripts/smoke-activitybar.sh`.

**Status:** established

**Last refined:** 2026-07-26

### One painter draws every single-line text field

**Invariant:** If a single-line text field is painted, then `TextFieldPainter` draws its visible text
window, its selection, its caret cell, and its state tone: the caret sits at the field's
`TextInputModel` caret and is drawn by INVERTING the cell it occupies, selected graphemes use the
shared selection tone, and the field tone is one of `idle`, `focused`, or `hovered`, with the focus
tone quieter than the hover tone.

**Scope:** `BoundedListPopup`'s search row, the command-palette and Quick Open inputs in
`OverlayLayer`, the query and replacement fields in `FindBarRenderer`, and the database connection
path in `DatabasePaneContent`, and the structure filter in `StructurePaneRenderer`. The editor body
caret (projected as the terminal's own hardware cursor) and the multi-line wrapping `AgentComposer`
are outside this rule — a wrapping surface resolves its caret through a row mapping, not a one-line
window.

**Components:**
- *Caret cell* — `TextInputModel.valueBeforeCaret` measured by `TextCoordinates.lineWidth` gives the
  caret's display column; the grapheme at the caret (a space at end-of-text) is the inverted cell.
- *Selection tone* — `TextInputModel.selectionRange` supplies one grapheme range;
  `TextFieldPainter.selectionToneFor` maps it to the theme selection and accent colours.
- *State tone* — `TextFieldPainter.toneFor` maps `idle`/`focused`/`hovered` to one palette pair;
  `stateFor` decides that hover outranks focus.
- *Fixed geometry* — the caret cell is always emitted and only recoloured, so a field's painted width
  and text window are identical in every state.

**Mechanism:** `TextFieldPainter.paint` takes the input MODEL, never a caret index, so a painted caret
cannot be re-derived from string length; every column it computes goes through `TextCoordinates`, so
a wide or East-Asian grapheme moves the caret by display cells. It segments the visible window at
selection boundaries without changing its width. Inverting a cell costs no column and needs no
glyph, so the caret shifts nothing and adds no appearance literal — the same reduction
`SolidThumbScrollBar` made for thumbs. `toneFor` reads `border`/`dim`, `cursorLine`/`fg`, and
`accent`/`panel`: idle recesses below `panel`, focus lifts one step above it while brightening the
text, and only hover uses the theme's vivid colour, so hierarchy stays carried by text brightness as
`ThemePalettes` documents. The caret is STEADY — a blinking caret would request frames forever and
break the `idle-quiescence` contract in `scripts/behavioral-contracts.sh`.

**Generates:** A visible caret and selection in every one-line field; a focused field distinguishable
from an idle one; hover retained where a field is a pointer target; one caret and selection painter
instead of per-surface implementations; a field that can gain a state without touching its
consumers.

**Rejected alternatives:** Insert a bar glyph at the caret (what the palette, Quick Open, and Find bar
did) — it shifts every cell after the caret and mints a glyph literal outside the theme. Blink the
caret on a timer — it would request frames at rest and break idle-quiescence. Give the modal dialog
inputs the full three-tone state — they are always the focused field and are never hover targets, so
two of the three states would be unreachable decoration.

**Evidence:** `src/modules/ui/TextFieldPainter.ts`; `src/modules/ui/TextFieldPainter.test.ts` (caret at
the model offset, end-of-text caret, wide-glyph columns, identical geometry across the three states,
tone ordering, selection range); consumers `src/modules/ui/BoundedListPopup.ts`,
`src/modules/ui/OverlayLayer.ts`, `src/modules/ui/FindBarRenderer.ts`,
`src/modules/database/DatabasePaneContent.ts`, `src/modules/structure/StructurePaneRenderer.ts`;
`scripts/harness/smoke-field-caret-harness.ts` (caret at the
published `boundedListPopupQueryCaretCell` through typing, word movement, word deletion, and a pasted
wide-glyph query; three distinct observed backgrounds);
`scripts/harness/smoke-text-input-harness.ts` (the inverted caret cell in open-project, the palette,
and find).

**Impossible if true:** A focusable one-line field with no visible caret; a focused field painted
identically to an idle one; a hover highlight lost because a field became focusable; a caret column
derived from string length drifting on a wide glyph or emoji; a caret that widens its field or shifts
the text after it; a selected input range that paints as ordinary field text; a caret that requests
frames while the app is at rest.

**Verification:** `bun test src/modules/ui/TextFieldPainter.test.ts && bun
scripts/harness/smoke-field-caret-harness.ts && bun scripts/harness/smoke-text-input-harness.ts &&
bun scripts/harness/smoke-database-harness.ts && bash scripts/behavioral-contracts.sh`

**Status:** provisional

**Last refined:** 2026-07-29

### Bounded list popups share paint and hit geometry

**Invariant:** If a bounded list popup is drawn and accepts pointer input, then one
`BoundedListPopupGeometry` determines its box bounds, optional search row, visible list window,
per-row icon column, scrollbar rectangle, and screen-row-to-item mapping for both painting and
hit-testing.

**Scope:** `BoundedListPopup` and its buffer-count, Git-log branch-selector, and caret-completion
adapters.

**Mechanism:** `BoundedListPopup.layoutGeometry` produces the geometry stored for the current paint.
The list renderer slices from its `firstVisible` and `listRows`; the vertical-only
`ScrollableTextViewport` receives the same list rectangle; and pointer selection calls
`filterIndexAtRow` with that stored geometry. `nextEnabledFilteredIndex` wraps through the current
filtered matches and `revealSelectedIndex` moves that same window. The optional search row delegates
its window, caret, and idle/focused/hovered tone to `TextFieldPainter` and publishes the painted caret
cell as `queryCaretCell`, while the modal popup remains the query-input owner across list-row hover
repaints. Row text comes from the one `itemRowText` generator, whose icon cell is `listIconColumns`
wide on EVERY row — the widest icon in the item set, so a two-cell pictograph widens that shared
column instead of pushing one row's label out of the column its neighbours established. Consumer
adapters provide item labels, icons, selection, and actions but never calculate popup rows, columns,
or query focus. Completion hides the search row and backdrop, anchors at the laid-out editor caret,
and prefilters only when its typed prefix changes; each paint slices cached matches to the geometry's
visible window.

**Generates:** window-edge clamping and upward opening; a bounded visible window over arbitrarily
large lists; wheel momentum and a solid vertical thumb; pointer and keyboard selection that agree
with the row on screen.

**Evidence:** `src/modules/ui/BoundedListPopup.ts`; `src/modules/ui/CompletionPopup.ts`;
`src/modules/ui/BoundedListPopup.test.ts`; `scripts/harness/smoke-bounded-list-popup-harness.ts`.

**Impossible if true:** a painted row selecting a different item; a popup or scrollbar extending
through the terminal bottom edge; two rows in one list starting their labels in different columns; a
consumer reimplementing placement, visible-window, row-hit, icon-column, or wrap math; list hover
diverting typed query characters to the editor; a completion paint walking all 1,000+ source items.

**Verification:** `bun test src/modules/ui/BoundedListPopup.test.ts && bun
scripts/harness/smoke-bounded-list-popup-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-26

### List interactions inspect only visible rows

**Invariant:** If a bounded list item set and query are unchanged, then move, scroll, hover, accept,
and paint work is bounded by the visible rows and does not grow with the number of items.

**Scope:** `BoundedListPopup`, `CompletionPopup`, and every adapter on that seam. A query change may
filter and build enabled navigation once; a previously unseen immutable item-set identity may scan
labels once for exact box width.

**Mechanism:** `BoundedListPopup` caches exact maximum label width by immutable item-set identity,
precomputes enabled-index navigation during the permitted match pass, supplies cached extent values
to `ScrollableTextViewport`, and slices only `firstVisible..listRows` during paint. Completion marks
its source-filtered items so the popup does not run a second fuzzy filter.

**Generates:** Item-count-independent movement, wheel, hover, accept, and repaint; exact widest-label
layout; one source filter per query change; zero language requests or filters during movement.

**Rejected alternatives:** Add a lazy or paged item source — items already arrive as an in-memory
array and the measured interaction cost comes from a width rescan, not materialization. Estimate
width from visible rows — the popup box changes width while scrolling and violates the widest-label
layout contract.

**Evidence:** `src/modules/ui/BoundedListPopup.ts`;
`scripts/harness/measure-completion-list-latency.ts` measured popup-update medians at
0.069/0.069/0.068 ms for 10/1,000/5,000 items after the fix;
`scripts/harness/smoke-completion-harness.ts` counts requests and filters.

**Impossible if true:** Movement or wheel popup-update time increasing with item count; a full label
scan in `update`, extent, move, scroll, hover, or accept; any language request or refilter caused by
selection movement or scrolling.

**Verification:** `bun test src/modules/ui/BoundedListPopup.test.ts
src/modules/ui/CompletionPopup.test.ts && bun scripts/harness/smoke-completion-harness.ts && bun
scripts/harness/measure-completion-list-latency.ts`

**Status:** provisional

**Last refined:** 2026-07-26

### Bounded list interactions live in one popup

**Invariant:** If a bounded searchable list needs filtering, wrapped selection, pointer activation,
keep-open activation, drill-forward, or backward navigation, then `BoundedListPopup` supplies that
behavior and each consumer supplies only its items and domain action.

**Scope:** Every `BoundedListPopup` adapter, including buffer selection, branch selection, layouts,
panel creation, completion, and hierarchical pickers. Domain-specific item discovery and the action
performed for a selected leaf remain in the adapter.

**Mechanism:** `BoundedListPopupItem.keepOpenOnSelect` controls dismissal at the one activation
chokepoint used by Enter and pointer release; `drillable` gates Right; `pinnedWhileQueryEmpty` marks
a browsing row that leads the empty-query list and is never scored; `icon` fills the shared icon
column; the optional `navigateBackwardHandler` receives Left and the activation of a pinned parent
row; and `replaceItems` atomically re-roots items, selection, title, viewport, and query.
`BreadcrumbPicker` only maps filesystem entries into those options — resolving each row's mark
through the same `Theme.icon` the file tree uses — and opens a selected file.

**Generates:** One modal input route; one query editor; one wrapped selection model; hierarchical
drill navigation that any list adapter can opt into without another popup or input branch.

**Rejected alternatives:** Keep a breadcrumb-specific popup open by bypassing activation dismissal —
duplicates the popup state machine and makes keyboard, pointer, filtering, and outside dismissal
drift.

**Evidence:** `src/modules/ui/BoundedListPopup.ts`;
`src/modules/ui/BreadcrumbPicker.ts`; `src/modules/ui/BoundedListPopup.test.ts`;
`scripts/harness/smoke-bounded-list-popup-harness.ts`.

**Impossible if true:** A hierarchical list consumer implementing its own popup, query editor,
wrapped selection, or dismissal rules; Right and pointer activation reaching different selected
items; a keep-open activation resetting items without resetting the requested query and viewport.

**Verification:** `bun test src/modules/ui/BoundedListPopup.test.ts
src/modules/ui/BreadcrumbPicker.test.ts && bun
scripts/harness/smoke-bounded-list-popup-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-26

### Popup hierarchy is mouse and keyboard reachable

**Invariant:** If a bounded popup exposes upward hierarchy navigation, then its parent operation is a
`..` ROW at the head of the list — Enter on that row, a click on that row, and Left invoke one
backward operation — and that row is absent when no parent is reachable.

**Scope:** `BoundedListPopup` adapters that provide `navigateBackwardHandler`, currently
`BreadcrumbPicker`. Flat popup adapters and the breadcrumb popup at the workspace root offer no
parent row.

**Components:**
- *Shared operation* — Enter on the `..` row, a pointer release on it, and Left all reach
  `BoundedListPopup.navigateBackward` and from there the one `BreadcrumbPicker.navigateBackward`.
- *Honest root* — the row exists only where `parentDirectoryOf` resolves a confined parent, so the
  workspace-root list contains no `..` entry at all.
- *Browsing not searching* — the row is pinned to the head of the list while the query is empty and
  gone once the user types; it is never fuzzy-scored, and selection never comes to rest on it.
- *Directory continuity* — moving up keeps the popup open, clears the old directory query, and
  selects the directory just left.

**Mechanism:** `BreadcrumbPicker.itemsForDirectory` prepends one synthetic item carrying
`pinnedWhileQueryEmpty`, `keepOpenOnSelect`, and the folder icon its sibling directories wear.
`BoundedListPopup.filterItems` puts pinned items ahead of the scored matches on an empty query and
drops them entirely on a non-empty one, and `firstEnabledFilteredIndex` skips pinned rows so the
resting selection is always a real entry. Because `..` is an ORDINARY list row, Enter and pointer
release already share the single `runFilteredIndex` activation chokepoint, and
`BreadcrumbPicker.activateItem` routes its identifier into the same `navigateBackward` generator the
Left key calls. That generator resolves the parent through `parentDirectoryOf` and calls
`replaceItems` with `resetQuery: true` and the previous directory identifier.

**Generates:** Keyboard reachability through the Up/Down/Enter the user already uses, with no second
chord; mouse reachability with no separate hit region, paint, or hover state; identical published
folder, row, and selection state after Enter on `..`, a click on `..`, or Left; a root popup with no
dead row.

**Rejected alternatives:** A one-cell chrome control beside the search input (shipped and replaced on
2026-07-26) — a second navigation model with its own hit region, paint, and discoverability problem,
reachable by mouse only. Give the row a breadcrumb-specific re-root path — keyboard and mouse can
drift in folder, query, selection, or dismissal behavior. Keep the row at the workspace root — it
looks actionable while having no valid operation. Fuzzy-score `..` like a file — a query containing
`.` would leave a browsing affordance competing for rank inside a search result.

**Evidence:** `src/modules/ui/BoundedListPopup.ts`; `src/modules/ui/BreadcrumbPicker.ts`;
`src/modules/ui/BreadcrumbPicker.test.ts`; `src/modules/ui/BoundedListPopup.test.ts`;
`scripts/harness/smoke-bounded-list-popup-harness.ts`.

**Impossible if true:** Enter, a pointer release, or Left publishing different folders, rows, or
selections; an upward activation dismissing the popup; the old directory query surviving a re-root; a
`..` row at the workspace root; a typed query leaving `..` among the offered rows; the resting
selection landing on `..`.

**Verification:** `bun test src/modules/ui/BoundedListPopup.test.ts
src/modules/ui/BreadcrumbPicker.test.ts src/modules/theme/ThemeIcons.test.ts && bun
scripts/harness/smoke-bounded-list-popup-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-26

### Panel controls share paint and hit geometry

**Invariant:** If the bottom panel paints an editor action or Add, Expand/Restore, or Close, then one
row projection determines the displayed segments and the screen columns that activate them. Editor
actions yield first at narrow widths, while at least one draggable separator cell remains between
them and the right controls.

**Scope:** `PanelHeading`, the panel-level separator bar and generic headed panel cells in
`RootView`, and the `PanelAddPopup` adapter. The contents-list row controls and status-bar buttons
are outside this rule.

**Mechanism:** `PanelSeparatorRow.project` reserves the right controls and one drag cell before it
admits whole three-cell editor actions contributed through `CommandRegistry.actionsForSurface`.
It returns action paint, action hit segments, and the action/drag/control rectangles together.
`PanelHeading.project` clips its optional title around the requested right-aligned
control segments and returns their exact half-open column ranges, semantic glyph slots, tooltip
labels, and `StyledText`; `controlSegmentAtColumn` resolves pointer input and hover only from those
ranges. RootView retains both projections and points the shared `Tooltip` at each segment. Hover
uses `palette.cursorLine`; Close uses `palette.fg`, not `palette.error`. Panel-level Add opens the
shared bounded list, Expand toggles the host layout override, and Close hides the whole panel without
disposing its contents. Editor actions dispatch by command id. A pane Close removes only that cell's
owned content.

**Generates:** Editor buttons followed by an always-present drag segment and stable panel actions;
close-only pane headings that survive cell resizing; identical paint and pointer boundaries;
tooltips and hover highlights for every control; one shared dropdown implementation; distinct
whole-panel and individual-pane close actions.

**Evidence:** `src/modules/ui/PanelSeparatorRow.ts`; `src/modules/ui/PanelSeparatorRow.test.ts`;
`src/modules/ui/PanelHeading.ts`; `src/modules/ui/PanelAddPopup.ts`;
`src/modules/ui/RootView.ts`; `src/modules/ui/PanelHeading.test.ts`;
`src/modules/ui/PanelAddPopup.test.ts`; `scripts/harness/smoke-panel-chrome-harness.ts`.

**Impossible if true:** A zero-width drag segment; an editor action surviving while the drag segment
disappears; a painted control column invoking a neighboring action; a narrow heading
leaving an invisible clickable control; Add reimplementing popup placement or row-hit math; Close
targeting whichever content happens to be active instead of the headed region; a hovered control
changing an un-hovered sibling; Close painting in the theme error color.

**Verification:** `bun test src/modules/ui/PanelSeparatorRow.test.ts
src/modules/ui/PanelHeading.test.ts
src/modules/ui/PanelAddPopup.test.ts && bun scripts/harness/smoke-panel-chrome-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-29

### Panel content order is one persisted sequence

**Invariant:** If open panel content is reordered, then `Settings.panelContentOrder`,
`PanelHost.order`, the docked contents rows, and the left-to-right split all expose that same
sequence immediately and after restart.

**Scope:** The bottom `PanelHost`, `Settings.panelContentOrder`, `PanelContentsList`, and the
terminal-agent split. Other `PanelHost` instances are outside this persisted bottom-panel order.

**Mechanism:** `Bootstrap` injects the `Settings.panelContentOrder` ref and `Settings.save` callback
into `PanelHost`. `PanelHost.moveContentTo` mutates that ref once, rebuilds `layout` from it, and
persists; `PanelContentsList.rows` and `PanelHost.split` read the same order. `PanelContentsList`
delegates its pointer lifecycle to `ContentOrderDrag`.

**Generates:** Live drag reorder; Alt+Up and Alt+Down reorder; restart persistence; the agent-first
default `['agent', 'terminal']`.

**Evidence:** `src/modules/ui/PanelHost.ts`; `src/modules/ui/PanelContentsList.ts`;
`src/modules/settings/Settings.ts`; `src/modules/ui/PanelContentsList.test.ts`;
`scripts/harness/smoke-panel-split-harness.ts`.

**Impossible if true:** A list row moving without its split cell moving; a keyboard reorder and drag
reorder producing different sequences; a second boot on the same HOME restoring the old order.

**Verification:** `bun test src/modules/ui/PanelHost.test.ts
src/modules/ui/PanelContentsList.test.ts src/modules/settings/Settings.test.ts && bun
scripts/harness/smoke-panel-split-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### Activity bar order is one persisted sequence

**Invariant:** If dock content is registered, removed, reordered, moved between docks, or registered
again, then the activity surface derives membership from registered `PaneContent` across every dock
and order from
`Settings.primaryDockContentOrder`.

**Scope:** `ActivitySurface`, every dock `PanelHost`, both `ActivityBar` projections,
`Settings.primaryDockContentOrder`, plugin registration and removal, pointer drag reorder, and
activity-context Alt+Up or Alt+Down reorder.
Bottom-panel session removal remains governed by *Panel content order is one persisted sequence*.

**Mechanism:** `Bootstrap` injects one `Settings.primaryDockContentOrder` into both dock hosts with
dormant-id retention and into one `ActivitySurface`. The surface unions the hosts' registered
contents and resolves them through that shared sequence. `PanelHost.orderedContents` filters
unregistered identifiers without deleting them, registration appends only unseen identifiers, and
`ActivitySurface.moveContentTo` writes one persisted sequence. Both activity bars delegate pointer
state to `ContentOrderDrag` over that surface.

**Generates:** Stable icon slots across plugin disable and re-enable; deterministic end insertion for
new plugins; inert missing identifiers; drag reorder; Alt+Up and Alt+Down reorder; restart
persistence.

**Evidence:** `src/modules/settings/Settings.ts`; `src/modules/ui/PanelHost.ts`;
`src/modules/ui/ContentOrderDrag.ts`; `src/modules/ui/ActivityBar.ts`;
`src/modules/app/Bootstrap.ts`; `src/modules/ui/PanelHost.test.ts`;
`scripts/harness/smoke-activitybar-harness.ts`.

**Impossible if true:** Disabling and re-enabling a plugin moves its activity icon; an unregistered
identifier paints a gap or crashes; a newly registered identifier appears before a known identifier;
drag and keyboard reorder produce different persisted sequences; restart restores an older order.

**Verification:** `bun test src/modules/settings/Settings.test.ts src/modules/ui/PanelHost.test.ts
src/modules/ui/ContentOrderDrag.test.ts src/modules/keybindings/KeybindingDefaults.test.ts && bun
scripts/harness/smoke-activitybar-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-29

### A contributed dock side moves one live pane

**Invariant:** If a plugin registers `PaneContent` through `registerDockContent`, then its
`<pane>.dockSide` setting is `left | right`, starts at the plugin's suggested side, and moves that
same live content instance to the selected dock. Visibility and the one focus claim follow a visible
pane. Uninstall removes the pane from whichever side owns it then.

**Scope:** `ApplicationContributionContext.registerDockContent`, contributed settings,
`PanelHost.moveContentToHost`, Structure, Tasks, and plugin uninstall.

**Mechanism:** `ApplicationContributions` contributes the enum setting and closes one registration
handle over its current host. The setting's change callback asks the source `PanelHost` to detach the
content without disposal and register it on the target host. The returned handle resolves show,
reveal, visibility, blur, and default-visibility actions against the current host. The activation
disposer also resolves the current host late.

**Generates:** Plugin-suggested defaults; live right-to-left and left-to-right moves; the same pane
state after a move; no fallback pane revealed in the source dock; uninstall symmetry on both sides.

**Evidence:** `src/modules/app/ApplicationContributions.ts`;
`src/modules/app/ApplicationContributor.interface.ts`; `src/modules/ui/PanelHost.ts`;
`src/modules/structure/StructurePlugin.ts`; `src/modules/tasks-dashboard/TasksDashboardPlugin.ts`;
`src/modules/app/ApplicationContributions.test.ts`; `src/modules/ui/PanelHost.test.ts`;
`scripts/harness/smoke-activitybar-harness.ts`.

**Impossible if true:** A side change disposes and rebuilds the pane; the old and new hosts both
register it; a visible move reveals an unrelated fallback in the old host; a command still targets
the plugin's suggested side after the user moves it; uninstall leaves an activity entry behind.

**Verification:** `bun test src/modules/app/ApplicationContributions.test.ts
src/modules/ui/PanelHost.test.ts src/modules/settings/Settings.test.ts && bun
scripts/harness/smoke-activitybar-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-29

### The panel contents list mirrors open content

**Invariant:** If the bottom panel owns more than one registered content session, then its right edge
shows exactly one docked row per session with icon, instance title, visible state, activation, drag
reorder, and close actions; if one session remains, the list is absent.

**Scope:** `PanelContentsList`, its `RootView` renderable, and registered contents in the bottom
`PanelHost`. Popup lists and other panel hosts are outside this rule.

**Mechanism:** `PanelContentsList.rows` projects `PanelHost.orderedContents` and marks each row by
`isContentVisible`. `PanelContentsList.pointerDown` and `pointerDrag` delegate selection, close, and
reorder to `PanelHost`; selecting a hidden instance replaces the visible instance of the same kind
while preserving another kind's split cell, and close unregisters and disposes the selected session.
The row close, panel-heading close, and tab close all read the `panelClose` slot from the active
`InterfaceGlyphVocabulary`; no consumer restates a close character.
Panel-context keybindings delegate to the same host methods. `RootView` requests both the immediate
frame and a next-turn `RenderRequest`, so a queued frame cannot coalesce away the projection that
publishes the closed session list.

**Generates:** VS Code-style docked session rows; visible and hidden instances in one list; per-row
close affordances that match tabs and panel headings in every glyph tier; mouse and keyboard parity
without a second content registry.

**Rejected alternatives:** Use `BoundedListPopup` — a modal popup does not remain docked beside panel
content and cannot continuously mirror the open split.

**Evidence:** `src/modules/ui/PanelContentsList.ts`; `src/modules/ui/RootView.ts`;
`src/modules/ui/RenderRequest.ts`; `src/modules/ui/RenderRequest.test.ts`;
`src/modules/keybindings/KeybindingDefaults.ts`; `src/modules/ui/PanelContentsList.test.ts`.

**Impossible if true:** The list showing with one registered session; two registered sessions
producing one or three rows; hiding an instance removing its row; a close row retaining its backend;
a drag updating only presentation; a close mutating the host while the published session list remains
stale because its render request was coalesced into an in-flight frame; a list row, tab, or panel
heading drawing a different close glyph for the same active tier.

**Verification:** `bun test src/modules/ui/PanelContentsList.test.ts
src/modules/ui/RenderRequest.test.ts && bun
scripts/harness/smoke-panel-split-harness.ts && bun
scripts/harness/smoke-panel-chrome-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-27

### Completion reuses bounded popup geometry

**Invariant:** If completion is visible, then its placement, flip, visible window, scrollbar, pointer
hit mapping, and wrapped keyboard selection come from `BoundedListPopup`; completion supplies only a
caret anchor, prefix-filtered items, and acceptance behavior.

**Scope:** `CompletionPopup`, its `RootView` caret anchor, and completion input routing in Bootstrap.

**Mechanism:** The adapter owns a separately identified `BoundedListPopup`, opens it without the
modal backdrop or search row, and updates its cached items after one cheap prefix pass. The editor
keeps keyboard focus; completion consumes only Up, Down, Enter, Tab, and Escape.
`BoundedListPopup.close` advances the same `paintRevision` Ref that open and selection changes use,
and `Bootstrap` uses `RenderRequest.afterCurrentTurn` when dismissal races the still-queued opening
frame, so the closed state reaches both the terminal and `status.completionOpen`.

**Generates:** Caret-relative downward placement with upward flipping, O(viewport) paint, wrapped
selection with reveal, continuous editor typing, exact text-edit acceptance, and kind marks for free —
the popup's items carry an `icon`, so the shared row generator already sizes and paints a mark column
that every bounded-list consumer got at once.

**Evidence:** `src/modules/ui/CompletionPopup.ts`; `src/modules/ui/BoundedListPopup.ts`
(`itemRowText`, `itemSetIconColumns`, and the published `listIconColumns`, which a driven contract
addresses instead of counting cells); `src/modules/ui/RootView.ts`; `src/modules/app/Bootstrap.ts`.

**Impossible if true:** A second completion-specific popup geometry implementation; a completion
search row; a completion-specific mark column measured outside the shared row generator; an invisible
modal backdrop that steals editor input; full-list work during repaint; Escape closing the model while
`status.completionOpen` remains true.

**Verification:** `bun test src/modules/ui/CompletionPopup.test.ts
src/modules/ui/BoundedListPopup.test.ts` and `bun scripts/harness/smoke-completion-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-26

### Splitter paint and hit testing share one geometry

**Invariant:** If a pane boundary is resizable, then one `SplitterElement` owns its one-cell
cross-axis geometry, pointer hit target, hover state, drag capture, and palette state; the cell that
paints is the cell that receives the pointer. A horizontal boundary paints only the lower half of
that hit cell, through the same appearance source as a horizontal scrollbar.

**Scope:** Every pane splitter in `RootView`, `DiffView`, and `MarkdownSplitView`, including the
sidebar, bottom panel, git regions, split panel cells, diff panes, markdown preview, and right dock.

**Mechanism:** `SplitterElement` owns one `BoxRenderable` and one `SplitterModel`. Its geometry setter
writes the renderable rectangle that OpenTUI both paints and stamps into the hit grid; its shared
pointer lifecycle captures that same renderable, tracks hover plus drag, and resolves appearance
through `palette.border` at rest and `palette.accent` while hovered or dragged.
`SeparatorAppearance` supplies the one-cell cross-axis count and paints vertical full cells or
horizontal lower-half cells for both splitters and scrollbars.

**Generates:** One-cell splitter hit zones; rest-muted, hover-lit, drag-lit behavior; one future
splitter wire-up instead of another geometry and pointer implementation.

**Evidence:** `src/modules/ui/SeparatorAppearance.ts`;
`src/modules/ui/SeparatorAppearance.test.ts`; `src/modules/ui/SplitterElement.ts`;
`src/modules/ui/SplitterElement.test.ts`;
splitter consumers construct `SplitterElement` rather than binding pointer handlers themselves.

**Impossible if true:** A painted divider whose pointer target occupies different cells; a pane
splitter with a private hover or drag state machine; a divider that stays accent-colored at rest or
loses its highlight while a captured drag continues.

**Verification:** `bun test src/modules/ui/SplitterElement.test.ts` plus the splitter-state
FrameProbe assertions registered in `scripts/merge-gate.sh`.

**Status:** provisional

**Last refined:** 2026-07-29

### Visible panel contents own separate headed regions

**Invariant:** If terminal and agent content are both visible in `PanelHost`, then each content owns a
separate side-by-side region with its own heading and body, and adding or removing one content never
relabels the other content as a tab under a shared heading.

**Scope:** `PanelHost.toggleContent`, panel cells in `RootView`, the terminal and agent status
controls, the Ctrl+Shift+S split action, and the matching command-palette actions.

**Components:**
- *Pane presence* — each status control toggles only its matching content.
- *Per-cell heading* — each visible cell projects its own `PaneContent.icon` and `PaneContent.title`.
- *Shared split* — `PanelHost.cellSpans` and `SplitterElement` place and resize visible cells.

**Mechanism:** `PanelHost.toggleContent` adds the second registered content to the shared cell layout
or removes only the selected content. RootView mounts one heading-and-body container per resolved
cell, while status clicks, keybindings, and palette commands call the same Bootstrap toggles.

**Generates:** A terminal region and an agent region that can coexist; one-click pane presence
controls; Ctrl+Shift+S split acceleration; identical mouse, keyboard, and palette results.

**Evidence:** `src/modules/ui/PanelHost.ts`; `src/modules/ui/RootView.ts`;
`src/modules/app/Bootstrap.ts`; `src/modules/commands/CommandDefaults.ts`;
`src/modules/ui/PanelHost.test.ts`; `scripts/harness/smoke-panel-split-harness.ts`.

**Impossible if true:** The agent body appearing under a terminal heading; clicking Agent replacing
the terminal body; closing Agent also closing Terminal; mouse and Ctrl+Shift+S producing different split
layouts.

**Verification:** `bun test src/modules/ui/PanelHost.test.ts && bun
scripts/harness/smoke-panel-split-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### The right dock control owns the status edge

**Invariant:** If the status bar is visible, then its final controls are the hit-tested clock followed
by the hit-tested right-dock control, with the right-dock control occupying the outermost three
columns.

**Scope:** Status-bar child order and pointer targets in `StatusBar`; other status text and controls
retain their existing actions.

**Mechanism:** `StatusBar` appends the clock immediately before `rightDockButton` after every other
flex child. Both are real `TextRenderable` targets; the clock requests a render and the right-dock
button invokes the shared `toggleRightDock`.

**Generates:** A stable clock-then-right-dock corner; an outer-edge dock affordance; pointer access to
both controls without changing the other status actions.

**Evidence:** `src/modules/ui/StatusBar.ts`; `scripts/harness/smoke-layout-harness.ts`.

**Impossible if true:** A help or settings control appearing after the clock; the clock occupying the
outermost edge; a click on either visible corner control missing its painted target.

**Verification:** `bun scripts/harness/smoke-layout-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### Tab bars share paint and hit geometry

**Invariant:** If a horizontal tab bar paints tabs, unused width, and right controls, then one column
walk determines both its styled chunks and hit segments, and each unused horizontal gap is one styled
chunk regardless of terminal width.

**Scope:** Horizontal workspace and buffer tab strips in `TabBarRenderer`. Vertical workspace tabs
are outside the gap-chunk rule but still return their hit segments from the paint walk.

**Components:**
- *One geometry walk* — every returned segment uses the same column cursor that places its glyphs.
- *One gap chunk* — unused width advances the cursor by its full width but allocates one styled chunk.
- *One close token* — workspace and buffer tabs read the same active `panelClose` glyph as panel
  headings and panel-list rows.

**Mechanism:** `TabBarRenderer.appendHorizontalGap` emits one repeated-space chunk, then
`TabBarRenderer.renderWorkspace` and `TabBarRenderer.renderBuffer` advance their existing column
cursors by the same gap width before painting and recording right controls.

**Generates:** right-pinned controls; hit targets that stay on their painted glyphs; styled-chunk cost
that scales with visible tabs and controls instead of terminal width.

**Rejected alternatives:** Emit one styled space per unused column — preserves pixels but adds
terminal-width allocations to every repaint.

**Evidence:** `src/modules/ui/TabBarRenderer.ts`; `scripts/smoke-tabs.sh` (FrameProbe locates the
right badge, then clicks the badge and adjacent arrow); `scripts/smoke-workspace-tabs.sh` (paints and
clicks horizontal workspace tabs).

**Impossible if true:** Right controls moving left when unused width grows; a click coordinate
resolving to a different segment than the glyph at that cell; one styled chunk allocated per unused
terminal column.

**Verification:** `bash scripts/smoke-tabs.sh && bash scripts/smoke-workspace-tabs.sh`

**Status:** established

**Last refined:** 2026-07-24

### The active activity item determines its dock content

**Invariant:** If the activity bar shows an item as ACTIVE (its left accent bar `▎` is drawn), then
its owning dock renders exactly that registered `PaneContent`; clicking its button toggles and
focuses the host where the content is registered. Invoking its activity action shows that same
current host. Exactly one item is active at a time. If the optional right activity bar is enabled,
both bars project this same membership and active identity.

**Scope:** `ActivitySurface`, both `ActivityBar` projections, every dock `PanelHost`, registered
file-tree and plugin pane contents, and dock projection in `RootView.update`.

**Mechanism:** `ActivitySurface` derives one row per registered content across its hosts, resolves
the content's current host, and chooses the active identity from the focused visible host. An
activity press calls `toggleContent`; a show runs the content's action, while a hide does not
immediately reopen it. `PanelHostFocusSet` leaves one focused host. `RootView` builds its optional
right activity bar over the same `ActivitySurface`, so the mirror has no registry of its own.

**Generates:** a clickable, self-explaining view switcher (button + name/shortcut tooltip + palette
entry) that satisfies the product north star's visible-affordance rule; per-workspace view memory;
keyboard parity that can never disagree with what the bar shows.

**Evidence:** `src/modules/ui/ActivitySurface.ts`; `src/modules/ui/ActivityBar.ts`;
`src/modules/ui/PanelHost.ts`;
`src/modules/ui/RootView.ts`; `src/modules/filetree/FileTreePaneContent.ts`;
`src/modules/git/GitPaneContent.ts`; `scripts/harness/smoke-activitybar-harness.ts`.

**Impossible if true:** the bar highlighting one view while the sidebar shows another; two items
active at once; a click or chord that moves the accent without switching the rendered sidebar content
(or the reverse); an activity view reachable only by keyboard with no clickable button.

**Verification:** `bun scripts/harness/smoke-activitybar-harness.ts` — assert every registered dock
content appears once; click a right-dock item and assert show, focus, and second-click hide; move the
pane both ways and assert the same activity item follows; enable the mirror and assert its exact
surface membership.

**Status:** provisional

**Last refined:** 2026-07-29

### Indent guides mark leading whitespace without shifting columns

**Invariant:** If indent guides are on (`settings.showIndentGuides`, default true), then the editor
body draws a faint vertical bar at each indentation level — display columns 0, tabWidth, 2*tabWidth,
... up to a line's leading-whitespace width — by REPLACING the space at that column with the guide
glyph, never by inserting a cell. The guide occupies the same one cell the space did, so the
grapheme-to-cell mapping, the caret column, and the selection range are identical whether guides are
on or off. Turning the setting off restores plain spaces.

**Scope:** `EditorPaneRenderer` code-body segment emission, `EditorPane` (supplies `showIndentGuides`
from settings and the tier glyph from `theme.glyphLevel`), and `settings.showIndentGuides`.

**Mechanism:** the guide columns are scanned over the leading run of spaces only, and each is added as
a one-grapheme boundary so the segment loop emits it as its own cell. That cell renders the guide glyph
(box-drawing bar, degrading to a plain pipe in the ascii glyph tier) in the dedicated faint `indentGuide` palette role instead
of the space — same column, same width. A find highlight or a diagnostic underline over the cell is
checked FIRST and wins, so a guide never overrides meaning. Guides draw only on a line's first visual
row (window start grapheme zero), so word-wrap continuation rows are untouched and the physical-line
indentation is what shows.

**Generates:** scannable nesting depth (VS Code parity) at zero cost to selection/caret correctness; a
single settings toggle that fully removes them; clean degradation without a Nerd Font.

**Evidence:** `src/modules/editor/EditorPaneRenderer.ts` (leading-space guide scan plus in-place glyph
in the code-body loop); `src/modules/editor/EditorPane.ts` (`showIndentGuides` + `indentGuideGlyph`
passed to the render context); `src/modules/settings/Settings.ts` +
`src/modules/settings/SettingsPanel.ts` (the setting and its boolean panel row);
`scripts/smoke-indent-guides.sh`.

**Impossible if true:** a guide that changes a line's character columns (a caret or selection landing
one cell off when guides are on vs off); a guide drawn past the leading whitespace or over a
non-whitespace character; guides still visible after the setting is turned off; a guide overriding a
diagnostic underline or find highlight on the same cell.

**Verification:** `bash scripts/smoke-indent-guides.sh` — open a nested-indent fixture and assert the
guide glyph renders in the dim colour at the expected indent columns (FrameProbe cells), that the
caret column at a clicked position matches with guides on and off, and that the guides DISAPPEAR when
`showIndentGuides` is toggled off.

**Status:** provisional

**Last refined:** 2026-07-23

### Input overlays share one modal slot

**Invariant:** If an input-capturing overlay opens, then it is the only input-capturing overlay
left open; Find and Replace remain two modes of the same `FindBar`, and reserved global chords still
run before the active overlay consumes input.

**Scope:** `FindBar` in find or replace mode, `QuickOpen`, the command palette in
`CommandRegistry`, `SettingsPanel`, `ContextMenu`, and the `ShortcutHelp` cheat-sheet. The
destructive confirmation overlays and display-only `Tooltip` are outside this slot.

**Mechanism:** `OverlayCoordinator.openExclusiveOverlay` closes every registered overlay except the
requested one before it runs the requested opener. Every live open path in `Bootstrap.ts` and
`RootView.ts` goes through that coordinator. `Bootstrap.keyTick` resolves reserved global bindings
before overlay routing, and `FindBar.openFor` changes `mode` without closing the shared Find bar.

**Generates:** one active input context; one-keystroke switching between overlays; no masked stale
overlay that reappears when a newer overlay closes; the always-available quit escape hatch.

**Evidence:** `src/modules/ui/OverlayCoordinator.ts`; `src/modules/app/Bootstrap.ts` overlay action
handlers; `src/modules/ui/RootView.ts` context-menu and workspace-folder open paths;
`src/modules/ui/OverlayCoordinator.test.ts`; `scripts/smoke-mode-coherence.sh`.

**Impossible if true:** Find and Quick Open both reporting open; closing Settings revealing a stale
command palette beneath it; Ctrl+F then Ctrl+H creating two bars instead of changing one bar to
replace mode; Ctrl+Q being swallowed by Find, Quick Open, or the command palette.

**Verification:** `bun test src/modules/ui/OverlayCoordinator.test.ts
src/modules/keybindings/KeybindingRegistry.test.ts && bash scripts/smoke-mode-coherence.sh`

**Status:** established

**Last refined:** 2026-07-22

### Modal focus withdraws host terminal projections

**Invariant:** If a modal overlay owns the screen, then every host-terminal projection outside
the cell grid is withdrawn until the overlay closes.

**Scope:** The hardware cursor and pixel-protocol image placements projected by `RootView`;
input-capturing overlays in `OverlayLayer`, destructive confirmation dialogs, and
`BoundedListPopup`. The cell-grid render, display-only `Tooltip`, and non-modal
`CompletionPopup` are outside this rule.

**Mechanism:** `OverlayLayer.modalOverlayOwnsScreen` is the one late-read derivation of modal
focus from the existing overlay-model refs. `RootView.update` reads it once per frame, clears
`PixelImageMount` instead of synchronizing a placement, and hides the hardware cursor before
any retained pane focus can project its caret. `PixelImageMount.clear` resets the placement
key, so the first frame after close restores the current image geometry, including geometry
changed by a resize while the overlay was open.

**Generates:** One occlusion rule for every modal and every host-terminal projection; hidden
hardware cursors under painted overlay carets; immediate graphics withdrawal and
resize-correct restoration for Escape, close-control, and backdrop dismissal.

**Evidence:** `src/modules/ui/OverlayLayer.ts`; `src/modules/ui/RootView.ts`;
`scripts/harness/smoke-overlay-dialog-harness.ts` (real terminal pane and cursor-visibility
bytes); `scripts/harness/smoke-pixel-preview-harness.ts` (real PNG, kitty placement/remove
bytes, live resize, and three dismissal paths).

**Impossible if true:** A hardware cursor blinking over Settings or Keyboard Shortcuts; a
kitty image remaining above a modal; closing a modal requiring scroll or file switching to
restore the image; a resize while a modal is open restoring the old placement geometry.

**Verification:** `bun scripts/harness/smoke-overlay-dialog-harness.ts && bun
scripts/harness/smoke-pixel-preview-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### Overlay dialogs stay inside the terminal

**Invariant:** If an overlay dialog is visible, then its left, top, width, height, content viewport,
scrollbar, and close control all fit inside the terminal's current rows and columns, including after
a live resize. Settings and Keyboard Shortcuts reserve their declared canvas margins and derive
their width from content while those preferences fit.

**Scope:** The command palette, Find and Replace, Quick Open, destructive confirmation, Settings,
Keyboard Shortcuts, and context menu dialogs in `OverlayLayer`. `BoundedListPopup` has its own
stricter anchored geometry record; completion is non-modal.

**Mechanism:** `OverlayDialogGeometry.layout` clamps one numeric rectangle to the live
`renderer.width` and `renderer.height`. Optional horizontal and vertical margins reduce the
available canvas before centering and clamping. They shrink only when retaining them would remove
the final dialog cell. `OverlayLayer.updateOverlayDialog` applies that rectangle to the box and its
top-edge close control every frame. Settings and Keyboard Shortcuts measure their longest rendered
content row and apply one width ceiling. Content that exceeds the rectangle is windowed through
`ScrollableTextViewport`, which derives its `SolidThumbScrollBar` from the same interior rectangle.

**Generates:** Resize-safe dialogs; bounded paint; canvas separation for Settings and Keyboard
Shortcuts at both large and compact geometries; content-derived widths; shared wheel momentum,
keyboard reveal, and thumb drag; a close target that never leaves the canvas.

**Evidence:** `src/modules/ui/OverlayDialogGeometry.ts`;
`src/modules/ui/OverlayDialogGeometry.test.ts`; `src/modules/ui/OverlayLayer.ts`;
`scripts/harness/smoke-overlay-dialog-harness.ts`.

**Impossible if true:** Resizing while Settings or Keyboard Shortcuts is open leaves any dialog edge,
scrollbar, or close control outside the terminal; either dialog expands to a canvas fraction after its
content width is known; preferred margins clip the last dialog cell; overflowing rows paint through
the bottom instead of scrolling.

**Verification:** `bun test src/modules/ui/OverlayDialogGeometry.test.ts
src/modules/ui/ScrollableTextViewport.test.ts && bun
scripts/harness/smoke-overlay-dialog-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-29

### Hierarchical pane rows share one compact indent

**Invariant:** If a file-tree or structure row is nested at depth N, then its row mark starts
exactly N cells farther right than the same row at depth zero. Adjacent levels remain distinct, and
render width and pointer hit geometry use the same indentation.

**Scope:** File-tree rows, structure rows, structure fold-control hit targets, and file-tree content
width. Editor text indentation and popup hierarchy are outside this rule.

**Mechanism:** `HierarchicalRowIndent` is the one generator for indentation text and width.
`TreePaneRenderer`, `FileTree`, `StructurePaneRenderer`, and `StructurePaneContent` consume it
instead of multiplying depth locally.

**Generates:** One compact cell per nesting level in both panes; matching horizontal extents;
fold-control clicks that stay aligned with their painted control.

**Evidence:** `src/modules/ui/HierarchicalRowIndent.ts`;
`src/modules/ui/HierarchicalRowIndent.test.ts`;
`src/modules/filetree/TreePaneRenderer.ts`;
`src/modules/filetree/FileTree.ts`;
`src/modules/structure/StructurePaneRenderer.ts`;
`src/modules/structure/StructurePaneContent.ts`.

**Impossible if true:** A depth-three file-tree row and structure row starting at different
indentation; either pane advancing two cells per level; compact paint leaving the structure fold
hit target at its old column.

**Verification:** `bun test src/modules/ui/HierarchicalRowIndent.test.ts
src/modules/filetree/TreePaneRenderer.test.ts src/modules/filetree/FileTree.test.ts
src/modules/structure/StructurePaneRenderer.test.ts
src/modules/structure/StructurePaneContent.test.ts`.

**Status:** provisional

**Last refined:** 2026-07-29

### Overlay keyboard actions have visible mouse paths

**Invariant:** If an overlay exposes an action through a keyboard binding, then it exposes a visible
mouse path to the same model action; raw text entry is input, not a bound action. The mouse is the
reliability floor when terminal keyboard delivery is missing or delayed.

**Scope:** Overlay close, scrolling, list selection and activation, Find controls, and Settings edits
in `OverlayLayer`, plus the modal popup adapters it coordinates.

**Components:**
- *Close parity* — each dialog paints a top-edge `✕` that calls the same close or cancel model method
  as Escape.
- *Scroll parity* — every overflowing dialog uses `ScrollableTextViewport`, so arrow or page movement,
  wheel input, and `SolidThumbScrollBar` thumb drag share one offset.
- *Action parity* — settings widgets, Find buttons, palette rows, Quick Open rows, and context-menu rows
  call the same adjust, navigate, run, or select methods as their keyboard actions.

**Mechanism:** `OverlayCloseButton` owns the glyph, top-edge placement, pointer handler, and teardown
for every close control. `OverlayLayer.updateOverlayDialog` and `BoundedListPopup.update` lay that
shared control out from the same numeric rectangle as the dialog and route it to the existing model
close method. Each overflowing dialog composes `ScrollableTextViewport` instead of implementing
dialog-specific scroll math.

**Generates:** Mouse-only overlay operation; one visible close idiom; pointer and keyboard actions
that cannot diverge into separate state.

**Evidence:** `src/modules/ui/OverlayCloseButton.ts`; `src/modules/ui/OverlayLayer.ts`;
`src/modules/ui/BoundedListPopup.ts`;
`scripts/harness/smoke-overlay-dialog-harness.ts`; `scripts/smoke-find.sh`;
`scripts/smoke-search-mouse.sh`; `scripts/smoke-voice-picker.sh`.

**Impossible if true:** An overlay action works only by keyboard; a visible `✕` fails to close; wheel
and keyboard reveal different row windows; a pointer edit bypasses the keyboard model method.

**Verification:** `bun scripts/harness/smoke-overlay-dialog-harness.ts && bash
scripts/smoke-find.sh && bash scripts/smoke-search-mouse.sh && bash
scripts/smoke-voice-picker.sh`

**Status:** provisional

**Last refined:** 2026-07-25

### Modal outside presses dismiss and consume

**Invariant:** If a modal overlay is open and a pointer press starts outside its current rectangle,
then that press dismisses the overlay through its existing close or cancel model method and is
consumed without changing the pane beneath it; a press or drag that starts inside remains owned by
the overlay.

**Scope:** Settings, Keyboard Shortcuts, Command Palette, Quick Open, destructive confirmations,
context menus, and every `BoundedListPopup` opened with its modal backdrop, including the buffer,
branch, layouts, and panel-add adapters. The in-editor Find bar and the completion popup are
non-modal and outside this rule.

**Mechanism:** `ModalOverlayDismissal` places one full-screen hit backdrop immediately below the
dialog and its shared `OverlayCloseButton` immediately above it. The dialog wins hit-testing for
inside presses, while only an outside press reaches the backdrop; OpenTUI keeps an inside-started
drag captured by its original target. The backdrop and close button receive the same close or cancel
callback that Escape invokes.

**Generates:** One dismissal projection for modal dialogs and bounded popups; one-click dismissal
without cursor, focus, pane, or button changes beneath it; scrollbar drags that may leave a dialog
without closing it.

**Evidence:** `src/modules/ui/ModalOverlayDismissal.ts`; `src/modules/ui/OverlayLayer.ts`;
`src/modules/ui/BoundedListPopup.ts`; `scripts/harness/smoke-overlay-dialog-harness.ts`.

**Impossible if true:** One press both dismissing a modal and moving the editor cursor or pane focus;
an outside press leaving a listed modal open; an inside scrollbar drag closing the modal after the
pointer crosses its rectangle; the non-modal completion popup gaining a modal backdrop.

**Verification:** `bun test src/modules/ui/ModalOverlayDismissal.test.ts
src/modules/ui/BoundedListPopup.test.ts && bun scripts/harness/smoke-overlay-dialog-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### The shortcut sheet lists the effective bindings

**Invariant:** If the shortcut cheat-sheet shows a chord for an action, then that chord is the
registry's post-shadowing effective binding for that action at that moment — every row derives from
`KeybindingRegistry.effectiveBindings()` at read time, never from a hand-written chord list — and
the sheet is reachable both by the clickable status-bar `?` affordance and by a bound chord that the
sheet itself lists.

**Scope:** `ShortcutHelp` (rows and scroll state), the RootView cheat-sheet projection and
status-bar `?` button, and every layer registered in the `KeybindingRegistry` (canonical floor, mac
overlay, any future user rebind layer).

**Mechanism:** `ShortcutHelp.rows()` merges `effectiveBindings(context)` across the global, focus,
and overlay contexts (first-wins per action id) and labels each row with
`bindingHint(action, context)`; a layer change bumps the registry `revision` ref, so an open sheet
repaints with re-derived rows. The status-bar `?` is a hit-tested `TextRenderable` whose click, like
the Ctrl+Shift+H chord, opens the sheet through
`OverlayCoordinator.openExclusiveOverlay('shortcutHelp', …)`.

**Generates:** a shortcuts page that cannot drift from what the keys actually do; discoverability
for every bound action; rebinds that re-label the sheet with no extra bookkeeping.

**Evidence:** `src/modules/ui/ShortcutHelp.ts`; `src/modules/ui/ShortcutHelp.test.ts` (a
later-layer rebind re-labels the Quick Open row Ctrl+P → Ctrl+O); `scripts/smoke-shortcut-help.sh`
(clicking the status-bar `?` opens the sheet showing real binding rows, and the chord the sheet
shows for Go to File actually opens Quick Open when pressed).

**Impossible if true:** a sheet row advertising a chord that resolves to nothing or to a different
action; a rebound action still shown with its old chord; a hardcoded chord string in the sheet's
row source.

**Verification:** `bun test src/modules/ui/ShortcutHelp.test.ts && bash
scripts/smoke-shortcut-help.sh`

**Status:** established

**Last refined:** 2026-07-22

### One writer per scroll regime per frame

**Invariant:** If more than one authority can change a pane's scroll offset (mouse wheel, keyboard
paging, programmatic scroll-to, and later a scroll animation), then exactly one writes that offset
in a given frame; when authority changes, the newest STOPS the other and adopts the current offset.
Two writers in one frame silently eat input.

**Scope:** every scroll offset — editor `viewport.scrollTop`, `gitPanel.logScrollTop`, tree
selection window, agent transcript viewport, and terminal emulator `viewportY`.

**Mechanism:** Wheel handlers call `Momentum.queueImpulse`, which mutates only a plain pending-input
queue. The animation tick drains every queued event through `Momentum.addImpulse` in order and
publishes the reactive momentum and scroll offset once. Keyboard and programmatic jumps halt that
momentum and discard its queue before adopting the current offset. Cross-substrate transfer from
`VirtualScroller` ("One Writer Per Regime").

**Generates:** deterministic scrolling; no lost wheel/keys.

**Evidence:** `Momentum.queueImpulse` plus `stepMomentum`; the real-rate burst in
`measure-scroll-smoothness.ts` proves 150 events become 150 impulses while projection passes remain
below event count at 2k and 100k lines on editor and diff; programmatic jumps halt momentum;
`scripts/harness/smoke-terminal-harness.ts` observes a contrary terminal notch reverse direction.

**Impossible if true:** a frame in which two authorities both write the same scroll offset.

**Verification:** review + a test that a programmatic scroll-to during a wheel gesture yields the
scroll-to's offset, not a blend.

**Status:** provisional

**Last refined:** 2026-07-25

### The wheel gesture resolves through one settings-sourced step

**Invariant:** How far one wheel notch moves — the rows-per-notch and the fast-scroll multiplier —
and whether a wheel event counts as horizontal are computed in exactly ONE place, read from
`Settings`, never hardcoded. Every scroll consumer (the editor in wrap mode, the editor in
non-wrap/momentum mode, the file tree, each git region, the agent transcript, and terminal
scrollback) feeds through that same step, so a settings change moves all regimes identically and no
two consumers can drift apart.

**Scope:** every wheel handler — `EditorPane`, `Sidebar` (tree + git), `ScrollableTextViewport`,
`PaneContent` scroll projections, and any future scrollable pane.

**Mechanism:** `ScrollGesture.Class.wheelStep(event, settings)` and `.modifierHeld(event, modifier)`
are the sole definitions; a handler NEVER re-derives notch size, the fast multiplier, or the
horizontal-modifier test locally. `EditorPane` routes every vertical wheel gesture through one
`Workspace.impulseEditorVerticalScroll` call; wrap mode differs only in the visual-row extent used
when that shared momentum is applied. Pairs with *One writer per scroll regime per frame* (that
governs who WRITES the offset; this governs how the gesture is MEASURED before the write).

**Generates:** uniform, configurable scroll feel across every pane from one settings source.

**Evidence:** `ScrollGesture` is the single module; the sidebar, editor, shared text viewport, and
panel cell route all call it before a content receives its signed row impulse.

**Impossible if true:** two panes scrolling at different speeds for the same `linesPerNotch`; a wheel
handler that ignores a settings change; a hardcoded notch count anywhere.

**Verification:** review + `bun scripts/harness/smoke-scrollbars-harness.ts` and `bun
scripts/harness/smoke-terminal-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-26

### Same-direction notches accumulate until the glide ceiling

**Invariant:** If same-direction wheel notches arrive while a glide is live and
physical velocity is below its configured ceiling, then every notch adds a
strictly positive gain-ramped impulse. Successive flicks therefore produce
strictly increasing visible per-gesture adjacent-four-frame peak row crossings
until the ceiling is reached. A twelve-impulse hard first flick retains
velocity headroom for at least two more hard flicks at every supported
configured ceiling. Same-direction impulse velocity received at the configured
ceiling is retained to replace subsequent frame decay, so rapid input sustains
the ceiling instead of being discarded.

**Scope:** `Momentum.queueImpulse` and `Momentum.addImpulse` for every
horizontal and vertical wheel-momentum consumer. Contrary-direction input still halts and restarts,
direct or programmatic scroll still adopts and stops, and velocity may remain
flat only after the configured ceiling is genuinely reached.

**Mechanism:** `Momentum.queueImpulse` records every physical event without publishing reactive
momentum. The animation tick drains that queue through `Momentum.addImpulse`, which treats velocity at or above
`stopVelocity` as authoritative continuation and uses the 150 ms input-cadence
window only before live motion can establish that fact. It preserves
`restEquivalentGestureVelocity` across the glide, ramps gain over twenty
impulses, and adds that gain to physical `velocity`. A separate
headroom-relative envelope advances across three twelve-impulse hard flicks:
the first reserves two three-quarter-notch velocity gains, the second
reserves one, and the third may use the configured ceiling. Three quarters
of a full-gain notch changes the four-frame row-crossing budget by more than
three rows at the declared default 30-frame cadence. The underlying gain
curve stays impulse-scaled and therefore does not slow when the ceiling
rises; only a flick that would consume the reserved headroom is limited. The
velocity rejected by that first/second-flick envelope is deliberately not
banked. Once the true configured ceiling is available, excess
`ceilingSustainingVelocity` replaces only the velocity lost to each decay step;
physical velocity never exceeds the configured maximum. A separate physical
impulse-event count opens that reserve only after 36 events, independent of
lines-per-notch scaling; row-scaled impulse units continue to govern the
landed envelope unchanged. The cap may divide the same continuous travel
across different completed frames, so the live contract measures total
whole-row travel and permits only the sub-row residual that `stepMomentum`
discards at rest. The contrary-direction branch still halts before restarting.

**Generates:** One continuous motion whose speed grows across successive
same-direction flicks; no hitch at a gesture boundary; dense input that
sustains capped speed rather than disappearing; a raised ceiling that requires
continued input to reach and remains reachable.

**Rejected alternatives:** Three-impulse ramp — a 12-notch flick pre-saturates
a 320 row-per-second ceiling and absorbs every later notch. A fixed
twenty-impulse ramp with a hard clamp — it climbs at 320 but produces the
`10 → 7 → 7` fingerprint at 120. Cap-scaled gain ramp — raising the ceiling
makes acceleration slower. Clock-only continuation — a glide can outlive the
150 ms proxy and reset gain while visibly moving. Reset gain on a rendered
frame — PTY chunk timing would split one physical gesture. Discard velocity at
the true ceiling — rapid notches vanish while the same notches delivered after
decay keep moving the viewport.

**Evidence:** `src/modules/system/Momentum.ts`;
`src/modules/system/Momentum.test.ts` (`successive hard flicks retain headroom
across configured ceilings`; `rapid hard flicks sustain capped speed with
excess impulses`);
`scripts/harness/measure-scroll-smoothness.ts` (per-frame row-crossing
sequences from three 12-notch flicks at the default 220 row-per-second
ceiling and a raised 320 row-per-second ceiling, separated by 200 ms, plus a
rapid 60-notch burst, a 120 / 220 / 320 / 480 ceiling sweep, and the
delayed-notch sweep).

**Impossible if true:** A same-direction notch below the ceiling leaving
physical velocity unchanged; successive flick peaks staying flat before the
ceiling; a 12-notch first flick pre-saturating any supported configured
ceiling; continued same-direction input never reaching the ceiling; rapid
notches at the configured ceiling producing less sustained travel than their
impulse energy can carry.

**Verification:** `bun test src/modules/system/Momentum.test.ts && bash
scripts/behavioral-contracts.sh`; `glide-accumulation` drives three separated
flicks first at the default 220 ceiling and then at a raised 320 ceiling, and
requires strictly increasing adjacent-four-frame peak row crossings in both
rows. The four-frame window preserves the per-frame fingerprint while leaving
enough integer cell-grid resolution for three levels under the default
ceiling. The same contract drives a rapid 60-notch burst at the default
ceiling and requires at least
`ceil(verticalFlingCeiling * maximumGlideDurationMilliseconds / 1000 - 1)`
whole rows of travel. This floor comes from capped velocity integrated over
the configured tail, less the only sub-row residual that may be discarded.
`glide-continuation` retains the delayed single-notch boundary check.

**Status:** provisional

**Last refined:** 2026-07-27

### Wheel impulses start their own frame sequence

**Invariant:** If `ScrollableTextViewport.handleWheel` adds a momentum impulse, then the shared
viewport requests the first frame itself and its consumers do not request that frame separately.

**Scope:** Wheel input handled by `ScrollableTextViewport` in overlays, `HoverCard`,
`BoundedListPopup` and its `CompletionPopup` adapter, and the agent transcript. Direct-step
`PaneContent` wheel routes and the independently generated Markdown preview momentum are outside
this rule.

**Mechanism:** `ScrollableTextViewport.handleWheel` records whether it added a vertical or
horizontal `Momentum` impulse and calls its injected `renderer.requestRender()` only in that case.
The requested frame reaches `tick`, which advances the impulse and keeps requesting frames while
momentum remains active. `reconcileExtent` clamps offsets that became invalid without halting a
fresh impulse merely because its valid starting offset is at the top boundary. `onScroll` remains
the notification for an offset that actually changed.

**Generates:** One wheel-to-first-frame obligation for every shared viewport consumer; consumer
handlers that only call `handleWheel`; a demand-driven loop that remains stopped when no impulse was
added.

**Evidence:** `src/modules/ui/ScrollableTextViewport.ts`;
`scripts/harness/smoke-overlay-dialog-harness.ts`; the `idle-quiescence` contract in
`scripts/behavioral-contracts.sh`.

**Impossible if true:** A wheel impulse queued while the app is at rest with no frame to advance it;
a consumer calling `requestRender()` immediately after `ScrollableTextViewport.handleWheel`; a
`handleWheel` call that adds no impulse starting the frame loop.

**Verification:** `bun scripts/harness/smoke-overlay-dialog-harness.ts && bash
scripts/behavioral-contracts.sh`

**Status:** provisional

**Last refined:** 2026-07-25

### A fast glide crosses rows in many small steps

**Invariant:** If a wheel gesture puts a pane's momentum regime into a fast glide, then the travel
arrives as MANY SMALL per-frame row crossings and never as a few large jumps: its sustained fast
segment runs at no less than 28 FPS against the declared 30 FPS target, no completed frame advances
the offset by more than two frame budgets at the configured velocity ceiling, and the glide is
carried by at least ten moving frames. Total displacement is NOT this property — the identical
distance delivered in fewer, larger steps satisfies every displacement contract while the motion is
visibly choppy and its effective velocity is lower.

**Scope:** every wheel-momentum glide that writes a scroll offset — the editor's vertical and
horizontal regimes, the file tree, the agent transcript, each git region, terminal scrollback, and
any future scroll animation on the same offsets. It governs the CADENCE of the write; *One writer per
scroll regime per frame* governs who writes and *The wheel gesture resolves through one
settings-sourced step* governs how the gesture is measured first. One editor and one diff
wall-clock canary sample the sustained-fast floor. Document-size scaling is governed by *Editor
frame work is independent of document length*, whose deterministic count ratio is the primary
contract.

**Mechanism:** three properties together bound the step size. `Momentum.stepMomentum` carries the
fractional row `residual` inside the momentum value between frames, so a whole-row write never
discards sub-row progress and no consumer may round the integrator's position. `Bootstrap` advances
animation physics and requests a one-shot render from one absolute-deadline cadence timer; each
deadline advances by `1000 / renderer.targetFps`, so timer overshoot and frame work shorten the next
wait instead of accumulating drift. `deltaTimeSeconds` is clamped to
`MAXIMUM_DELTA_TIME_SECONDS`, so a resumed clock advances one frame's worth rather than the whole
idle gap. Per-frame travel is therefore velocity divided by cadence, and BOTH factors are declared
values (`Settings.verticalFlingCeiling`, `createCliRenderer`'s `targetFps`) — which is what makes the
bound computable from the app rather than fitted to an observation.

**Generates:** motion that reads as continuous rather than as a sequence of jumps; a hard bound on how
far one frame may teleport a viewport; a smoothness figure that is independent of displacement, so a
refactor cannot trade one for the other unnoticed.

**Evidence:** `scripts/harness/measure-scroll-smoothness.ts` reads the top visible fixture line of
every completed synchronized frame of one fast gesture at the real PTY, and reports the moving-frame
count, the per-frame delta distribution, the peak velocity and the distance. Driven on 2026-07-26 at
six commits spanning 24 hours of history (`40d244b~1` through `e6450c6`), a 12-notch fling was carried
by 17 to 19 moving frames with a largest single-frame step of 7 rows at every one of them. The
`glide-smoothness` contract in `scripts/behavioral-contracts.sh` gates the ceiling, moving-frame
floor, travel floor, follow-on travel parity, one 28 FPS diff canary, and the exact editor
2k-to-100k frame-work ratio. The fold-dense contract retains one 28 FPS editor canary. After
replacing the recursive live-loop delay with the absolute-deadline cadence on 2026-07-26, the
standard gesture ran at 29.9 to 30.1 sustained-fast FPS; after removing document-scale frame work,
a six-case 2k/26,635/100k editor+diff matrix ran every sustained-fast segment at 29.8 FPS or
faster. On 2026-07-27 the editor count contract measured exact ratios of 1 for document-line reads,
fold projections, wrap projections, and layout computations.

**Impossible if true:** a fling that covers its distance in a handful of large jumps; a renderer that
writes a quantized copy of the momentum integrator's position back into the viewport each frame (that
rounding both enlarges the steps and loses velocity, while leaving total displacement intact); a glide
whose sustained fast segment falls below 28 FPS while the declared target remains 30 FPS; an idle
animation timer that keeps producing frames after every animation settles.

**Verification:** `bash scripts/behavioral-contracts.sh` (the `glide-smoothness` and
`fold-dense-cadence` contracts); `bun scripts/harness/measure-scroll-smoothness.ts` for the raw
per-frame distribution and attribution counts.

**Status:** provisional

**Last refined:** 2026-07-27

### A context menu is modal and single-consumer

**Invariant:** If a context menu is open, then every pointer and keyboard event belongs to the menu
alone: a click either hits a menu row (running that item) or dismisses the menu — it NEVER also
reaches, activates, or edits anything beneath; a keystroke drives the menu, switches the shared
modal slot to another input overlay, or closes the menu and is consumed. Running an item closes the
menu BEFORE the action executes.

**Scope:** `ContextMenu` (the model), the backdrop + menu overlay in `RootView`, and the modal key
block in `Bootstrap.onKey`.

**Mechanism:** the view mounts an invisible FULL-SCREEN backdrop box (zIndex 125) beneath the menu
box (zIndex 130). OpenTUI stamps every rendered renderable into its hit grid in render order
(zIndex ascending, later stamps win), so while the menu is open every pointer cell resolves to the
menu or the backdrop — the panes beneath are unreachable by construction, not by per-handler
guards. The backdrop's only behavior is `close()`. Keys: `Bootstrap.onKey` short-circuits to the
registry's `menu` context, dispatches `menu.*` actions or a global input-overlay opener through
`OverlayCoordinator`, and closes-and-consumes anything else. Reserved global chords run before this
branch. `ContextMenu.runAt` closes first, then invokes the opener-supplied handler. A value-picker
item can declare itself active. That one fact paints the activity-bar edge marker and supplies the
initial keyboard selection; without an active item the first enabled row remains the fallback.

**Generates:** reusable menus that are safe over any pane; collective git actions without
misclick hazards; keyboard parity for every menu; value pickers whose current marker, initial
highlight, arrow movement, and Enter action cannot disagree.

**Evidence:** unit tests (`ContextMenu.test.ts` state machine) + live tmux: right-click menu over
the git panel; a click on the editor area closed the menu with buffer revision AND cursor
unchanged; a menu-item click ran only the collective action. `scripts/smoke-mode-coherence.sh`
opens the buffer-tab menu over the command palette, then switches menu to palette with one F1 chord.

**Impossible if true:** a click that both closes the menu and acts on what is beneath it; a
keystroke that types into the editor or moves a pane selection while a menu is open; an item
action that executes while the menu is still open; switching from the menu to another input overlay
requiring the opening chord twice.

**Verification:** `bun test` ContextMenu tests; `bash scripts/smoke-mode-coherence.sh`; tmux — open
the menu, click elsewhere, assert the menu is gone AND `bufferRevision`/`cursor`/`treeSelected`
unchanged in status.json.

**Status:** established

**Last refined:** 2026-07-22

### A tooltip never intercepts input

**Invariant:** If a tooltip is pending or visible, then it is display-only: it never receives,
consumes, or reroutes any pointer or keyboard event, and any disqualifying input (pointer moved
off the target, any click anywhere, any keypress) hides it immediately.

**Scope:** `Tooltip` (the dwell state machine), `PaneContent.tooltipAt`, and the tooltip overlay
and pane-host routing in `RootView` (`HitTransparentText`).

**Mechanism:** the tooltip renderable overrides `render()` to mask OpenTUI's hit-grid stamp for
itself (`HitTransparentText`), so the pointer can NEVER resolve to the tooltip — a click at its
cells hits whatever is beneath, exactly as if the tooltip did not exist. The model only ever
writes its own display refs (`visible/text/anchor`); the dwell advances on the frame tick
(`tick(dtSeconds)` — the momentum/auto-scroll contract) and `Bootstrap` clears on every keypress
and every mouse-down.

**Generates:** hover affordance labels from a pane's own shared action geometry, including git
and task actions, with zero input risk.

**Evidence:** unit tests (`Tooltip.test.ts` dwell machine: no show before the dwell, cumulative
dwell, jitter keeps the timer, clear disarms) + live tmux: tooltip visible in the pane capture
after a dwell; a click at the same cells acted on the row beneath; and
`scripts/harness/smoke-tasks-dashboard-harness.ts` (a pane-owned report action tooltip).

**Impossible if true:** a tooltip that eats a click (a click that would have hit the control
beneath but does not); a tooltip whose state machine writes cursor/selection/scroll state; a
tooltip still visible after a keypress or click.

**Verification:** `bun test` Tooltip tests; grep — `HitTransparentText` masks `addToHitGrid`;
tmux — with the tooltip visible, click through it and assert the underlying action fired.

**Status:** established

**Last refined:** 2026-07-21

### A hover card reflects the language server type at the pointed symbol

**Invariant:** The hover card shows content that came from `client.hover` for the exact document
position the pointer dwelled on, and it appears ONLY after the pointer rests on ONE document
position for at least the dwell (0.5s). It is display-only over the panes — like a tooltip it
never intercepts pointer or keyboard input that lands on the code beneath it — with the SINGLE
exception that the card's own box receives its own vertical scroll (wheel/scrollbar) so long
content is reachable. A response whose dwell generation is no longer current (the pointer moved,
so a newer dwell superseded it) is dropped, never shown.

**Scope:** `HoverCard` (the dwell + async + layout controller and its box/content/scrollbar
renderables), `Workspace.hoverAt` (the guarded `client.hover` call), and the `EditorPane`
`codeBody.onMouseMove` that maps a cell to a document position.

**Mechanism:** `codeBody.onMouseMove` maps the cell to a document position and calls
`hoverCard.pointAt(position, x, y)`; a NEW `key` (`line:column`) bumps `generation`, resets the
dwell, and hides any shown card. `tick(deltaSeconds)` (the momentum/auto-scroll contract) advances
the dwell and, once ≥0.5s, fires `requestHover` EXACTLY once per dwell (`requestedGeneration`
latch), capturing `generation`; the resolved response is applied only when its captured generation
still equals the live `generation` (stale responses from a moved pointer are dropped). The card's
box/scrollbar receive their own `onMouseMove`/`onMouseScroll` (`pointerOverCard`) so moving in to
scroll does not dismiss it; `Bootstrap` dismisses the card on any keypress and any mouse-down.

**Generates:** VS-Code-style type/documentation hover cards for any LSP-backed language, scrollable
for long content, with zero risk of intercepting the clicks/keys that drive the editor beneath.

**Evidence:** driven tmux smoke (`scripts/smoke-hover.sh`): dwelling the mouse over a typed symbol
for >0.5s renders a bordered card carrying the server's type text; a move-through under the dwell
threshold shows no card. Unit coverage of the dwell/generation machine mirrors `Tooltip.test.ts`.

**Impossible if true:** a card that appears before the dwell elapses; a card showing content for a
position the pointer already left (a stale async response applied after `generation` changed); a
card that swallows a click or keypress meant for the code beneath it; hover content invented
locally rather than returned by `client.hover`.

**Verification:** `bash scripts/smoke-hover.sh` (dwell shows the card + its type text; sub-dwell
move-through does not); grep — `HoverCard.tick` gates on `requestedGeneration`/`generation` and
`renderContents` only runs on `client.hover` output.

**Status:** provisional

**Last refined:** 2026-07-22

### An overlay dismissal clears its cells in the same frame

**Invariant:** Hiding an absolutely-positioned overlay must set its renderables invisible
SYNCHRONOUSLY, inside the handler that dismisses it — never deferred to a later reactive `update()`.
The reduction is general: a state change and the projection an observer depends on must be atomic
with respect to that observer; a deferred hide opens a gap in which the state says "gone" but the
projection still shows it, and if something reads during the gap the read is stale. This is NOT
"prefer synchronous over reactive" — it is "close the gap wherever an observer can catch it open."

**Scope:** overlays whose visibility can flip from an ASYNC callback or while the frame loop is idle
(e.g. `HoverCard.clear()` on keypress/click after the dwell tick loop has stopped). Overlays
dismissed reactively — palette/find/quick-open/settings, whose `open` ref the paint effect reads —
are already gap-free and need no synchronous hide; their mutation and its paint land in one tick.

**Mechanism:** OpenTUI composites INCREMENTALLY: it repaints a pane only when that pane's projected
content truly changes, so hiding an overlay by flag alone leaves its cells stamped until an unrelated
content change beneath repaints them. `box.requestRender()`, `root.remove(box)`, and
`renderer.suspend()/resume()` do NOT clear them. Setting `box.visible = false` (and its
scrollbar/backdrop) directly in the dismiss handler, before the next paint, does. The SHOW path may
stay reactive precisely because its tick loop is animating and continuously closes the gap — same
overlay, opposite treatment, one principle.

**Generates:** overlays that vanish the instant they are dismissed, with no stale-cell ghosting;
and a design rule that tells the next overlay author which dismiss path (sync vs reactive) each case
needs, rather than cargo-culting one.

**Evidence:** the hover card regressed exactly this way — Escape set `visible=false` but the card
persisted in the framebuffer (FrameProbe-visible) until an arrow key changed the code beneath;
hiding the renderables synchronously in `clear()` fixed it, verified by `scripts/smoke-hover.sh`
(Escape dismisses the card). Cross-checked: the shortcut sheet and palette clear correctly because
their dismissal already routes through a reactive ref the paint effect reads.

**Impossible if true:** a dismissed overlay whose cells survive into the next observed frame; a
dismiss handler that only flips a flag and relies on a future reactive paint to hide the renderables.

**Verification:** `bash scripts/smoke-hover.sh` (Escape dismisses the card in the same settle
window); review — an overlay `clear()`/dismiss that sets only a visibility flag without hiding its
renderables is a violation.

**Status:** provisional

**Last refined:** 2026-07-22

### Renderables hold no model state

**Invariant:** If a renderable exists, then it holds only presentation state; it pulls all
domain data from models each `update()` and never mutates a model during render.

**Scope:** `RootView`, `SourceTextPaneContent`, `EditorPaneRenderer`, and every OpenTUI renderable
they build.

**Mechanism:** `RootView.update` and `SourceTextPaneContent.paint` read model state and write
presentation content. `EditorPaneRenderer` derives the source-text cells from the current
`SourceTextView`; the gutter and code renderables store no cursor, buffer, selection, or scroll
truth. Realizes *ivue owns state and OpenTUI owns projection*.

**Generates:** the stateless view; the ability to rebuild the frame purely from model state.

**Evidence:** `src/modules/ui/RootView.ts`; `src/modules/editor/SourceTextPaneContent.ts`;
`src/modules/editor/EditorPaneRenderer.ts`; `src/modules/editor/SourceTextPaneContent.test.ts`;
`src/modules/ui/PaneProjection.test.ts`.

**Impossible if true:** a renderable that is the source of scroll/selection/cursor truth; a
render pass that writes model state.

**Verification:** `bun test src/modules/editor/SourceTextPaneContent.test.ts
src/modules/ui/PaneProjection.test.ts`; review the renderable constructors for domain model fields
and the paint methods for model writes.

**Status:** provisional

**Last refined:** 2026-07-29

### Only the visible window is rendered

**Invariant:** If the document, tree, or list is larger than the viewport, then only the visible
window is materialized into renderables each frame — render cost is O(viewport), not O(content).

**Scope:** editor body rendering in `EditorPaneRenderer`, file-tree rendering in
`TreePaneRenderer`, and command-palette list rendering in `OverlayLayer`.

**Mechanism:** `EditorPaneRenderer.render` asks `EditorWrap.visualRowsFromOffset` for the viewport
window and tokenizes only those rows; `TreePaneRenderer.render` slices the visible tree window;
`OverlayLayer.update` slices `commands.filtered` to `commandPaletteViewportRows`. Realizes *Cost
tracks the actively observed set*.

**Generates:** viewport-bounded tokenization; windowed tree/list rendering; flat render cost as
files/repos grow.

**Evidence:** `src/modules/editor/EditorPaneRenderer.ts`;
`src/modules/filetree/TreePaneRenderer.ts`; `src/modules/ui/OverlayLayer.ts`. Since 2026-07-21 the
editor also virtualizes columns: each visible line is sliced to the visible display-column window
(grapheme-safe, memoized boundaries) before tokenizing, so a 50k-char line drags and renders at
normal speed (verified: 3 drag-selects ≈ 0.1s processing; open and settle 538ms). Trade-off recorded:
tokens start at the slice, so left-context-sensitive highlighting can differ at the window edge.

**Impossible if true:** a frame that tokenizes or builds renderables for every line of a large
file, or every row of a large tree; a frame whose cost depends on total LINE LENGTH rather than
visible columns (the horizontal twin).

**Verification:** a test opening a 100k-line document asserting tokenization count per frame is
bounded by viewport height.

**Status:** provisional

**Last refined:** 2026-07-29

### One visible file line is one visual row when word wrap is off

**Invariant:** If word wrap is OFF (the default), then each visible file line renders as exactly one
visual row — long lines clip at the right edge and horizontal scroll covers the rest — while lines
inside a collapsed fold contribute zero rows. The gutter, caret Y, selection rows, and click
hit-testing all read that same mapping. When word wrap is ON, a visible file line may contribute
multiple segments, and the gutter numbers only its FIRST visual row (continuation rows blank).

**Scope:** the gutter and code renderables in `SourceTextPaneContent`, with the visual-row mapping in
`EditorPane`, in wrap-off mode. (Historically this was recorded as unconditional — "an editor pane
NEVER soft-wraps"; word wrap becoming a mode on 2026-07-21 and folding contributing zero-row lines
on 2026-07-26 scoped it honestly.)

**Mechanism:** the code renderable is `wrapMode: 'none'` in BOTH modes — the renderable itself never
wraps. `EditorWrap.visualRowsFromOffset` feeds the rows in both modes: wrap-OFF contributes one
segment for a visible line, wrap-ON contributes pre-wrapped segments, and a folded body contributes
zero. Row identity is always decided ABOVE the renderable, never by widget wrapping heuristics.

**Generates:** the consecutive-gutter smoke check for unfolded content; one shared visual-row window
for render, caret, selection, and pointer hit-testing; the guarantee that toggling wrap OFF restores
one row per visible line without reviving folded bodies.

**Evidence:** human-QA regression (a wrapped tail once desynced every gutter number below it);
`smoke-editor.sh` "no soft-wrap" check — consecutive unfolded rows carry consecutive gutter
numbers; `src/modules/editor/SourceTextPaneContent.ts` keeps `codeBody.wrapMode: 'none'`;
`scripts/harness/smoke-code-folding-harness.ts`.

**Impossible if true:** with wrap off, a visible file line occupying two visual rows, a folded body
occupying any visual row, or a gutter number disagreeing with the file line beside it; in either
mode, the OpenTUI renderable (rather than the row source) deciding where a line breaks.

**Verification:** `smoke-editor.sh` consecutive-gutter check (wrap-off);
`bun scripts/harness/smoke-code-folding-harness.ts`; the wrap-mode inversion lives with the wrap
record (continuation rows have BLANK gutters).

**Status:** established

**Last refined:** 2026-07-29

### The caret renders at the cursor display column

**Invariant:** If the editor is focused, then a caret is drawn at the cursor's **display column**
on its line — not merely a marker in the gutter — accounting for tabs and wide glyphs.

**Scope:** `EditorPane.visualPosition`, `SourceTextPaneContent.caretAnchor`, and the native cursor
projection in `RootView`.

**Mechanism:** `EditorPane.visualPosition` maps the cursor through the current visual-row window.
`SourceTextPaneContent.caretAnchor` adds the code renderable's actual laid-out `codeBody.x/y` screen
cell from yoga. `RootView` adds **+1 on both axes** because the native terminal cursor is 1-based.
No layer hand-derives layout constants. Stands on *A cursor position resolves to three distinct
coordinates* (editor).

In wrap mode the caret cell comes from the same logical-to-visual mapping that the render uses:
`EditorPane.visualPosition` returns the display column within the wrapped segment and its row index
in `visualRowsWindow`. Horizontal scroll is inert in wrap mode. The 1-based ANSI offset and the tmux
`#{cursor_x},#{cursor_y}` oracle are unchanged. The caret must agree with tmux's cursor in either
mode.

**Generates:** a real caret; correct visual position on lines with tabs/wide chars; a caret that
stays correct when the layout changes (the anchor moves with the renderable).

**Evidence:** `src/modules/editor/EditorPane.ts`;
`src/modules/editor/SourceTextPaneContent.ts`; `src/modules/ui/RootView.ts`. HUMAN-QA BUG FIXED
(2026-07-21): the caret rendered one row HIGH — two stacked causes:
(1) 0-based cells passed to the 1-based `setCursorPosition`, and (2) hand-derived x constants that
had drifted from the real layout. Both fixed by anchoring to `codeBody.x/y` + the ANSI +1. Verified
against tmux's OWN cursor position (`#{cursor_x},#{cursor_y}` — the authoritative channel for a
native caret): after typing, the caret cell is exactly one right of the typed glyph's frame cell on
the SAME row. Permanent smoke regression (`smoke-editor.sh` caret-cell check).

**Impossible if true:** a caret drawn in a fixed gutter cell regardless of the cursor column; a
caret whose cell disagrees with the character beneath it on a line with tabs or wide glyphs; a caret
one row/column off from the typed glyph.

**Verification:** the smoke's caret regression — tmux `#{cursor_x},#{cursor_y}` == typed glyph's
FrameProbe cell + (1,0). LESSON: the earlier "established"-by-frame-diff proofs never asserted the
NATIVE cursor cell (FrameProbe cannot see it) — a channel gap human QA caught; tmux's cursor
position is the right oracle for the caret.

**Status:** established

**Last refined:** 2026-07-29

### The selected range renders with a background

**Invariant:** If a non-empty selection exists, then exactly the selected range is drawn with a
selection background, aligned to the model's `selectionRange()`, on the cursor's content row(s).

**Scope:** the `SelectableText` code renderable in `SourceTextPaneContent` and
`EditorPane.applySelection`.

**Mechanism:** the editor is split into a **gutter** renderable (line numbers + current-line marker)
and a **code** renderable (`SelectableText`, syntax only) so the code buffer holds no gutter —
OpenTUI's native selection then never shades a gutter on a multi-line span, and code-local selection
coords are pure display columns. `EditorPane.applySelection` maps the model `selectionRange()`
through `visualPosition` into viewport-local visual rows and display columns. It clamps ranges that
start before or end after `visualRowsWindow`, then drives `SelectableText.setSelectionRange`.
`SelectableText` writes OpenTUI's `lastLocalSelection`, refreshes the local selection, and requests
a render. `SourceTextPaneContent.paint` applies that selection after it paints the current code
buffer, so the coordinates resolve against the same frame.
Stands on *A cursor position resolves to three distinct coordinates* (editor) and *Selection is an
anchor plus the cursor* (editor).
Mouse addendum (2026-07-21): the MODEL is the only selection writer. Mouse events on the code
renderable drive `cursor` and `anchor`. `EditorPane.documentPositionAtCell` reads the matching row
from `visualRowsWindow`, then maps the display column through that row's segment and horizontal
scroll state. `applySelection()` projects the model into the native highlight each paint. OpenTUI's
own mouse-drag selection is disabled (`selectable:false`) — it was a second writer the model never
saw, so the next paint wiped its highlight (the human-QA "selection appears then disappears" bug),
and Ctrl+C (which copies the model selection) copied nothing.

**Generates:** a visible selection block that tracks the model; multi-line shading without touching
the gutter.

**Evidence:** `src/modules/editor/SourceTextPaneContent.ts`;
`src/modules/editor/EditorPane.ts`; `src/modules/ui/SelectableText.ts`. VERIFIED by FrameProbe
frame-diff (`TUI_FRAME_DUMP=1`). Selection on doc line 3, cols [1,4) → exactly 3 contiguous
bg-changed cells on buffer row **y=4** (line 3's content row), x=38..40
in the code area, bg `95,95,95,255`, no gutter cells; multi-line selection spans rows 4–5. The
earlier "~4× scale/offset" was NOT a render bug — it was a FrameProbe defect (it read `bg` as one
value per cell; OpenTUI stores fg/bg as FOUR Uint16 RGBA lanes per cell, so stride-1 reads aliased
one cell's change across four). FrameProbe now decodes 4 lanes (`FrameProbe.read`, regression-tested
in `FrameProbe.test.ts`); the native selection was correctly positioned all along. Confirmed
independently by a scoped codex worker (cross-check).

**Impossible if true:** a shaded range that disagrees with `selectionRange()`; a multi-line selection
that shades the gutter; a highlight offset from the cursor's content row.

**Verification:** FrameProbe frame-diff (before/after a selection; the changed `bg` cells land on the
cursor's content row at the selected display columns — noise-free, proven by a no-action control).
Selection MODEL: `scripts/smoke-editor.sh` (Shift+Right → `hasSelection`, Escape clears; mouse
drag-select → persists across ~1s of frames → Ctrl+C reports copied chars via `lastCopyChars`) +
editor unit tests. Persistence proven: highlight cells identical 1s after the drag.

**Status:** established

**Last refined:** 2026-07-29

### A scrollable text surface is drag-selectable with edge auto-scroll

**Invariant:** If a text surface renders more content than fits and exposes a scrollbar, then its text
is also selectable by pointer drag, and a drag whose pointer leaves the surface's edge auto-scrolls
the content in that direction while extending the selection. Reachability and selectability are the
same property: any row you can scroll to, you can select to. A surface that scrolls but cannot
drag-select (or selects only what is already on screen) violates this.

**Scope:** every scrollable text surface — the editor code body, the diff view, the LSP hover card,
the rendered Markdown preview, and the Settings overlay. Not plain non-scrolling labels (status
bar, tab titles), which have nothing to scroll to.

**Mechanism:** all five compose the SAME `SelectionDragBehavior` — the host supplies only
coordinate mapping (`positionAtCell`), selection-model writes (`begin`/`extend`/`finishSelection`),
and a `scrollRows`/`scrollColumns` pair; the behavior owns the pointer-drag lifecycle and the
edge-overshoot rate integration. Because the edge autoscroll is wired to the SAME `scrollBy` the
wheel/scrollbar drive, dragging past an edge reaches exactly the rows the bar reaches. The hover card
maps screen cells to ABSOLUTE content rows (`scrollTop + rowOffset`) so a selection stays anchored to
content across scrolls, and paints it window-local each frame (the *selected range renders with a
background* projection). Stands on *One writer per scroll regime per frame* (the drag's `scrollRows`
is that frame's sole writer) and *The selected range renders with a background*.

A terminal mouse reports whole cells, so a drag has no sub-cell side; the shared behavior therefore
makes a rightward/downward release INCLUSIVE of the grapheme under the release cell — it advances the
head one grapheme past a release at or after the anchor, clamped to the line's end-of-line caret
(`lineGraphemeCount`). Without this the half-open range stops before that grapheme and drops the last
character of a word — most visible dragging to a line scrolled fully right. This inclusive rule lives
once in `SelectionDragBehavior` (each host only supplies `lineGraphemeCount`) so no surface selects one
character short while another selects whole.

**Generates:** one selection/scroll feel across every text pane; a new scrollable pane is correct by
construction the moment it wires the shared behavior — no per-pane drag/autoscroll rules to drift.

**Evidence:** `EditorPane` and `DiffView` have composed `SelectionDragBehavior` since the selection
work; `HoverCard` composes the identical behavior on BOTH axes; `OverlayLayer` wires Settings through
`TextSelectionModel`, `SelectableText`, and `ScrollableTextViewport`; `MarkdownSplitView` supplies
its rendered-text selection model to the same viewport; the clipboard boundary harness drag-selects
`Scrolling`, observes the selection background, and copies exactly that text.

**Impossible if true:** a pane with a working scrollbar whose off-screen rows cannot be selected; a
drag that selects but never auto-scrolls at the edge; two scrollable panes with divergent drag rules.

**Verification:** review that each scrollable surface constructs `SelectionDragBehavior` (no bespoke
drag path) + `scripts/smoke-hover.sh` drives a drag across the card's scroll boundary and asserts the
copied text via `lastCopyChars`; `scripts/smoke-editor.sh` covers the editor (its "rightward
drag-select INCLUDES the char under the release cell" case asserts a 7-char word copies whole, not 6);
`smoke-diff-overview` covers the diff; and
`bun scripts/harness/smoke-clipboard-frame-boundary-harness.ts` covers Settings.

**Status:** provisional

**Last refined:** 2026-07-27

### A scrollbar track is derived per frame from its region rect

**Invariant:** If a pane overflows on an axis, then that axis has a scrollbar whose track occupies
the trailing inner edge of the pane's CONTENT rect, derived each frame through the ONE geometry
source; every non-overflowing axis has no bar. The configured cross-axis cell count is the pointer
target on both axes. A vertical bar fills those cells, while a horizontal bar paints only the lower
half of its trailing row so both orientations have the same apparent weight in a terminal cell grid.
The vertical track uses the full content height. The horizontal track ends one column before the
vertical track, so their corner cell belongs to the vertical bar. Each visible track and thumb
derives its colours from the active theme during that frame.

**Scope:** every scrollbar (editor vertical + horizontal, file tree vertical + horizontal, git
changes vertical + horizontal, git commit log vertical + horizontal, agent transcript, terminal
scrollback, the rendered Markdown preview, the structure right dock, and any future pane).

**Mechanism:** `ScrollbarGeometry.Class.scrollbarGeometry(orientation, region, scroll)` is the only
authority for placement, track length, min-thumb inflation, exact-extremes scale, and hidden-when-
fits. `ScrollbarSync.applyBar` applies the configured cross-axis cell count; every bar is a
`SolidThumbScrollBar`. The same call reads the live theme and applies its `panel` and `dim` pair.
Other scrollbar consumers also apply their live colour pair during frame synchronization. The
painter keeps the full configured rect as OpenTUI's native drag geometry, then chooses the
axis-specific paint inside that rect. The geometry gives the full region height to a vertical track
and gives `region.width - 1` columns to a horizontal track. The reported viewport and position use
those track lengths, so paint and drag mapping change together.

**Generates:** a bar on every overflowing axis; aligned tracks across split positions; reachable
clipped content; grabbable thumbs; no phantom bars; equal apparent weight across axes; live theme
switches that repaint every visible bar without reconstruction.

**Evidence:** `src/modules/ui/ScrollbarGeometry.test.ts` (17 region/property cases);
`scripts/harness/smoke-scrollbars-harness.ts` (narrow tree/changes/log overflow, raw SGR reveal,
both rendered Markdown preview axes, continuous preview thumb drag, preview track click, and live
dark-to-light-to-dark scrollbar colour derivation at 500 and 100,000 lines);
`scripts/harness/smoke-plugin-manifest-harness.ts` (overflowing structure rows, live right-dock
geometry, track click, and keyboard parity);
`scripts/harness/smoke-terminal-harness.ts` (long terminal scrollback and solid vertical thumb),
wired in `scripts/merge-gate.sh`.

**Impossible if true:** an overflowing tree, changes, or log row whose clipped tail cannot be
reached; a bar visible with nothing to scroll; a full-cell horizontal bar that reads twice as thick
as its vertical peer; a thin paint row that shrinks the horizontal pointer target; two bars deriving
placement from different math; a horizontal bar painting the two-axis corner; a vertical bar ending
above the horizontal row; a visible bar retaining the old palette after a live theme switch.

**Verification:** `bun test src/modules/ui/ScrollbarGeometry.test.ts && bun
scripts/harness/smoke-scrollbars-harness.ts && bun
scripts/harness/smoke-plugin-manifest-harness.ts && bun
scripts/harness/smoke-terminal-harness.ts`

**Status:** established

**Last refined:** 2026-07-29

### The editor overview derives from the decoration snapshot

**Invariant:** If an active document has diff or diagnostic decorations, then the editor vertical
scrollbar paints their whole-document positions from the same cached `GutterDecorations` snapshot
that feeds the gutter and body, without changing the scrollbar track or thumb geometry.

**Scope:** The normal editor's vertical `SolidThumbScrollBar`, `GutterDecorations.snapshotFor`,
`OverviewRuler`, and `ScrollbarSync`. Horizontal, tree, panel, and `DiffView` scrollbars carry no
normal-editor overview marks.

**Mechanism:** `GutterDecorations.snapshotFor` keeps one stable snapshot identity until a
contribution or document revision changes. `OverviewRuler.project` caches by that identity, the
`EditorWrap` visual-projection key, and track length, then maps each decorated line through
`EditorWrap.visualRowOfLine`: a visible line uses its first segment and a hidden body uses its fold
header. The resulting visual rows are projected proportionally onto track cells.
When multiple marks map to one track cell, the winning color order is error > warning > info > hint
> modified > added > deleted, while every aggregated hover label remains available.
`SolidThumbScrollBar` paints one trailing-cell semantic pip over the already-selected track or thumb
background after the unchanged thumb rect is computed; it never changes width, height, scroll state,
or `getThumbRect`.

**Generates:** Off-screen errors and changes visible at a glance; O(mark count) aggregation only on
decoration, document, or track-size change; O(track marks) paint; unchanged native drag and
track-click behavior.

**Rejected alternatives:** A second diagnostic or diff scan in `ScrollbarSync` — it creates a
second mark authority. A sibling ruler renderable — it changes layout width and risks thumb
oscillation. A mark-specific click handler — it would replace the slider's existing track-click and
drag contract, so marks remain paint-only.

**Evidence:** `src/modules/workspace/GutterDecorations.ts`;
`src/modules/ui/OverviewRuler.ts`; `src/modules/ui/ScrollbarSync.ts`;
`src/modules/ui/SolidThumbScrollBar.ts`; cache, aggregation, and geometry tests in
`OverviewRuler.test.ts` and `SolidThumbScrollBar.test.ts`;
`scripts/harness/smoke-diagnostics-harness.ts`.

**Impossible if true:** A diagnostic 900 lines below the viewport with no overview pip; a folded
body mark projected by a raw document-line ratio instead of its visible header row; an unchanged
snapshot and visual projection triggering overview aggregation on every frame; marks changing track
width or the thumb rectangle; warning winning a shared track cell that also contains an error.

**Verification:** `bun test src/modules/ui/OverviewRuler.test.ts
src/modules/ui/SolidThumbScrollBar.test.ts && bun scripts/harness/smoke-diagnostics-harness.ts &&
bun scripts/harness/smoke-scrollbars-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-26

### One scrollbar painter gives each axis equal visual weight

**Invariant:** Every vertical scrollbar thumb and track renders as BACKGROUND colour on blank cells.
Every horizontal scrollbar thumb and track renders with the lower-half block `▄` and a transparent
background. The whole-cell thumb rect is the same rect the slider's mouse hit-test uses, and fixed
viewport/content inputs produce a fixed whole-cell thumb length at every scroll position. Both axes
use the same theme track and thumb colours. At a two-axis corner, the vertical painter owns the
bottom-right cell and the horizontal painter stops in the preceding column.

**Scope:** every scrollbar in the app: the pane bars built by `ScrollbarSync`, the optional
`PaneContent` scroll bars (terminal scrollback), both `ScrollableTextViewport` bars (hover card,
agent transcript, markdown preview), and the two `DiffView` bars. `SeparatorAppearance`, shared with
`SplitterElement`, owns the axis-specific cell treatment.

**Mechanism:** all scrollbar construction goes through ONE class, `SolidThumbScrollBar`
(`src/modules/ui/SolidThumbScrollBar.ts`). It delegates track and thumb paint to
`SeparatorAppearance`, which uses background fill for vertical rectangles and `▄` with transparent
background for horizontal rectangles. The lower half anchors the bar to the pane's
trailing edge; the upper half stays open. This reads at half the height without weakening the
whole-cell hit target. The glyph has the same shape with the dark and light palette colour pairs.
`ScrollbarSync` supplies one `panel` and `dim` pair to every bar it constructs, independent of axis.
Other shared-painter consumers set one pair on both sliders during their frame synchronization.
The normalized rect reads OpenTUI's virtual half-cell size and start, rounds the
position-independent size once, and clamps the rounded start to the track with the shared two-cell
minimum. It replaces the slider instance's `getThumbRect`, so the same normalized rect also drives
the native mouse hit-test.

The class gives every bar at least z-index 1. Lazy source-pane content can therefore paint later at
the default layer without covering the already-constructed editor bars in the pointer hit grid.
An explicit stronger caller priority remains unchanged. The same seam re-asserts
`slider.viewPortSize` after each scroll-state write, healing OpenTUI's stale-max clamp (which
otherwise pins the viewport at its 0.01 floor and collapses every thumb to a half-cell).

**Generates:** seamless vertical thumbs; thinner horizontal bars; proportional thumb length; a
visible bar that receives its own press and every pressed-pointer move; drag positions that agree
with the drawn thumb.

**Evidence:** driven frame assertions in `scripts/harness/smoke-scrollbars-harness.ts`: zero
block-element glyphs in vertical bars, contiguous multi-cell bg-fill vertical thumb runs, lower-half
cells only in horizontal bars, and per-completed-frame editor wrap-off, editor wrap-on, and diff
probes that record constant viewport/total inputs, moving scroll positions, and byte-identical thumb
extents. At 500 and 100,000 lines through a live dark-to-light-to-dark switch, the corner cell
contains vertical background paint, the horizontal endpoint is one column before it, and both axes
expose only the active pair. At both scales, its real PTY drag probe records a new scroll position
after every pressed-pointer move on both editor axes, both Markdown preview axes, and the structure right-dock
bar. A preview vertical drag and track click both claim preview leadership and move the synchronized
source. Its agent probe holds
`viewportRows=14` and `contentRows=181` while 20 changing positions all paint a 2-row thumb.
`scripts/harness/smoke-terminal-harness.ts` proves the same solid multi-cell thumb on real terminal
scrollback. `src/modules/ui/SolidThumbScrollBar.test.ts` exhausts half-cell start parity and the
two-cell minimum, preserves caller z-index, and paints the horizontal shape with both palette pairs.

**Impossible if true:** a vertical thumb showing horizontal seams in Terminal.app; a vertical bar
cell holding `█`/`▀`/`▄`; a horizontal bar cell holding `█` or `▀`; a half-cell-long thumb on an
overflowing pane; a visible scrollbar whose press reaches later default-layer content; a drag
grab-point disagreeing with the drawn thumb; horizontal and vertical bars using different theme
colours; horizontal paint occupying the two-axis corner.

**Verification:** `bun test src/modules/ui/SolidThumbScrollBar.test.ts && bun
scripts/harness/smoke-scrollbars-harness.ts && bun scripts/harness/smoke-terminal-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-29

### Selection is item-anchored click-set keyboard-moved and stays

**Invariant:** In every selectable list — the file tree, git changes/staging, the commit log, stashes,
and any future list — the SELECTION is persistent state anchored to an ITEM, mutated ONLY by a click
(sets it) and the keyboard (moves it while the list is focused). It is independent of the mouse HOVER (a
separate transient highlight, never selection truth) and of the SCROLL position (scrolling the list never
changes what is selected). The selected item stays HIGHLIGHTED even when its pane is not focused (dimmed
when unfocused, full when focused), so the selection is always visible and the keyboard resumes from it
when the pane regains focus. Opening a FILE additionally moves keyboard focus to the editor (the settled
focus decision) — but that neither moves nor clears the list's selection.

**Scope:** file tree, git changes/staging, git commit log, git stashes, and any future selectable list.

**Mechanism:** `FileTree.selectedIndex` and `GitPanel.changesIndex`/`logIndex` hold selection;
`hoveredIndex`/`changesHovered`/`logHovered` and each pane's scroll offsets hold the other two states.
`TreePaneRenderer.render` and `GitPaneRenderer.render` always project selection, using
`palette.selection` while each region owns keyboard focus and `palette.cursorLine` otherwise;
`GitPanel.setChangesSelection`/`setLogSelection` leave scroll untouched while keyboard movement
minimally reveals through the pane's live viewport height.

**Generates:** click → set selection (+ open/focus-editor for a file); ↑/↓ while focused → move
selection + reveal; wheel/scrollbar → move viewport only; hover → transient highlight only; blur →
selection stays, highlight dims.

**Evidence:** `src/modules/filetree/TreePaneRenderer.ts` and
`src/modules/git/GitPaneRenderer.ts` (selection paint);
`src/modules/filetree/FileTreePaneContent.ts` and `src/modules/git/GitPaneContent.ts` (click, hover,
and scroll handlers); `src/modules/git/GitPanel.ts` selection setters and movers;
`src/modules/git/GitPanel.test.ts`; `scripts/smoke-selection.sh`, hard-wired in
`scripts/merge-gate.sh`, drives tree, changes, and commit-log click/hover/wheel/blur/refocus paths and
asserts full/dim backgrounds through FrameProbe.

**Impossible if true:** selection following the mouse hover or the scroll position; a clicked selection
vanishing on scroll or on losing focus; a list where click selects but the keyboard cannot move from
there; different list panes disagreeing on the selection model.

**Verification:** `bun test src/modules/git/GitPanel.test.ts
src/modules/filetree/FileTree.scroll.test.ts && bash scripts/smoke-selection.sh`

**Status:** established

**Last refined:** 2026-07-29

### TS diagnostics render as an underline and overview mark

**Invariant:** If the language server reports a diagnostic for the active document, then every
visible range has a severity-coloured in-body underline and every covered logical line has a
severity-coloured whole-document overview mark, while the diff gutter carries no diagnostic.

**Scope:** Language diagnostics contributed through
`LspWorkspaceProvider.byLine`, the code body in `EditorPaneRenderer`, and the
editor overview in `ScrollbarSync`. The source-control diff gutter is
explicitly outside the diagnostic projection.

**Mechanism:** `LspWorkspaceProvider.byLine` creates only
`DiagnosticLineDecoration`, whose discriminated shape contains a severity and
underline but no gutter member. `EditorPaneRenderer` paints its code range;
`OverviewRuler` projects the same cached `GutterDecorations` snapshot over the
whole document. Push diagnostics from typescript-language-server and pull
diagnostics from tsgo still funnel through the same store.

**Generates:** Red error, yellow warning, and info/hint underlines under code; matching pips at
proportional scrollbar positions; a gutter whose red can only mean a source-control deletion.

**Rejected alternatives:** Keep the diagnostic gutter mark — it collided with the red deletion mark
in the same column, which is the user-visible ambiguity that refined this record.

**Evidence:** `src/modules/lsp/LspWorkspaceProvider.ts`;
`src/modules/editor/EditorPaneRenderer.ts`;
`src/modules/ui/OverviewRuler.ts`; `scripts/harness/smoke-diagnostics-harness.ts` drives both real
TypeScript servers and observes the underline, overview, and absent diagnostic gutter mark.

**Impossible if true:** A diagnostic glyph of any shape in the gutter; a far-below-viewport
diagnostic with no proportional overview pip; an on-screen error range without its red underline.

**Verification:** `bun test src/modules/ui/OverviewRuler.test.ts && bun
scripts/harness/smoke-diagnostics-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-26

### Settings selection stays inside its viewport

**Invariant:** If `SettingsPanel.selectedIndex` changes while Settings is open, then the selected
descriptor row is painted inside the published Settings viewport span.

**Scope:** Keyboard selection changes in the Settings overlay at every terminal geometry. Pointer
selection and manual wheel or thumb scrolling without a selection change are outside this rule.

**Mechanism:** `OverlayLayer.settingsLines` emits one logical line per `settingsContentRows` row, and
`settingsText` disables implicit wrapping so OpenTUI paints that same one-row geometry.
`revealViewportRow` then moves `settingsViewport.scrollTop` until the selected line lies between zero
and `settingsViewportRows - 1`.

**Generates:** Step-wise reveal in both navigation directions; geometry-independent section
boundaries; a Settings content extent that matches its painted row count.

**Evidence:** `src/modules/ui/OverlayLayer.ts`;
`scripts/harness/smoke-overlay-dialog-harness.ts`
`requireEverySettingsNavigationStepRevealed`.

**Impossible if true:** `settingsSelectedLabel` changing while no selected marker is painted inside
the Settings viewport; a section boundary or wrapped label placing the selected row below the
published span.

**Verification:** `bun scripts/harness/smoke-overlay-dialog-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-27

### Settings are editable by mouse per widget kind

**Invariant:** Every setting in the panel is editable by MOUSE, not only the keyboard — matching the
"everything is like a UI app" principle. Each row draws a clickable widget matched to its kind: a number
shows `[−]`/`[+]` steppers, a boolean a clickable toggle, and an enum / dynamic-enum `‹`/`›` arrows;
clicking a row's label selects it. A click hit-tests against the widget zones the renderer drew THIS
frame (one geometry source — the drawn cell and its hit-rect never disagree), then selects the row and
applies the same `adjust(±1)` the keyboard uses, so mouse and keyboard edits are one code path.

**Scope:** the settings render + `settingsText.onMouseDown` hit-test in `OverlayLayer`
(`settingsWidgetZones`), and `SettingsPanel` (`rows()` exposing `kind`/`index`, `select`, `adjust`).

**Mechanism:** the settings renderer emits, per row, a `select` zone over the label and `dec`/`inc`
(or a single toggle `inc`) zones over the widget glyphs, recording each zone's `(row, columns, index,
action)` as it advances a running column counter. `settingsText.onMouseDown` maps the pointer's local
(row, column) to a zone, calls `settingsPanel.select(index)`, then `adjust(-1|+1)` — the identical
mutation the ←/→ keys drive (numbers step+clamp, booleans toggle, enums cycle), live-applied + saved.

**Generates:** a settings panel usable entirely by mouse (steppers, toggles, dropdown-style arrows), with
mouse and keyboard sharing one adjust path so they never diverge; sections give the list visual grouping.

**Evidence:** `src/modules/settings/SettingsPanel.test.ts` (rows expose `kind`/`section`/`index`;
`select` + `adjust` mutate the target row for numbers/booleans/enums/dynamic-enums);
`scripts/smoke-voice-picker.sh` (clicking a widget stepper/arrow in the rendered panel changes the
setting via the recorded zones).

**Impossible if true:** a setting editable by keyboard but not mouse; a mouse click that edits a
different row than the widget drawn under the pointer; a mouse edit that bypasses the keyboard's
adjust/clamp path.

**Verification:** `bun test src/modules/settings/SettingsPanel.test.ts && bash scripts/smoke-voice-picker.sh`

**Status:** provisional

**Last refined:** 2026-07-23

### Right dock command and mouse affordance share one toggle

**Invariant:** If the right dock can be shown or hidden through a command, then the status-bar
affordance performs that same toggle and visibly reflects the resulting state; mouse and keyboard
never mutate separate visibility flags.

**Scope:** The right-dock slot (a generic `PanelHost`; the structure navigator is its first
contributed occupant), `view.toggleRightDock`, and the right-dock button in `StatusBar`.

**Mechanism:** Bootstrap owns one `toggleRightDock` closure over the right dock's `PanelHost` and
injects it into both the command registry and `StatusBar`. The button calls that closure and paints
with the accent role while hovered or while the dock is visible.

**Generates:** A `PaneContent` registration (the structure pane today) reveals the same host;
clicking the status button or invoking the command opens and closes the same resizable dock; a
focused right-dock content resolves its own keybinding context before raw `handleKey`, the same
contract the primary dock gives its contents.

**Evidence:** `src/modules/app/Bootstrap.ts`; `src/modules/commands/CommandDefaults.ts`;
`src/modules/ui/StatusBar.ts`; `scripts/harness/smoke-layout-harness.ts`.

**Impossible if true:** the button and command disagreeing about whether the right dock is visible,
or a button that changes appearance without changing the hosted slot.

**Verification:** `bun scripts/harness/smoke-layout-harness.ts` drives both command and pointer
paths and asserts the shared visibility state plus emulator geometry.

**Status:** provisional

**Last refined:** 2026-07-24

### One panel host owns keyboard focus

**Invariant:** If a `PanelHost` claims keyboard focus, then every other host in its
`PanelHostFocusSet` loses focus before the next input routes.

**Scope:** The primary dock, right dock, and bottom panel hosts built by `Bootstrap`.
Modal overlays retain their separate input owner.

**Mechanism:** `PanelHost.focus` calls `PanelHostFocusSet.claim` before it focuses its active
content. The focus set blurs every other registered host.

**Generates:** One focus operation for primary-dock, right-dock, and bottom-panel clicks and
toggles; input routing with one focused host.

**Rejected alternatives:** Blur sibling hosts at each click site — a new or missed path can
leave two focus booleans true.

**Evidence:** `src/modules/ui/PanelHostFocusSet.ts`;
`src/modules/ui/PanelHostFocusSet.test.ts` `a focus claim blurs every other registered panel
host`; `scripts/harness/smoke-activitybar-harness.ts`.

**Impossible if true:** The primary dock and right dock both report focus after a right-dock
click; one key reaches a host only because its branch appears first in the input ladder.

**Verification:** `bun test src/modules/ui/PanelHostFocusSet.test.ts && bun
scripts/harness/smoke-activitybar-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-29

### Command bar paint and hit geometry are identical

**Invariant:** If the workspace command bar paints Back, Forward, the current folder, or Layouts,
then the same `CommandBarGeometry` segment that places the control receives its mouse click.

**Scope:** `CommandBar`, the one-row bar below the workspace tabs, the QuickOpen file surface, the
navigation history, and the `BoundedListPopup` layouts adapter.

**Mechanism:** `CommandBar.layoutGeometry` returns the centered navigation and folder segments plus
the right-pinned Layouts segment. `CommandBar.update` paints those segments, and
`controlAtColumn` resolves pointer input from the stored geometry before routing to
`Workspace.navigateBack`, `Workspace.navigateForward`, `QuickOpen.show`, or the layouts popup. The
layouts adapter reads the four named `LayoutModel.presets()` entries and applies the selected preset
through the injected root-layout action; it does not generate or label axis permutations.

**Generates:** Centered Back and Forward buttons; a clickable current-folder label; a right-edge
Layouts button; a bounded named-presets menu; pointer and paint positions that cannot drift apart.

**Evidence:** `src/modules/ui/CommandBar.ts`; `src/modules/ui/CommandBar.test.ts`;
`scripts/harness/smoke-layout-harness.ts`.

**Impossible if true:** Clicking a painted command-bar control runs a neighboring control or does
nothing; the Layouts button moves away from the right edge; the menu exposes encoded permutations
instead of named presets; the folder label opens a surface other than QuickOpen file search.

**Verification:** `bun test src/modules/ui/CommandBar.test.ts && bun
scripts/harness/smoke-layout-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### The file tree is a pane content citizen

**Invariant:** If the file tree occupies the primary dock, then it is registered as
`FileTreePaneContent` in a generic `PanelHost`, and the host projects and routes it through the
`PaneContent` interface independently of whether the primary dock is on the left or right.

**Scope:** `FileTreePaneContent`, the primary-dock `PanelHost`, `Sidebar`, and the primary dock slot
resolved by `LayoutModel`. Git and Extensions extraction into `PaneContent` is outside this wave.

**Mechanism:** `FileTreeContributor` constructs and registers `FileTreePaneContent` through the
application-contribution context. `RootView` asks the host for its active content and calls
`PaneContent.render`, while `Sidebar` forwards pointer and wheel events through the optional pane
methods. The adapter delegates rendering to `TreePaneRenderer` and mutations to the active
`FileTreeWorkspace`, which invokes the host's generic document-opening capability for a leaf.

**Generates:** One file-tree pane adapter; the same expand, selection, open, navigation, badge,
momentum, and scrollbar behavior in left and right primary-dock positions; no file-tree renderer
call in `RootView`.

**Evidence:** `src/modules/filetree/FileTreeContributor.ts`;
`src/modules/filetree/FileTreePaneContent.ts`;
`src/modules/filetree/FileTreePaneContent.test.ts`; `src/modules/app/Bootstrap.ts`;
`scripts/harness/smoke-layout-harness.ts`.

**Impossible if true:** `RootView` calling `TreePaneRenderer` directly; moving the primary dock to
the right replacing or disabling the tree; a tree click bypassing the `PaneContent` adapter.

**Verification:** `bun test src/modules/filetree/FileTreePaneContent.test.ts && bun
scripts/harness/smoke-layout-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### The panel renders exactly the visible pane content cells each frame

**Invariant:** The bottom panel slot (`PanelHost`) projects every resolved visible
`PaneContent.render(region)` into that content's own cell each frame, with no per-content wiring in
the host or in RootView. Adding another content (Output, Problems, a plugin) needs zero host change.

**Scope:** `PaneContent` (the composable-view seam), `PanelHost` (the generic slot), the panel mount +
render in `RootView`, and `TerminalPaneContent` (the terminal's implementation of the seam).

**Mechanism:** `PanelHost` holds a registry keyed by `PaneContent.id`, resolves the visible cell
layout, and keeps `activeId` aligned with the focused content. `RootView.update` mounts one generic
heading-and-body container per resolved cell and fills its body from
`content.render({width, height, palette, focused})`. RootView contains no terminal-specific render
branch.

**Generates:** a composable bottom panel where each content owns a headed region and any future
PaneContent slots in unchanged; a stateless panel projection.

**Evidence:** `src/modules/ui/PanelHost.test.ts` (registration, generic switching between two fake
contents, focused-key routing, size convergence); `scripts/smoke-terminal.sh` (the terminal renders in
the panel body).

**Impossible if true:** RootView or PanelHost branching on a specific content type to render; a
second content requiring host edits to appear; one visible content being omitted or rendered in
another content's region.

**Verification:** `bun test src/modules/ui/PanelHost.test.ts && bash scripts/smoke-terminal.sh`

**Status:** provisional

**Last refined:** 2026-07-25

### Each panel instance owns one independent session

**Invariant:** If Add creates another Terminal or Agent instance, then it receives an
application-unique identifier and a workspace-local instance label, owns a newly constructed
backend/session, remains registered while its pane or workspace is hidden, and releases that owned
session only when its heading or contents-list row closes, its owning workspace closes, its runtime
withdraws, or the app disposes.

**Scope:** `PaneRuntimes` (the one instance-identity allocator), each contributed `PaneRuntime`,
`AgentFactory`, their `PaneContent` implementations, and the bottom `PanelHost`. Output and Problems
content kinds are outside this wave.

**Mechanism:** `PaneRuntimes.allocateInstanceIdentity` mints scoped opaque identifiers and
workspace-local `<Label>`/`<Label> N` names for every kind, and the owning runtime builds the session
behind them; the host-owned agent pane uses the same numbering shape. Each workspace's
`PanelContentSet` retains its own ordered registry but projects at most one visible instance of each
kind; selecting another same-kind row swaps the visible cell without disposal. `removeContent`
unregisters exactly that identity and calls its `dispose` seam, while other instances and their
session state survive. Workspace-world disposal and runtime withdrawal reach the same disposal
seam for every owned instance.

**Generates:** Independent Terminal 2 and Agent 2 sessions; hidden live instances selectable from the
contents list; one terminal plus one agent visible side by side; instance-scoped close.

**Evidence:** `src/modules/ui/PaneRuntimes.ts`; `src/modules/ui/PaneRuntimes.test.ts`;
`src/modules/terminal/TerminalPlugin.ts`; `src/modules/terminal/TerminalPaneContent.ts`;
`src/modules/agent/AgentFactory.ts`; `src/modules/agent/AgentPaneContent.ts`;
`src/modules/app/Bootstrap.ts`; `src/modules/ui/PanelHost.test.ts`;
`src/modules/terminal/TerminalFactory.test.ts`; `src/modules/agent/AgentFactory.test.ts`;
`scripts/harness/smoke-panel-chrome-harness.ts`.

**Impossible if true:** Terminal 2 sharing Terminal 1's backend; workspace B's first terminal being
labelled Terminal 2 because workspace A owns one; selecting a hidden instance destroying the prior
instance; closing Agent 2 disposing Agent 1; two same-kind instances occupying simultaneous cells.

**Verification:** `bun test src/modules/ui/PaneRuntimes.test.ts
src/modules/terminal/TerminalFactory.test.ts src/modules/agent/AgentFactory.test.ts
src/modules/ui/PanelHost.test.ts && bun scripts/harness/smoke-panel-chrome-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-29

### A focused panel routes keystrokes to its active pane content

**Invariant:** When the panel is focused and no modal input overlay owns the keyboard, every
non-reserved keystroke is encoded to terminal bytes and delivered to `activeContent.handleKey`;
reserved global chords (quit, panel toggle) still fire first so the user is never trapped, and an
unencodable key is swallowed rather than driving the hidden editor beneath. When the panel is not
focused or a modal input overlay owns the keyboard, it consumes no keys.

**Scope:** `PaneContent.keybindingContext`, `PaneContent.claimsContextAction`,
`PaneContent.handleKey`, `PanelHost.handleKey`, and the panel-input branch in `Bootstrap.keyTick`.
The bytes a specific pane produces are that pane's own record.

**Mechanism:** `Bootstrap.keyTick` resolves reserved global chords first (`app.quit`,
`panel.toggleTerminal`), then reads `RootView.modalOverlayOwnsScreen`, which delegates to the
overlay layer's one modal-focus derivation. Only when that slot is empty and
`panelHost.visible && focused` does the panel branch run. There the focused pane's OWN
`keybindingContext` is resolved, and the PANE decides whether it claims the resolved action
(`claimsContextAction`); a declined action falls through to `panelHost.handleKey(key)` as raw
input, which is how a terminal selection owns Ctrl+C while an empty selection still sends SIGINT.
The host reads no pane type and no action vocabulary. Focus follows the toggle and clicks
(`panelContainsPoint`).

**Generates:** a terminal that receives Ctrl+C/Ctrl+D/arrows/typing as a real terminal would, while
Ctrl+Q and the toggle always work; no keystroke both drives the shell and the editor.

**Evidence:** `src/modules/terminal/TerminalKeys.test.ts` (control-byte, arrow, named-key, printable
encoding); `src/modules/ui/PanelHost.test.ts` (focused host routes to the active content);
`scripts/smoke-terminal.sh` (typed `echo hello`+Enter reaches the shell and renders; Ctrl+Q from the
focused terminal still quits); `scripts/harness/smoke-overlay-dialog-harness.ts` (Settings Escape
outranks retained terminal and agent focus).

**Impossible if true:** a focused terminal where typing drives the editor; a key that both types into
the shell and moves the editor cursor; Ctrl+Q swallowed by the focused terminal; keys consumed while
the panel is unfocused; a modal overlay key reaching the pane retained beneath it; the host naming a
pane class or an action prefix to route a keystroke.

**Verification:** `bun test src/modules/terminal/TerminalKeys.test.ts src/modules/ui/PanelHost.test.ts && bash scripts/smoke-terminal.sh`

**Status:** provisional

**Last refined:** 2026-07-25

### A split panel renders every visible cell into its own sub-region

**Invariant:** When the panel holds two or more visible cells, the slot is partitioned left-to-right by
each cell's ratio (one column per interior divider), and each cell's `PaneContent.render` AND its
`onResize` see ONLY that cell's sub-region — never the full slot. The single-cell case is the same code
with one full-width partition, so nothing regresses when nothing is split. One width algorithm
(`PanelHost.cellSpans`) feeds BOTH the laid-out cell width and the content's `onResize`, so a cell can
never be sized for a region different from the one it is painted into.

**Scope:** `PanelHost` (`layout`, `resolvedCells`, `cellSpans`, `setViewportSize`, `moveDivider`), the
panel cell-pool render in `RootView` (`syncPanelCellMount`, the per-span body loop), and any
`PaneContent` (e.g. `AgentPaneContent`, `TerminalPaneContent`) that occupies a cell.

**Mechanism:** `PanelHost.cellSpans(totalColumns)` distributes the slot's inner columns across the
resolved cells by normalized ratio, reserving one column per divider and giving the remainder to the
last cell. `RootView.update` mounts one heading-and-body container per span (a divider before each
container from the second on), sets its width to the span, and fills its body from
`span.content.render({width: span.columns, …})`.
`Bootstrap`'s converge step calls `panelHost.setViewportSize`, which walks the SAME `cellSpans` and
calls each `content.onResize(span.columns, rows)`. `moveDivider` re-flows only the two cells adjacent
to the dragged divider, each clamped to a minimum share.

**Generates:** a terminal | agent (or N-way) bottom panel where each pane is a first-class occupant of
its own region; a resizable divider that reflows both neighbours; a single-pane panel as the degenerate
1-cell case with byte-identical behaviour.

**Evidence:** `src/modules/ui/PanelHost.test.ts` (`split` layout + normalized shares, `cellSpans`
per-cell widths reserving the divider column, `setViewportSize` resizes each cell independently,
`moveDivider` re-flow + minimum clamp); `scripts/harness/smoke-panel-split-harness.ts` clicks the
second status control and drives Ctrl+Shift+S to produce the same terminal | agent split, asserts both headings
and distinct sub-widths, drags the divider, and restores the full-width pane.

**Impossible if true:** a split cell rendered at the full slot width while another cell overlaps it; a
cell whose content is `onResize`d to a region different from the one it is painted into; a divider drag
that resizes one neighbour but not the other; a split that changes the single-pane render path.

**Verification:** `bun test src/modules/ui/PanelHost.test.ts && bun
scripts/harness/smoke-panel-split-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### A focused split panel routes keystrokes to the focused cell

**Invariant:** When the panel is focused and split, every non-reserved keystroke goes to exactly ONE
cell — the focused cell — and clicking a cell makes it the focused cell (focus-follows-click at the
cell grain). The block caret is drawn in the focused cell's sub-region. An unfocused cell receives no
keys and shows no caret. With a single cell this is identical to the old "focused panel routes to its
active content".

**Scope:** `PanelHost` (`focusedIndex`, `focusedContent`, `focusCell`, `handleKey`, `retargetFocus`),
the panel cell-body `onMouseDown` handlers + caret anchoring in `RootView`, and the panel-input branch
in `Bootstrap.keyTick`.

**Mechanism:** `PanelHost.handleKey` delegates to `focusedContent` (the resolved cell at `focusedIndex`,
or the single active content). `RootView` gives each cell body an `onMouseDown` that calls
`panelHost.focus()` + `panelHost.focusCell(index)`, and anchors the caret to the focused cell body's
laid-out screen cell. `focusCell` also writes `activeId`, so the compatibility
`panelActiveContent` projection remains truthful. `focusCell`/`split`/`unsplit` run through
`retargetFocus`, which fires
`onBlur`/`onFocus` only when the focused content actually changes, so exactly one cell is ever focused.

**Generates:** two live panes (agent | terminal) where typing drives only the one you clicked, the
caret sits in the active pane, and switching panes is a single click; no keystroke drives two panes.

**Evidence:** `src/modules/ui/PanelHost.test.ts` (a focused split routes to the focused cell; `focusCell`
moves the routing target; splitting while focused blurs the old content and focuses the new cell);
`scripts/harness/smoke-panel-split-harness.ts` types into the focused agent cell, clicks the terminal
cell, and asserts later terminal keys never reach the now-blurred agent.

**Impossible if true:** a keystroke delivered to an unfocused cell; two cells focused at once; a click
on a cell that does not focus it; a caret drawn in a blurred cell.

**Verification:** `bun test src/modules/ui/PanelHost.test.ts && bun
scripts/harness/smoke-panel-split-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### Bracketed paste survives stream chunking

**Invariant:** If a bracketed paste sequence reaches Invar in arbitrary input chunks, then exactly
one complete UTF-8 payload is routed to the focused terminal child or agent composer.

**Scope:** OpenTUI `StdinParser`, `Bootstrap` paste dispatch, `PanelHost.handlePaste`,
`TerminalPaneContent.handlePaste`, `AgentPaneContent.handlePaste`, and `OpenPty.write`. Editor and
single-line overlay routing keeps the same dispatcher but is outside the two real-host acceptance
paths.

**Mechanism:** OpenTUI's stream parser retains split start marker, payload, and end marker bytes
until it emits one paste event. `Bootstrap` dispatches that complete text through the focused pane
seam, and `OpenPty.write` queues partial libc writes on a non-blocking descriptor until every
terminal payload byte crosses the PTY.

**Generates:** Marker-edge input fixtures; exact 10-byte, 1 KB, and 64 KB terminal and composer
drives; large terminal payloads that cannot truncate on a partial PTY write.

**Rejected alternatives:** Send every harness paste as one write — real terminals split large
payloads and both bracketed-paste markers across PTY chunks.

**Evidence:** `scripts/harness/BracketedPasteInput.test.ts`;
`scripts/harness/smoke-paste-harness.ts`; `src/modules/terminal/OpenPty.ts`.

**Impossible if true:** A split marker becomes typed text; one paste produces multiple composer
insertions; a 64 KB terminal paste loses a suffix because libc accepted only a partial write; paste
reaches the editor while a terminal or agent pane owns focus.

**Verification:** `bun test scripts/harness/BracketedPasteInput.test.ts && bun
scripts/harness/smoke-paste-harness.ts`

**Status:** established

**Last refined:** 2026-07-25

### A pane runtime owns its processes

**Invariant:** If a pane kind is backed by a process, then a contributed `PaneRuntime` owns that
process end to end and the host holds only an opaque `PaneContent`. The host supplies identity,
laid-out geometry, a working folder, and — for a declared task — the command line it was told to
run; it never chooses a shell, a prompt, an environment, a lifetime, or a disposal order, and it
never learns that a pseudo-terminal exists.

**Scope:** `PaneRuntime`, `PaneRuntimeRequest`, `PaneRuntimeHostPort`, `PaneRuntimes`,
`ApplicationContributionContext.registerPaneRuntime`, and the panel creation, add, removal, and
status paths in `Bootstrap`. The pane's own rendering and input contracts are the `PaneContent`
records above; what a specific runtime starts is that runtime's own record.

**Components:**
- One creation path — every pane of a contributed kind is built by `PaneRuntimes.createPane(kind,
  request)`. An ordinary instance, an Add-menu instance, a declared task, and a contributed
  `openRuntimePane` request differ only by the request, so a runtime cannot be reached by a second
  construction route.
- Host-neutral requests — a request carries identity, columns, rows, a working directory, and an
  optional `process` declaration. A CLI agent profile is that shape and nothing more, so the host
  can host one without an agent concept.
- Pull-based liveness — a runtime receives a `PaneRuntimeHostPort` whose only question is which of
  its panes is current in the active workspace world. Everything else it answers itself, so the
  host keeps no per-kind registry.
- Contributed projection — a runtime's status reaches probes through
  `StatusProjectionContributions`, so disabling it withdraws its keys instead of leaving host-owned
  defaults behind.
- Symmetric absence — with no runtime registered for a kind, creation returns null and every
  affordance for it degrades to inert: no crash, no silent half-open pane.
- Released panes — a runtime being withdrawn releases every pane it built through
  `PaneRuntimeHostPort.releasePane`, so uninstall leaves no live pane rendering or holding the
  panel's keyboard focus. An orphaned pane is not merely untidy: it keeps consuming keystrokes on
  behalf of a runtime that no longer exists.

**Mechanism:** A runtime registers during `activateApplication`; the registration disposer is the
plugin's, so uninstall withdraws the kind, its keybinding layer, and its status contribution
together. `Bootstrap.createRuntimePane` allocates the instance identity, asks the registry to build,
registers the result in the `PanelHost`, and subscribes to the pane's `onSystemNote` stream without
reading it. `handlePanelContentRemoved` routes removal back through `PaneRuntimes.paneRemoved` so
the owner releases the session.

**Generates:** a host with no pane-runtime imports; a declared task and an interactive shell served
by one seam; an uninstallable process owner; a new runtime kind that needs no host edit.

**Rejected alternatives:** Let the host construct the pane through the module's factory and hand it
settings — that is exactly the coupling this removes, and it forces the host to know every
runtime's configuration vocabulary.

**Evidence:** `src/modules/ui/PaneRuntime.interface.ts`; `src/modules/ui/PaneRuntimes.ts`;
`src/modules/ui/PaneRuntimes.test.ts`; `src/modules/terminal/TerminalPlugin.ts`;
`src/modules/terminal/TerminalPlugin.test.ts`; `src/modules/app/Bootstrap.ts`;
`scripts/harness/smoke-plugin-manifest-harness.ts` (Terminal runtime disable leaves the host live);
`scripts/harness/smoke-tasks-dashboard-harness.ts` (tmux attach through the terminal runtime).

**Impossible if true:** a host file importing a pane runtime's module; a pane kind built by two
different routes; a disabled runtime still projecting status; a disabled runtime's pane still
occupying the panel; a panel affordance for an uninstalled kind crashing or half-opening a pane.

**Verification:** `bun test src/modules/ui/PaneRuntimes.test.ts
src/modules/terminal/TerminalPlugin.test.ts && bun
scripts/harness/smoke-plugin-manifest-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-28

### A focused pane consumes only its own scoped bindings

**Invariant:** If a focused pane declares a keybinding context, then the host dispatches a resolved
action from that branch ONLY when the matched binding declared that same context. A binding that
matched because it is global falls through to the pane as raw input, so a pane that owns a real
surface never swallows a chord the rest of the application owns.

**Scope:** `KeybindingRegistry.resolve`'s reported `Resolution.context`, and the panel pane-context
branch in `Bootstrap.keyTick`. Reserved global chords are resolved earlier and are outside this
rule; the primary-dock branch is deliberately unchanged, because a dock pane has no raw-byte sink
to pass a keystroke to.

**Mechanism:** `inContext` lets a binding whose context is `global` match inside every context —
that is what makes one canonical layer serve every surface. The consequence is that an action alone
cannot say whether a binding is the pane's or everyone's, so `resolve` reports the matched
binding's declared context (`'global'` for one that applies everywhere, the context name for a
scoped one, null for no match). The pane branch requires
`resolution.context === pane.keybindingContext` before dispatching, then asks the pane whether it
claims the action at all.

**Generates:** Ctrl+P, Ctrl+F, Ctrl+S, Ctrl+R, Ctrl+U, Ctrl+W and Ctrl+, reaching a focused
terminal's child as the exact bytes a real terminal sends; a task pane keeping surface-scoped
Ctrl+, while reserved Ctrl+Alt+B still reaches the host; a new pane kind that can declare a context
without silently capturing the global chord set.

**Rejected alternatives:** Prefix-match the resolved action against the context name
(`terminal.*`) — that was the pre-extraction shape. It couples the host to each pane's action
vocabulary and breaks the moment a scoped binding is named for what it does rather than where it
lives.

**Evidence:** `src/modules/keybindings/KeybindingRegistry.ts`;
`src/modules/keybindings/KeybindingRegistry.test.ts` `a resolution reports whether its binding was
scoped or global`; `src/modules/terminal/TerminalPlugin.test.ts`;
`scripts/harness/smoke-reserved-chord-harness.ts` `focused task content keeps surface-scoped Ctrl+,
while reserved Ctrl+Alt+B reaches the host`; `scripts/smoke-keyboard-invariant.sh` section D
(sent-vs-received byte table).

**Impossible if true:** a focused pane swallowing a global chord that the pass-through table
requires the child to receive; a host branch prefix-matching an action name to decide ownership; a
pane's scoped binding failing to fire because it was mistaken for a global one.

**Verification:** `bun test src/modules/keybindings/KeybindingRegistry.test.ts
src/modules/terminal/TerminalPlugin.test.ts && bun
scripts/harness/smoke-reserved-chord-harness.ts && bash scripts/smoke-keyboard-invariant.sh`

**Status:** provisional

**Last refined:** 2026-07-28

### A pane content projects through exactly one surface

**Invariant:** If a content occupies a pane slot, then it projects through EXACTLY ONE surface:
either it returns a `StyledText` from `render` and the host paints that into a host-owned body, or
it declares the `native-surface` capability and paints the OpenTUI renderables it owns itself.
Never both, and never neither.

**Scope:** `PaneContent.render`, `PaneNativeSurfacePort`, `PaneProjection` (the one resolver every
host paint site calls), and the four paint sites that use it — the primary dock body, the right
dock body, each visible bottom-panel cell body, and the editor column.

**Components:**
- One resolver — every host paint site calls `PaneProjection.paint(content, region)`. It asks for
  the native capability FIRST; a content that has it paints itself and the resolver returns null,
  so the host assigns nothing. Otherwise it calls `render` and hands the cells back.
- Neither is a defect, not a default — a content with no `render` and no native capability makes
  `PaneProjection.paint` throw and names the content. A silent blank pane would otherwise read as
  an empty document.
- Paint then selection, one pass — a native surface applies its native selection and reports its
  caret anchor inside the same `paint` call that set the content, so a selection can never map
  onto the buffer of the previous frame.
- The host owns the slot, the content owns its surfaces — a native content receives the slot box
  and mounts its own renderables into it, and it reports the painted region back so host-owned
  overlays (a scrollbar track, an out-of-band image placement) anchor to what was actually drawn.
- Pointer events follow ownership — a native content's renderables carry their own OpenTUI mouse
  handlers, so the optional host-forwarding hooks (`onPointerDown`, `onWheel`) stay absent for it
  instead of being routed twice.

**Mechanism:** `render` is optional on `PaneContent` and `capability('native-surface')` returns a
`PaneNativeSurfacePort` with `paint`, `caretAnchor`, and `surfaceRegion`. The host asks the
resolver, never the content's class. `SourceTextPaneContent` is the one native citizen today;
`TerminalPaneContent`, `AgentPaneContent`, and `FileTreePaneContent` are cells citizens and did not
change.

**Generates:** an editor painted through the same seam as a terminal; a host with no source-text
render call; a second native pane (a canvas, a raster viewer) that costs one capability and no host
branch.

**Rejected alternatives:** Keep `render` required and have a native content return an empty
`StyledText` — that is a content suppressing the seam's core to use it, which is the tell that the
boundary is drawn in the wrong place. Add a `kind: 'native' | 'cells'` discriminant on the content
— the host would then switch on the content's own answer instead of resolving a capability, and
every later surface kind would be another host branch.

**Evidence:** `src/modules/ui/PaneContent.interface.ts`; `src/modules/ui/PaneProjection.ts`;
`src/modules/ui/PaneProjection.test.ts`; `src/modules/editor/SourceTextPaneContent.ts`;
`src/modules/editor/SourceTextPaneContent.test.ts`; `src/modules/ui/RootView.ts`.

**Impossible if true:** a host paint site reading `content.render` directly; a content that paints
nothing rendering as an empty pane without an error; a native surface whose selection is applied
before its content is set.

**Verification:** `bun test src/modules/ui/PaneProjection.test.ts
src/modules/editor/SourceTextPaneContent.test.ts && bash scripts/conventions-gate.sh`

**Status:** provisional

**Last refined:** 2026-07-29

### The source text editor is a pane content citizen

**Invariant:** If the editor column shows source text, then it is projected by
`SourceTextPaneContent` through the `PaneContent` seam: the host mounts the slot box, calls the
seam, and holds no source-text render, selection, caret, or hit-test call of its own.

**Scope:** `SourceTextPaneContent`, the `EditorPane` controller it owns, the editor column mount in
`RootView`, and the caret ladder in `RootView.update`. Registration through a manifest, and routing
the editor's keystrokes through `handleKey`, are the next step and are outside this rule.

**Components:**
- One render call — the gutter and code renderables belong to the content, which builds them,
  mounts them into the host's slot box, and paints them in `paint`. `RootView` never calls
  `EditorPane` or `EditorPaneRenderer`.
- Where versus whether — the content answers WHERE its caret is (`caretAnchor`, in screen cells,
  because it owns the renderable the caret sits in). The host answers WHETHER this pane owns the
  keyboard, in the same ladder that already ranks a modal overlay over the right dock over the
  bottom panel over the editor.
- One copy surface — the content publishes `text-selection`, the same capability a terminal
  publishes, so the clipboard path resolves an identifier and not a class.
- A raster document is a projection, not a branch — when the active document is an image, the
  content asks its injected raster projection what the code cells must show and paints that. The
  half-block floor and the out-of-band pixel tiers are unchanged and stay with the image module.
- Release is expressible — the content's `dispose` releases the views its provider created, through
  `Workspace.releaseSourceTextViews`, so withdrawing the source-text pane leaves no live view. This
  is what `PaneRuntimeHostPort.releasePane` is for a runtime.

**Mechanism:** `RootView` builds the bordered editor area, hands it to `SourceTextPaneContent`, and
calls `PaneProjection.paint` for it exactly as it does for the docks and the panel. The content
constructs the gutter and code renderables, owns the `EditorPane` controller (wrap window,
coordinate mapping, native selection sync, drag, go-to-definition, wheel), and reports its painted
region so the editor scrollbars and the image placement anchor to it.

**Generates:** an editor whose frame cost is unchanged — `documentLineReads`,
`foldProjectionLookups`, `wrapProjectionLookups`, and `layoutComputations` identical at 10, 100,000
and 500,000 lines; native mouse selection, copy, and the native terminal caret unchanged; a host
that names no editor class.

**Rejected alternatives:** Rewrite the editor's native render into a `StyledText` that the host
paints — it discards `SelectableText`'s native selection and the layout-anchored caret on the
hottest surface of the product, to make one seam look uniform.

**Evidence:** `src/modules/editor/SourceTextPaneContent.ts`;
`src/modules/editor/SourceTextPaneContent.test.ts`; `src/modules/ui/RootView.ts`;
`scripts/conventions-gate.sh` rule 1.54; `scripts/harness/smoke-editor-harness.ts`;
`scripts/harness/smoke-selection-harness.ts`.

**Impossible if true:** `RootView` importing `EditorPane`; the editor's selection or caret being
computed by the host; a source-text view surviving the disposal of the pane that showed it.

**Verification:** `bun test src/modules/editor/SourceTextPaneContent.test.ts && bash
scripts/conventions-gate.sh && bun scripts/harness/smoke-editor-harness.ts && bun
scripts/harness/smoke-selection-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-29

### The editor column's default occupant is a contribution

**Invariant:** If the editor column shows anything, then a registered contribution put it there. The
host owns the SLOT — the bordered box, its background, its border, its extents — and knows the
occupant only as a `PaneContent` obtained from `EditorColumnDefault`. With no contribution
registered the column is EMPTY and says so.

**Scope:** `EditorColumnDefault`, `ApplicationContributionContext.registerEditorColumnDefault`,
`EditorPlugin`, and the editor-column sites in `RootView` (title, paint, caret, tick, viewport
width, scrollbar anchor, dispose). The CLAIMANTS of the column — a source-control comparison, a
Markdown split — are governed separately by `EditorSurfaceContents`; this rule is about the default
underneath them. Keyboard routing for source text is not here: the pane still declares no keybinding
context.

**Components:**
- One default, registered — `register` accepts one provider and refuses a second by name. Two
  contents painting one slot is a defect, not a precedence question.
- Built late, from a host-supplied context — providers register during plugin activation, which runs
  before the view exists, so the content is created lazily on the first read after the view attaches
  the slot. That is the order `EditorSurfaceContents` already uses.
- Host services are named ports, not typed fields — the LSP hover card, the raster projection, and
  the frame-attribution counter reach the content through `hostCapability(identifier)`, so the mount
  context names no editor type and a host offering none of them still yields a working column.
- Uninstall releases what it built — the contribution's `disposeApplication` calls `releaseContent`
  BEFORE withdrawing its provider. Withdrawal releases nothing on its own, the same split
  `PaneRuntimeHostPort` draws between `releasePane` and `dispose`, so a contribution that forgets
  the release leaves a visible leak rather than a silently-cleaned one.
- An empty column states its affordance — the host paints an empty-slot notice naming Extensions
  while nothing occupies the column. A blank pane reads as an empty document, which is the blank lie
  the notice exists to prevent, and the application stays live around it.

**Mechanism:** `Bootstrap` builds `EditorColumnDefault` before plugin activation and passes it to
both `ApplicationContributions` and `RootView`. `EditorPlugin.activateApplication` registers itself
as the provider; `RootView.attachHost` supplies the slot, the extents, and the named ports;
`RootView.update` reads `content`, `nativeSurface`, and `providerIdentifier` each frame and paints
the notice when they are null.

**Generates:** an editor that can be uninstalled and reinstalled from Extensions like any other
contribution, with `editorColumnContent` and `sourceTextViewsForOpenBuffers` published as the
observable proof; a host that constructs no editor and imports no source-text view.

**Rejected alternatives:** Make the source-text content a claimant in `EditorSurfaceContents` — a
claimant answers "do I take the column over right now"; the default answers "what is the column".
Forcing one registry to carry both would make the editor implement ten members it has no meaning
for, which is the tell that a boundary is in the wrong place.

**Evidence:** `src/modules/ui/EditorColumnDefault.ts`; `src/modules/ui/EditorColumnDefault.test.ts`;
`src/modules/editor/EditorPlugin.ts`; `src/modules/editor/EditorPlugin.test.ts`;
`src/modules/ui/RootView.ts`; `scripts/harness/smoke-plugin-manifest-harness.ts`.

**Impossible if true:** `RootView` constructing `SourceTextPaneContent`; a second default provider
occupying the column; an uninstalled editor still painting; a blank editor column with no stated
reason.

**Verification:** `bun test src/modules/ui/EditorColumnDefault.test.ts
src/modules/editor/EditorPlugin.test.ts && bash scripts/conventions-gate.sh && bun
scripts/harness/smoke-plugin-manifest-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-29
