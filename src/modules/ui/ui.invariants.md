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

**Mechanism:** the render window is a function of container height (`renderGitPanel` derives `bodyH`
from `sidebar.height`; the editor from `editorArea.height`). A flex chain whose parent sizes to
content closes the loop. Pinning the height (sidebar `width`+`height:'100%'`, `editorArea`
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

### Bounded list popups share paint and hit geometry

**Invariant:** If a bounded list popup is drawn and accepts pointer input, then one
`BoundedListPopupGeometry` determines its box bounds, optional search row, visible list window,
scrollbar rectangle, and screen-row-to-item mapping for both painting and hit-testing.

**Scope:** `BoundedListPopup` and its buffer-count, Git-log branch-selector, and caret-completion
adapters.

**Mechanism:** `BoundedListPopup.layoutGeometry` produces the geometry stored for the current paint.
The list renderer slices from its `firstVisible` and `listRows`; the vertical-only
`ScrollableTextViewport` receives the same list rectangle; and pointer selection calls
`filterIndexAtRow` with that stored geometry. `nextEnabledFilteredIndex` wraps through the current
filtered matches and `revealSelectedIndex` moves that same window. The optional search row owns an
independent rest-muted and hover-lit palette state, while the modal popup remains the query-input
owner across list-row hover repaints. Consumer adapters provide item labels, selection, and actions
but never calculate popup rows or query focus. Completion hides the search row and backdrop, anchors
at the laid-out editor caret, and prefilters only when its typed prefix changes; each paint slices
cached matches to the geometry's visible window.

**Generates:** window-edge clamping and upward opening; a bounded visible window over arbitrarily
large lists; wheel momentum and a solid vertical thumb; pointer and keyboard selection that agree
with the row on screen.

**Evidence:** `src/modules/ui/BoundedListPopup.ts`; `src/modules/ui/CompletionPopup.ts`;
`src/modules/ui/BoundedListPopup.test.ts`; `scripts/harness/smoke-bounded-list-popup-harness.ts`.

**Impossible if true:** a painted row selecting a different item; a popup or scrollbar extending
through the terminal bottom edge; a consumer reimplementing placement, visible-window, row-hit, or
wrap math; list hover diverting typed query characters to the editor; a completion paint walking all
1,000+ source items.

**Verification:** `bun test src/modules/ui/BoundedListPopup.test.ts && bun
scripts/harness/smoke-bounded-list-popup-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

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
chokepoint used by Enter and pointer release; `drillable` gates Right; the optional
`navigateBackwardHandler` receives Left; and `replaceItems` atomically re-roots items, selection,
title, viewport, and query. `BreadcrumbPicker` only maps filesystem entries into those options and
opens a selected file.

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

**Last refined:** 2026-07-25

### Panel heading controls share paint and hit geometry

**Invariant:** If a bottom-panel heading paints Add, Expand/Restore, or Close controls, then one
`PanelHeadingProjection` determines both the displayed control segments and the screen columns that
activate their actions, while each segment carries its tooltip label and hover projection.

**Scope:** `PanelHeading`, the generic headed panel cells in `RootView`, and the `PanelAddPopup`
adapter. The contents-list row controls and status-bar buttons are outside this heading rule.

**Mechanism:** `PanelHeading.project` clips the title around three right-aligned control segments and
returns their exact half-open column ranges, semantic glyph slots, tooltip labels, and `StyledText`;
`controlSegmentAtColumn` resolves pointer input and hover only from those ranges. RootView retains that
projection for each painted cell and points the shared `Tooltip` at the segment. Hover uses
`palette.cursorLine`, the same background affordance as breadcrumb segments; Close uses `palette.fg`,
not `palette.error`. Add opens the shared `BoundedListPopup` with Terminal and Agent items, Expand
toggles the host layout override, and Close removes that cell's owned content.

**Generates:** Right-edge controls that survive cell resizing; identical paint and pointer
boundaries; tooltips and hover highlights for every control; one shared dropdown implementation; a
non-destructive-looking close action attached to each visible region.

**Evidence:** `src/modules/ui/PanelHeading.ts`; `src/modules/ui/PanelAddPopup.ts`;
`src/modules/ui/RootView.ts`; `src/modules/ui/PanelHeading.test.ts`;
`src/modules/ui/PanelAddPopup.test.ts`; `scripts/harness/smoke-panel-chrome-harness.ts`.

**Impossible if true:** A painted control column invoking a neighboring action; a narrow heading
leaving an invisible clickable control; Add reimplementing popup placement or row-hit math; Close
targeting whichever content happens to be active instead of the headed region; a hovered control
changing an un-hovered sibling; Close painting in the theme error color.

**Verification:** `bun test src/modules/ui/PanelHeading.test.ts
src/modules/ui/PanelAddPopup.test.ts && bun scripts/harness/smoke-panel-chrome-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### Panel content order is one persisted sequence

**Invariant:** If open panel content is reordered, then `Settings.panelContentOrder`,
`PanelHost.order`, the docked contents rows, and the left-to-right split all expose that same
sequence immediately and after restart.

**Scope:** The bottom `PanelHost`, `Settings.panelContentOrder`, `PanelContentsList`, and the
terminal-agent split. Other `PanelHost` instances are outside this persisted bottom-panel order.

**Mechanism:** `Bootstrap` injects the `Settings.panelContentOrder` ref and `Settings.save` callback
into `PanelHost`. `PanelHost.moveOpenContentTo` mutates that ref once, rebuilds `layout` from it, and
persists; `PanelContentsList.rows` and `PanelHost.split` read the same order.

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
Panel-context keybindings delegate to the same host methods.

**Generates:** VS Code-style docked session rows; visible and hidden instances in one list; per-row
close affordances; mouse and keyboard parity without a second content registry.

**Rejected alternatives:** Use `BoundedListPopup` — a modal popup does not remain docked beside panel
content and cannot continuously mirror the open split.

**Evidence:** `src/modules/ui/PanelContentsList.ts`; `src/modules/ui/RootView.ts`;
`src/modules/keybindings/KeybindingDefaults.ts`; `src/modules/ui/PanelContentsList.test.ts`.

**Impossible if true:** The list showing with one registered session; two registered sessions
producing one or three rows; hiding an instance removing its row; a close row retaining its backend;
a drag updating only presentation.

**Verification:** `bun test src/modules/ui/PanelContentsList.test.ts && bun
scripts/harness/smoke-panel-split-harness.ts && bun
scripts/harness/smoke-panel-chrome-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### Completion reuses bounded popup geometry

**Invariant:** If completion is visible, then its placement, flip, visible window, scrollbar, pointer
hit mapping, and wrapped keyboard selection come from `BoundedListPopup`; completion supplies only a
caret anchor, prefix-filtered items, and acceptance behavior.

**Scope:** `CompletionPopup`, its `RootView` caret anchor, and completion input routing in Bootstrap.

**Mechanism:** The adapter owns a separately identified `BoundedListPopup`, opens it without the
modal backdrop or search row, and updates its cached items after one cheap prefix pass. The editor
keeps keyboard focus; completion consumes only Up, Down, Enter, Tab, and Escape.
`BoundedListPopup.close` advances the same `paintRevision` Ref that open and selection changes use,
and `Bootstrap` requests a next-turn render when dismissal races the still-queued opening frame, so
the closed state reaches both the terminal and `status.completionOpen`.

**Generates:** Caret-relative downward placement with upward flipping, O(viewport) paint, wrapped
selection with reveal, continuous editor typing, and exact text-edit acceptance.

**Evidence:** `src/modules/ui/CompletionPopup.ts`; `src/modules/ui/BoundedListPopup.ts`;
`src/modules/ui/RootView.ts`; `src/modules/app/Bootstrap.ts`.

**Impossible if true:** A second completion-specific popup geometry implementation; a completion
search row; an invisible modal backdrop that steals editor input; full-list work during repaint;
Escape closing the model while `status.completionOpen` remains true.

**Verification:** `bun test src/modules/ui/CompletionPopup.test.ts
src/modules/ui/BoundedListPopup.test.ts` and `bun scripts/harness/smoke-completion-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-25

### Splitter paint and hit testing share one geometry

**Invariant:** If a pane boundary is resizable, then one `SplitterElement` owns its one-cell
cross-axis geometry, pointer hit target, hover state, drag capture, and palette state; the cell that
paints is the cell that receives the pointer.

**Scope:** Every pane splitter in `RootView`, `DiffView`, and `MarkdownSplitView`, including the
sidebar, bottom panel, git regions, split panel cells, diff panes, markdown preview, and right dock.

**Mechanism:** `SplitterElement` owns one `BoxRenderable` and one `SplitterModel`. Its geometry setter
writes the renderable rectangle that OpenTUI both paints and stamps into the hit grid; its shared
pointer lifecycle captures that same renderable, tracks hover plus drag, and resolves appearance
through `palette.border` at rest and `palette.accent` while hovered or dragged.

**Generates:** One-cell splitter hit zones; rest-muted, hover-lit, drag-lit behavior; one future
splitter wire-up instead of another geometry and pointer implementation.

**Evidence:** `src/modules/ui/SplitterElement.ts`; `src/modules/ui/SplitterElement.test.ts`;
splitter consumers construct `SplitterElement` rather than binding pointer handlers themselves.

**Impossible if true:** A painted divider whose pointer target occupies different cells; a pane
splitter with a private hover or drag state machine; a divider that stays accent-colored at rest or
loses its highlight while a captured drag continues.

**Verification:** `bun test src/modules/ui/SplitterElement.test.ts` plus the splitter-state
FrameProbe assertions registered in `scripts/merge-gate.sh`.

**Status:** provisional

**Last refined:** 2026-07-24

### Visible panel contents own separate headed regions

**Invariant:** If terminal and agent content are both visible in `PanelHost`, then each content owns a
separate side-by-side region with its own heading and body, and adding or removing one content never
relabels the other content as a tab under a shared heading.

**Scope:** `PanelHost.toggleContent`, panel cells in `RootView`, the terminal and agent status
controls, the F9 split action, and the matching command-palette actions.

**Components:**
- *Pane presence* — each status control toggles only its matching content.
- *Per-cell heading* — each visible cell projects its own `PaneContent.icon` and `PaneContent.title`.
- *Shared split* — `PanelHost.cellSpans` and `SplitterElement` place and resize visible cells.

**Mechanism:** `PanelHost.toggleContent` adds the second registered content to the shared cell layout
or removes only the selected content. RootView mounts one heading-and-body container per resolved
cell, while status clicks, keybindings, and palette commands call the same Bootstrap toggles.

**Generates:** A terminal region and an agent region that can coexist; one-click pane presence
controls; F9 split acceleration; identical mouse, keyboard, and palette results.

**Evidence:** `src/modules/ui/PanelHost.ts`; `src/modules/ui/RootView.ts`;
`src/modules/app/Bootstrap.ts`; `src/modules/commands/CommandDefaults.ts`;
`src/modules/ui/PanelHost.test.ts`; `scripts/harness/smoke-panel-split-harness.ts`.

**Impossible if true:** The agent body appearing under a terminal heading; clicking Agent replacing
the terminal body; closing Agent also closing Terminal; mouse and F9 producing different split
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

**Mechanism:** `TabBarRenderer.appendHorizontalGap` emits one repeated-space chunk, then
`renderWorkspaceTabBar` and `renderBufferTabBar` advance their existing column cursors by the same
gap width before painting and recording right controls.

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

### The active activity item determines the sidebar content

**Invariant:** If the activity bar shows an item as ACTIVE (its left accent bar `▎` is drawn), then
the sidebar renders exactly that item's view, and switching the active item — by clicking its button
OR pressing its shortcut (Ctrl+Shift+E Explorer / Ctrl+Shift+G Source Control / Ctrl+Shift+X
Extensions) — switches the sidebar content to the same view, per workspace. Exactly one item is
active at a time.

**Scope:** `ActivityBar` (the far-left view-switcher pane), `Workspace.sidebarView` +
`Workspace.showSidebarView` (the per-workspace active view and its single writer), and the sidebar
content branch in `RootView.update` (`renderTree` / `renderGitPanel` / the extensions placeholder).

**Mechanism:** the active view is a SINGLE ref, `Workspace.sidebarView` — one ref holds one value, so
"exactly one active" is true by representation, not by bookkeeping. Both input paths (the bar's
`onMouseDown` and the `view.show*` keybinding/palette actions) funnel through the one writer
`Workspace.showSidebarView(view)`; nothing else sets the accent independently. `RootView.update`
reads that same ref to pick BOTH the sidebar title/content AND (via `ActivityBar.update`) which item
draws the accent, so the highlight and the rendered pane are derived from one value in one frame and
cannot diverge. The activity bar owns no active-view state of its own.

**Generates:** a clickable, self-explaining view switcher (button + name/shortcut tooltip + palette
entry) that satisfies the product north star's visible-affordance rule; per-workspace view memory;
keyboard parity that can never disagree with what the bar shows.

**Evidence:** `src/modules/ui/ActivityBar.ts` (projects `sidebarView`, routes clicks through
`showSidebarView`); `src/modules/workspace/Workspace.ts` (`sidebarView` single ref +
`showSidebarView` single writer); `src/modules/ui/RootView.ts` (title/content + `activityBar.update`
from the one ref); `src/modules/keybindings/keybindings.defaults.ts` + `src/modules/app/Bootstrap.ts`
(`view.show*` actions call the same writer); `scripts/smoke-activitybar.sh`.

**Impossible if true:** the bar highlighting one view while the sidebar shows another; two items
active at once; a click or chord that moves the accent without switching the rendered sidebar content
(or the reverse); an activity view reachable only by keyboard with no clickable button.

**Verification:** `bash scripts/smoke-activitybar.sh` — click each button and assert the sidebar
content switches (rendered cells) AND the accent moves to the clicked item; press each chord and
assert the same switch; confirm a glyph renders in the default (no-Nerd-Font) fallback tier.

**Status:** provisional

**Last refined:** 2026-07-23

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

**Evidence:** `src/modules/ui/EditorPaneRenderer.ts` (leading-space guide scan plus in-place glyph in
the code-body loop); `src/modules/ui/EditorPane.ts` (`showIndentGuides` + `indentGuideGlyph` passed to
the render context); `src/modules/settings/Settings.ts` + `src/modules/settings/SettingsPanel.ts` (the
setting and its boolean panel row); `scripts/smoke-indent-guides.sh`.

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
src/modules/keybindings/__tests__/registry.test.ts && bash scripts/smoke-mode-coherence.sh`

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
a live resize.

**Scope:** The command palette, Find and Replace, Quick Open, destructive confirmation, Settings,
Keyboard Shortcuts, and context menu dialogs in `OverlayLayer`. `BoundedListPopup` has its own
stricter anchored geometry record; completion is non-modal.

**Mechanism:** `OverlayDialogGeometry.layout` clamps one numeric rectangle to the live
`renderer.width` and `renderer.height`. `OverlayLayer.updateOverlayDialog` applies that rectangle to
the box and its top-edge close control every frame. Content that exceeds the rectangle is windowed
through `ScrollableTextViewport`, which derives its `SolidThumbScrollBar` from the same interior
rectangle.

**Generates:** Resize-safe dialogs; bounded paint; shared wheel momentum, keyboard reveal, and thumb
drag; a close target that never leaves the canvas.

**Evidence:** `src/modules/ui/OverlayDialogGeometry.ts`;
`src/modules/ui/OverlayDialogGeometry.test.ts`; `src/modules/ui/OverlayLayer.ts`;
`scripts/harness/smoke-overlay-dialog-harness.ts`.

**Impossible if true:** Resizing while Settings or Keyboard Shortcuts is open leaves any dialog edge,
scrollbar, or close control outside the terminal; overflowing rows paint through the bottom instead of
scrolling.

**Verification:** `bun test src/modules/ui/OverlayDialogGeometry.test.ts
src/modules/ui/ScrollableTextViewport.test.ts && bun
scripts/harness/smoke-overlay-dialog-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

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
the Shift+F1 chord, opens the sheet through
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

**Mechanism:** wheel routes through `Workspace.scrollGitLog` / `viewport.scrollBy`; keyboard through
`moveLog` / tree `moveSelection`; each input event is the sole writer for that event. When the
pending scroll animation lands, it must adopt-and-stop on any programmatic jump (see the paused-clock
contract). Cross-substrate transfer from `VirtualScroller` ("One Writer Per Regime").

**Generates:** deterministic scrolling; no lost wheel/keys.

**Evidence:** `Momentum.addImpulse` deterministically restarts a contrary-direction gesture and
programmatic jumps halt momentum; `scripts/harness/smoke-terminal-harness.ts` observes a contrary
terminal notch reverse direction across synchronized frames.

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
horizontal-modifier test locally. One expression feeds both the wrap-mode direct step and the
non-wrap momentum impulse. Pairs with *One writer per scroll regime per frame* (that governs who
WRITES the offset; this governs how the gesture is MEASURED before the write).

**Generates:** uniform, configurable scroll feel across every pane from one settings source.

**Evidence:** `ScrollGesture` is the single module; the sidebar, editor, shared text viewport, and
panel cell route all call it before a content receives its signed row impulse.

**Impossible if true:** two panes scrolling at different speeds for the same `linesPerNotch`; a wheel
handler that ignores a settings change; a hardcoded notch count anywhere.

**Verification:** review + `bun scripts/harness/smoke-scrollbars-harness.ts` and `bun
scripts/harness/smoke-terminal-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-25

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
branch. `ContextMenu.runAt` closes first, then invokes the opener-supplied handler.

**Generates:** reusable menus that are safe over any pane; collective git actions without
misclick hazards; keyboard parity for every menu.

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

**Scope:** `Tooltip` (the dwell state machine) and the tooltip overlay in `RootView`
(`HitTransparentText`).

**Mechanism:** the tooltip renderable overrides `render()` to mask OpenTUI's hit-grid stamp for
itself (`HitTransparentText`), so the pointer can NEVER resolve to the tooltip — a click at its
cells hits whatever is beneath, exactly as if the tooltip did not exist. The model only ever
writes its own display refs (`visible/text/anchor`); the dwell advances on the frame tick
(`tick(dtSeconds)` — the momentum/auto-scroll contract) and `Bootstrap` clears on every keypress
and every mouse-down.

**Generates:** hover affordance labels (git action buttons now; scrollbars/tree/diagnostics
later) with zero input risk.

**Evidence:** unit tests (`Tooltip.test.ts` dwell machine: no show before the dwell, cumulative
dwell, jitter keeps the timer, clear disarms) + live tmux: tooltip visible in the pane capture
after a dwell; a click at the same cells acted on the row beneath.

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

**Scope:** `RootView` and every OpenTUI renderable it builds.

**Mechanism:** `update()` reads workspace/editor/theme/commands state and writes renderable
content; renderables store no cursor/buffer/selection truth. Realizes *ivue owns state, OpenTUI
owns projection*.

**Generates:** the stateless view; the ability to rebuild the frame purely from model state.

**Evidence:** `RootView.ts:211-249` — renderables hold no model fields; pulls each update. Upheld.

**Impossible if true:** a renderable that is the source of scroll/selection/cursor truth; a
render pass that writes model state.

**Verification:** review/grep — renderables hold no model fields; `update()` performs no model
mutation.

**Status:** provisional

**Last refined:** 2026-07-21

### Only the visible window is rendered

**Invariant:** If the document, tree, or list is larger than the viewport, then only the visible
window is materialized into renderables each frame — render cost is O(viewport), not O(content).

**Scope:** editor body, file tree, palette list rendering in `RootView`.

**Mechanism:** `renderEditorStyled` slices `document.slice(top, height)` and tokenizes only those
lines; `renderTree` slices the visible tree window; the palette caps at 12. Realizes *Cost tracks
the actively observed set*.

**Generates:** viewport-bounded tokenization; windowed tree/list rendering; flat render cost as
files/repos grow.

**Evidence:** editor body, tree, and palette list all slice to the visible window; since 2026-07-21
the editor ALSO virtualizes COLUMNS — each visible line is sliced to the visible display-column
window (grapheme-safe, memoized boundaries) BEFORE tokenizing, so a 50k-char line drags/renders at
normal speed (verified: 3 drag-selects ≈ 0.1s processing; open+settle 538ms). Trade-off recorded:
tokens start at the slice, so left-context-sensitive highlighting can differ at the window edge.

**Impossible if true:** a frame that tokenizes or builds renderables for every line of a large
file, or every row of a large tree; a frame whose cost depends on total LINE LENGTH rather than
visible columns (the horizontal twin).

**Verification:** a test opening a 100k-line document asserting tokenization count per frame is
bounded by viewport height.

**Status:** provisional

**Last refined:** 2026-07-21

### One file line is one visual row when word wrap is off

**Invariant:** If word wrap is OFF (the default), then one file line renders as exactly one visual
row — long lines clip at the right edge and horizontal scroll covers the rest — so the gutter
(which numbers file lines), the caret Y, selection rows, and click hit-testing all share the same
trivial row mapping. When word wrap is ON, this record does not apply: the row mapping is the
editor's pure logical↔visual layer instead (*Word wrap is a pure view mapping*,
src/modules/editor/editor.invariants.md), and the gutter numbers only a line's FIRST visual row
(continuation rows blank).

**Scope:** the editor gutter + code renderables in `RootView`, wrap-OFF mode only. (Historically
this was recorded as unconditional — "an editor pane NEVER soft-wraps"; word wrap becoming a MODE
on 2026-07-21 scoped it honestly.)

**Mechanism:** the code renderable is `wrapMode: 'none'` in BOTH modes — the renderable itself
never wraps; wrap-ON feeds pre-wrapped SEGMENT rows from the mapping layer, so row identity is
always decided ABOVE the renderable, never by widget wrapping heuristics.

**Generates:** the consecutive-gutter smoke check (wrap-off); the trivial `docLine − scrollTop`
row math every wrap-off consumer uses; the guarantee that toggling wrap OFF restores today's
pixel-identical behavior.

**Evidence:** human-QA regression (a wrapped tail once desynced every gutter number below it);
`smoke-editor.sh` "no soft-wrap" check — consecutive rows carry consecutive gutter numbers;
`RootView` codeBody options keep `wrapMode: 'none'`.

**Impossible if true:** with wrap off, a file line occupying two visual rows, or a gutter number
that disagrees with the file line beside it; in either mode, the OpenTUI renderable (rather than
the row source) deciding where a line breaks.

**Verification:** `smoke-editor.sh` consecutive-gutter check (wrap-off); the wrap-mode inversion
lives with the wrap record (continuation rows have BLANK gutters).

**Status:** established

**Last refined:** 2026-07-21

### The caret renders at the cursor display column

**Invariant:** If the editor is focused, then a caret is drawn at the cursor's **display column**
on its line — not merely a marker in the gutter — accounting for tabs and wide glyphs.

**Scope:** the editor body caret in `RootView`.

**Mechanism:** the view anchors the caret to the code renderable's ACTUAL laid-out screen cell
(`codeBody.x/y` from yoga — never hand-derived layout constants) plus
`displayColumn(line, cursor.col)`, then adds **+1 on both axes** because the native terminal cursor
is 1-based (ANSI CUP; OpenTUI's own `renderCursor` does `screenX + visualCol + 1`). Stands on
*A cursor position resolves to three distinct coordinates* (editor).

In wrap MODE (word wrap, 2026-07-21) the caret cell comes from the SAME logical↔visual mapping the
render used (`wrapVisualPosition`): x = `codeBody.x` + the display column WITHIN the cursor's wrapped
segment (no scrollLeft term — horizontal scroll is inert), y = `codeBody.y` + the cursor's visual-row
index in the window. The 1-based ANSI +1 and the tmux `#{cursor_x},#{cursor_y}` oracle are unchanged —
the caret must agree with tmux's own cursor in EITHER mode.

**Generates:** a real caret; correct visual position on lines with tabs/wide chars; a caret that
stays correct when the layout changes (the anchor moves with the renderable).

**Evidence:** HUMAN-QA BUG FIXED (2026-07-21): the caret rendered one row HIGH — two stacked causes:
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

**Last refined:** 2026-07-21

### The selected range renders with a background

**Invariant:** If a non-empty selection exists, then exactly the selected range is drawn with a
selection background, aligned to the model's `selectionRange()`, on the cursor's content row(s).

**Scope:** the editor code renderable in `RootView` (`SelectableText` + `applySelection`).

**Mechanism:** the editor is split into a **gutter** renderable (line numbers + current-line marker)
and a **code** renderable (`SelectableText`, syntax only) so the code buffer holds no gutter —
OpenTUI's native selection then never shades a gutter on a multi-line span, and code-local selection
coords are pure display columns. `applySelection` maps the model `selectionRange()` into
viewport-local cells (`x = displayColumn`, `y = docLine − scrollTop`, clamped to the visible window)
and drives `SelectableText.setSelectionRange` → `TextBufferView.setLocalSelection`
(TextBufferRenderable syncs its view's viewport in `onResize`, so those coords resolve directly).
Stands on *A cursor position resolves to three distinct coordinates* (editor) and *Selection is an
anchor plus the cursor* (editor).
Mouse addendum (2026-07-21): the MODEL is the only selection writer. Mouse events on
the code renderable drive `cursor`+`anchor` (`documentPositionAtCell`: line = scrollTop + rowOffset,
column = `graphemeAtDisplayColumn` — the display→grapheme inverse, unit-tested for wide glyphs and
tabs); `applySelection()` then projects the model into the native highlight each paint. OpenTUI's
OWN mouse-drag selection is DISABLED (`selectable:false`) — it was a second writer the model never
saw, so the next paint wiped its highlight (the human-QA "selection appears then disappears" bug),
and Ctrl+C (which copies the model selection) copied nothing.

The MODEL is the only selection writer (mouse, 2026-07-21). Mouse events on the code renderable drive
`cursor`+`anchor` (`documentPositionAtCell`: line = scrollTop + rowOffset, column =
`graphemeAtDisplayColumn` — the display→grapheme inverse, unit-tested for wide glyphs and tabs);
`applySelection()` then projects the model into the native highlight each paint. OpenTUI's OWN
mouse-drag selection is DISABLED (`selectable:false`) — it was a second writer the model never saw,
so the next paint wiped its highlight (the human-QA "selection appears then disappears" bug), and
Ctrl+C (which copies the model selection) copied nothing.

**Generates:** a visible selection block that tracks the model; multi-line shading without touching
the gutter.

**Evidence:** VERIFIED by FrameProbe frame-diff (`TUI_FRAME_DUMP=1`). Selection on doc line 3, cols
[1,4) → exactly 3 contiguous bg-changed cells on buffer row **y=4** (line 3's content row), x=38..40
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

**Last refined:** 2026-07-21

### A scrollable text surface is drag-selectable with edge auto-scroll

**Invariant:** If a text surface renders more content than fits and exposes a scrollbar, then its text
is also selectable by pointer drag, and a drag whose pointer leaves the surface's edge auto-scrolls
the content in that direction while extending the selection. Reachability and selectability are the
same property: any row you can scroll to, you can select to. A surface that scrolls but cannot
drag-select (or selects only what is already on screen) violates this.

**Scope:** every scrollable text surface — the editor code body, the diff view, and the LSP hover
card. Not plain non-scrolling labels (status bar, tab titles), which have nothing to scroll to.

**Mechanism:** all three compose the SAME `SelectionDragBehavior` — the host supplies only
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
work; `HoverCard` now composes the identical behavior on BOTH axes (drag-select the card text, drag
past its bottom OR right edge auto-scrolls via `scrollRows`/`scrollColumns`, a wheel scrolls it, and
long content is reachable under a horizontal scrollbar rather than truncated; Ctrl+C copies via
`lastCopyChars`).

**Impossible if true:** a pane with a working scrollbar whose off-screen rows cannot be selected; a
drag that selects but never auto-scrolls at the edge; two scrollable panes with divergent drag rules.

**Verification:** review that each scrollable surface constructs `SelectionDragBehavior` (no bespoke
drag path) + `scripts/smoke-hover.sh` drives a drag across the card's scroll boundary and asserts the
copied text via `lastCopyChars`; `scripts/smoke-editor.sh` covers the editor (its "rightward
drag-select INCLUDES the char under the release cell" case asserts a 7-char word copies whole, not 6)
and `smoke-diff-overview` the diff.

**Status:** provisional

**Last refined:** 2026-07-23

### A scrollbar track is derived per frame from its region rect

**Invariant:** If a pane overflows on an axis, then that axis has a scrollbar whose track occupies
the trailing inner edge of the pane's CONTENT rect, derived each frame through the ONE geometry
source; every non-overflowing axis has no bar, and scrollbar visual thickness is axis-independent.

**Scope:** every scrollbar (editor vertical + horizontal, file tree vertical + horizontal, git
changes vertical + horizontal, git commit log vertical + horizontal, agent transcript, terminal
scrollback, and any future pane).

**Mechanism:** `ScrollbarGeometry.Class.scrollbarGeometry(orientation, region, scroll)` is the only
authority for placement, track length, min-thumb inflation, exact-extremes scale, and hidden-when-
fits. `ScrollbarSync.applyBarGeometry` applies the configured cross-axis cell count; every bar is a
`SolidThumbScrollBar` (both axes render plain at the settings thickness, keeping OpenTUI's native
drag geometry).

**Generates:** a bar on every overflowing axis; aligned tracks across split positions; reachable
clipped content; grabbable thumbs; no phantom bars; equal visual thickness across axes.

**Evidence:** `src/modules/ui/ScrollbarGeometry.test.ts` (17 region/property cases);
`scripts/harness/smoke-scrollbars-harness.ts` (narrow tree/changes/log overflow, raw SGR reveal,
fitting-pane absence, and the agent per-frame input/paint probe);
`scripts/harness/smoke-terminal-harness.ts` (long terminal scrollback and solid vertical thumb),
wired in `scripts/merge-gate.sh`.

**Impossible if true:** an overflowing tree, changes, or log row whose clipped tail cannot be
reached; a bar visible with nothing to scroll; a horizontal thumb that reads twice as thick as the
same configured vertical thumb; two bars deriving placement from different math.

**Verification:** `bun test src/modules/ui/ScrollbarGeometry.test.ts && bun
scripts/harness/smoke-scrollbars-harness.ts && bun scripts/harness/smoke-terminal-harness.ts`

**Status:** established

**Last refined:** 2026-07-25

### A scrollbar thumb is painted as background fill, never block glyphs

**Invariant:** Every scrollbar thumb (and track) renders as BACKGROUND colour on blank cells — no
cell of a scrollbar ever carries a block-element glyph (U+2580–U+259F) — the painted thumb rect is
the same rect the slider's mouse hit-test uses, and fixed viewport/content inputs produce a fixed
whole-cell thumb length at every scroll position.

**Scope:** every scrollbar in the app: the pane bars built by `ScrollbarSync`, the optional
`PaneContent` scroll bars (terminal scrollback), both `ScrollableTextViewport` bars (hover card,
agent transcript, markdown preview), and the two `DiffView` bars.

**Mechanism:** all scrollbar construction goes through ONE class, `SolidThumbScrollBar`
(`src/modules/ui/SolidThumbScrollBar.ts`), which repaints OpenTUI's slider cells with two `fillRect`
calls (track, then a normalized whole-cell thumb rect in the thumb colour). The normalized rect
reads OpenTUI's virtual half-cell size and start, rounds the position-independent size once, and
clamps the rounded start to the track with the shared two-cell minimum. It replaces the slider
instance's `getThumbRect`, so the same normalized rect also drives the native mouse hit-test.
Foreground block glyphs
(`█ ▀ ▄`) are rasterized with inter-line gaps by macOS Terminal.app — a glyph-built thumb shows dark
horizontal lines through it — while a background fill covers every pixel of the cell, so the artifact
is impossible by construction. The same seam re-asserts `slider.viewPortSize` after each scroll-state
write, healing OpenTUI's stale-max clamp (which otherwise pins the viewport at its 0.01 floor and
collapses every thumb to a half-cell).

**Generates:** thumbs that render solid in every terminal (no glyph-tiling artifacts); proportional
thumb length; drag positions that agree with the drawn thumb.

**Evidence:** driven frame assertions in `scripts/harness/smoke-scrollbars-harness.ts`: zero
block-element glyphs in the solid bars, contiguous multi-cell bg-fill thumb runs, and per-completed-
frame editor wrap-off, editor wrap-on, and diff probes that record constant viewport/total inputs,
moving scroll positions, and byte-identical thumb extents. Its agent probe additionally holds
`viewportRows=14` and `contentRows=181` while 20 changing positions all paint a 2-row thumb.
`scripts/harness/smoke-terminal-harness.ts` proves the same solid multi-cell thumb on real terminal
scrollback. `src/modules/ui/SolidThumbScrollBar.test.ts` exhausts half-cell start parity and the
two-cell minimum. Live drag was verified against the same rect.

**Impossible if true:** a thumb showing horizontal seams in Terminal.app; a scrollbar cell holding
`█`/`▀`/`▄`; a half-cell thumb on an overflowing pane; a drag grab-point disagreeing with the drawn
thumb.

**Verification:** `bun test src/modules/ui/SolidThumbScrollBar.test.ts && bun
scripts/harness/smoke-scrollbars-harness.ts && bun scripts/harness/smoke-terminal-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

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
`RootView.renderTree` and `RootView.renderGitPanel` always project selection, using
`palette.selection` while its region owns keyboard focus and `palette.cursorLine` otherwise;
`GitPanel.setChangesSelection`/`setLogSelection` leave scroll untouched while keyboard movement
minimally reveals through the pane's live viewport height.

**Generates:** click → set selection (+ open/focus-editor for a file); ↑/↓ while focused → move
selection + reveal; wheel/scrollbar → move viewport only; hover → transient highlight only; blur →
selection stays, highlight dims.

**Evidence:** `src/modules/ui/RootView.ts` (`renderTree`, `renderGitPanel`, sidebar click/hover/scroll
handlers); `src/modules/workspace/GitPanel.ts` selection setters and movers;
`src/modules/workspace/GitPanel.test.ts`; `scripts/smoke-selection.sh`, hard-wired in
`scripts/merge-gate.sh`, drives tree, changes, and commit-log click/hover/wheel/blur/refocus paths and
asserts full/dim backgrounds through FrameProbe.

**Impossible if true:** selection following the mouse hover or the scroll position; a clicked selection
vanishing on scroll or on losing focus; a list where click selects but the keyboard cannot move from
there; different list panes disagreeing on the selection model.

**Verification:** `bun test src/modules/workspace/GitPanel.test.ts src/modules/workspace/FileTree.scroll.test.ts && bash scripts/smoke-selection.sh`

**Status:** established

**Last refined:** 2026-07-22

### TS diagnostics render as a gutter mark and an underline

**Invariant:** If the language server reports a diagnostic for the active document, then every visible
line it covers shows (a) a severity-coloured gutter mark (the same `▎` shape as the git-change marks,
coloured error/warning/info) and (b) a severity-coloured underline over the diagnostic's column range;
the gutter diagnostic mark takes precedence over the git-change mark on that line.

**Scope:** the editor gutter + code rendering in `EditorPaneRenderer` (`pushGutterMarker` +
`pushCodeChunks`), fed by `Workspace.diagnosticsByLine` (projected from `LanguageClient.diagnosticSlice`).

**Mechanism:** `Workspace.diagnosticsByLine` is a `computed` that reads `diagnosticsRevision` and
projects each diagnostic to per-line `{startColumn, endColumn, severity}` marks (a multi-line
diagnostic yields one mark per line). `pushGutterMarker` paints the most-severe line's mark before the
git-change branch; `pushCodeChunks` adds the diagnostic ranges as segment boundaries and paints those
segments with `underline(fg(severityColor))`. The data is populated source-agnostically — a PUSH
server (typescript-language-server) via `publishDiagnostics`, and the PULL-model tsgo native-preview
default (which never publishes) via `textDocument/diagnostic`, both funnelled into one store (see
*Diagnostics reach the store by push or pull*, `src/modules/lsp/lsp.invariants.md`) — so the marks
appear under BOTH servers.

**Generates:** at-a-glance error/warning location in the gutter + inline, matching the git-change idiom.

**Evidence:** `scripts/smoke-diagnostics.sh` runs the SAME assertion against both real servers — tsgo
(pull) and typescript-language-server (push) — introducing a type error and asserting a red gutter
mark + red underline cells on the error line for each.

**Impossible if true:** a reported diagnostic with no gutter mark and no underline on its visible range.

**Verification:** `scripts/smoke-diagnostics.sh` (wired into merge-gate).

**Status:** provisional

**Last refined:** 2026-07-23

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

**Scope:** The empty-by-default right-dock slot, `view.toggleRightDock`, and the right-dock button in
`StatusBar`.

**Mechanism:** Bootstrap owns one `toggleRightDock` closure over the right dock's `PanelHost` and
injects it into both the command registry and `StatusBar`. The button calls that closure and paints
with the accent role while hovered or while the dock is visible.

**Generates:** A future `PaneContent` registration reveals the same host; clicking the status button
or invoking the command opens and closes the same resizable dock.

**Evidence:** `src/modules/app/Bootstrap.ts`; `src/modules/commands/CommandDefaults.ts`;
`src/modules/ui/StatusBar.ts`; `scripts/harness/smoke-layout-harness.ts`.

**Impossible if true:** the button and command disagreeing about whether the right dock is visible,
or a button that changes appearance without changing the hosted slot.

**Verification:** `bun scripts/harness/smoke-layout-harness.ts` drives both command and pointer
paths and asserts the shared visibility state plus emulator geometry.

**Status:** provisional

**Last refined:** 2026-07-24

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

**Mechanism:** `Bootstrap` constructs and registers `FileTreePaneContent`. `RootView` asks the host
for its active content and calls `PaneContent.render`, while `Sidebar` forwards file-view pointer and
wheel events through the optional pane methods. The adapter delegates rendering to
`TreePaneRenderer` and every mutation to the existing active workspace `FileTree` and `Workspace`
methods.

**Generates:** One file-tree pane adapter; the same expand, selection, open, navigation, badge,
momentum, and scrollbar behavior in left and right primary-dock positions; no file-tree renderer
call in `RootView`.

**Evidence:** `src/modules/ui/FileTreePaneContent.ts`;
`src/modules/ui/FileTreePaneContent.test.ts`; `src/modules/app/Bootstrap.ts`;
`scripts/harness/smoke-layout-harness.ts`.

**Impossible if true:** `RootView` calling `TreePaneRenderer` directly; moving the primary dock to
the right replacing or disabling the tree; a tree click bypassing the `PaneContent` adapter.

**Verification:** `bun test src/modules/ui/FileTreePaneContent.test.ts && bun
scripts/harness/smoke-layout-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25
