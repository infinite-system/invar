# Design System — Invariants

The shared interaction and appearance rules for every Invar interface.

## Reality-based invariants

## Chosen invariants

### Small icon buttons include their padding

**Invariant:** If a control contains one icon, then it includes exactly one padding cell on each side. Both padding cells belong to its hit target and hover tone.

**Scope:** Small icon buttons in editor, panel, dock, tab, list, and dialog chrome.

**Mechanism:** Each projection emits ` icon ` as one segment and publishes the same start and end columns for pointer hit testing.

**Generates:** Stable three-cell targets and a consistent hover shape.

**Evidence:** `src/modules/ui/PanelTabBar.ts`; `src/modules/ui/PanelContentsList.ts`; `src/modules/ui/RootView.ts`.

**Impossible if true:** An icon button whose padding cannot be clicked or whose hover tone covers only the glyph.

**Verification:** `bun scripts/harness/smoke-panel-chrome-harness.ts` and
`bun scripts/harness/smoke-panel-split-harness.ts`.

**Status:** established

**Last refined:** 2026-08-01

### Chrome edges keep one breathing cell

**Invariant:** If a small chrome control meets a border, scrollbar, or line start, then one surface-colored space separates the control ink from that edge without leaving the control's hit target.

**Scope:** Panel instance controls and file-tree header controls beside a visible scrollbar.

**Mechanism:** Each row projection reserves the edge cell before it places control ink and publishes the same control range for pointer input.

**Generates:** A panel toggle with a clickable right pad and a file-tree reveal button that shifts only while the scrollbar occupies its former right pad.

**Evidence:** `src/modules/ui/PanelTabBar.ts`; `src/modules/filetree/FileTreeHeaderRow.ts`; `src/modules/ui/SeparatorAppearance.ts`.

**Impossible if true:** Control ink touching a border or scrollbar; a visual pad that cannot receive the control's pointer action.

**Verification:** `bun scripts/harness/smoke-panel-chrome-harness.ts` and `bun scripts/harness/smoke-tree-scroll-harness.ts`.

**Status:** established

**Last refined:** 2026-08-01

### Explicit tree reveals center their target

**Invariant:** If the user reveals an open file in the tree, then its selected row lands at the vertical middle of the viewport when the tree ends allow it, with start and end clamping otherwise.

**Scope:** Automatic reveal-on-open and the file-tree reveal button. Ordinary keyboard selection movement stays minimally revealing.

**Mechanism:** Both explicit reveal paths call `FileTree.revealPath`, which expands ancestors, selects the target, and derives one centered, clamped scroll top from the live viewport height.

**Generates:** The same centered result for Quick Open, file activation, and the reveal button at small and large tree scale.

**Evidence:** `src/modules/filetree/FileTree.ts`; `src/modules/filetree/FileTreeWorkspace.ts`.

**Impossible if true:** An explicit reveal leaving its target at a viewport edge when middle space exists.

**Verification:** `bun test src/modules/filetree/FileTree.test.ts` and `bun scripts/harness/smoke-tree-scroll-harness.ts`.

**Status:** established

**Last refined:** 2026-08-01

### Navigation chrome precedes file tabs

**Invariant:** If the top editor chrome is visible, then its row order is workspace tabs, project search, breadcrumb and history, file tabs, then content.

**Scope:** The top workspace and editor chrome.

**Mechanism:** `RootView` mounts the rows in that order. `CommandBar` projects padded project search at the left and Layouts at the right. `TabBarRenderer` projects two padded history buttons before the active path and keeps the dim history cluster when no file is open.

**Generates:** Navigation controls grouped above tabs and file tabs adjacent to their content.

**Evidence:** `src/modules/ui/RootView.ts`; `src/modules/ui/CommandBar.ts`; `src/modules/ui/TabBarRenderer.ts`.

**Impossible if true:** Breadcrumbs below file tabs; history disappearing when the last file closes; project navigation centered in the row.

**Verification:** `bun test src/modules/ui/CommandBar.test.ts src/modules/ui/TabBarRenderer.test.ts` and `bun scripts/harness/smoke-navigation-history-harness.ts`.

**Status:** established

**Last refined:** 2026-08-01

### Chrome strips take the panel tone

**Invariant:** Workspace tabs, branch detail, project navigation, breadcrumbs, history, and file tabs sit on the panel tone. The editor canvas alone keeps the content tone, and the active file-tab chip borrows that tone to show which content it touches.

**Scope:** The horizontal top-chrome stack above the editor canvas. Workspace chips keep their own active and inactive tones, and hover or pressed chips keep their interaction tones.

**Mechanism:** RootView gives the application column one `palette.panel` chrome backdrop. Panels and unpainted top strips inherit it, while the editor canvas sets `palette.bg`. `TabBarRenderer` paints the active file-tab segment with that same content tone.

**Generates:** One dark signpost band across all five top rows, one light editor canvas, and one active file tab that joins visually to that canvas.

**Evidence:** `src/modules/ui/RootView.ts`; `src/modules/ui/TabBarRenderer.ts`; `scripts/harness/smoke-navigation-history-harness.ts`.

**Impossible if true:** An empty top-strip cell painted like editor content; a breadcrumb row with a different base tone; an inactive file tab borrowing the editor tone; the active file tab detached from the content below it.

**Verification:** `bun scripts/harness/smoke-navigation-history-harness.ts` and `bun scripts/harness/smoke-breadcrumb-harness.ts`.

**Status:** established

**Last refined:** 2026-08-01

### Small counts state their attachment

**Invariant:** If a chrome count is attached to an icon, then it uses superscript digits; if it stands alone, then it uses subscript digits. ASCII mode uses plain digits. Every count clamps to the three-cell budget at 999.

**Scope:** The panel instances toggle and activity-bar affected-files count.

**Mechanism:** `ThemeIcons.smallDigitCountFor` owns the two digit vocabularies, ASCII fallback, and cap. Consumers choose only the placement role.

**Generates:** `≡ ¹²`, standalone `₁₂`, plain ASCII digits, and stable activity-icon alignment from zero through three count cells.

**Evidence:** `src/modules/theme/ThemeIcons.ts`; `src/modules/ui/PanelTabBar.ts`; `src/modules/ui/ActivityBar.ts`.

**Impossible if true:** A four-cell count, a plus abbreviation, a baseline icon-attached count, or an activity icon that moves as its count grows.

**Verification:** `bun test src/modules/theme/ThemeIcons.test.ts src/modules/ui/PanelTabBar.test.ts` and `bun scripts/harness/smoke-activitybar-harness.ts`.

**Status:** established

**Last refined:** 2026-08-01

### Secondary controls reveal on hover

**Invariant:** If a row control is secondary to selecting the row, then it stays hidden until the pointer hovers that row and it provides a tooltip when revealed.

**Scope:** List-row split and close controls.

**Mechanism:** The row projection reserves stable cells, paints controls only for the hovered row, and resolves tooltips from the same action columns.

**Generates:** Quiet lists whose destructive controls remain discoverable.

**Evidence:** `src/modules/ui/PanelContentsList.ts`.

**Impossible if true:** A secondary row control that is always visible, changes row width when revealed, or has no tooltip.

**Verification:** `bun scripts/harness/smoke-panel-split-harness.ts`.

**Status:** established

**Last refined:** 2026-08-01

### One dialog component serves confirms and prompts

**Invariant:** If an interaction needs a modal confirmation or prompt, then it is an instance of the generic dialog component.

**Scope:** Quit, panel-container close, and input-carrying prompts. Instance close carries no modal
interaction: confirmation is warranted by blast radius, not by action kind, so closing one instance
asks nothing while closing a container that owns several asks once and states the count.

**Mechanism:** `Dialog` owns modal state, labels, focus movement, dismissal, and activation; the overlay projects its current configuration.

**Generates:** One centered, padded keyboard-and-mouse dialog behavior.

**Evidence:** `src/modules/ui/Dialog.ts`; `src/modules/navigation/GoToLinePrompt.ts`;
`src/modules/ui/OverlayLayer.ts`; `src/modules/app/Bootstrap.ts`.

**Impossible if true:** A confirmation with its own focus model or button activation path.

**Verification:** `bun scripts/harness/smoke-panel-split-harness.ts` and
`bun test src/modules/ui/OverlayLayer.test.ts src/modules/app/Bootstrap.test.ts`.

**Status:** established

**Last refined:** 2026-08-01

### Splitters are thin and subtle

**Invariant:** If a cell is a draggable boundary, then it paints a thin line in a subtle light tone at rest and a brighter tone while hovered or dragged.

**Scope:** Every horizontal and vertical splitter.

**Mechanism:** `SplitterElement` resolves rest and active colors, while `SeparatorAppearance` supplies the thin axis glyph.

**Generates:** Boundaries that remain visible without competing with content.

**Evidence:** `src/modules/ui/SplitterElement.ts`; `src/modules/ui/SeparatorAppearance.ts`.

**Impossible if true:** A heavy splitter, an accent-bright idle splitter, or a splitter that does not highlight during drag.

**Verification:** `bun test src/modules/ui/SplitterElement.test.ts src/modules/ui/SeparatorAppearance.test.ts`.

**Status:** established

**Last refined:** 2026-08-01

### Add controls name their layer

**Invariant:** If an add control creates an item, then its visible label names the layer of item it creates.

**Scope:** Plugin and panel-instance add controls.

**Mechanism:** The tabs row projects `+ Plugin`; the instances panel derives `+ Terminal` or `+ Database` from the active plugin kind.

**Generates:** Distinct plugin-level and instance-level creation paths.

**Evidence:** `src/modules/ui/PanelTabBar.ts`; `src/modules/ui/PanelContentsList.ts`; `src/modules/app/Bootstrap.ts`.

**Impossible if true:** An unlabeled plus whose target layer must be guessed.

**Verification:** `bun scripts/harness/smoke-panel-chrome-harness.ts`.

**Status:** established

**Last refined:** 2026-08-01

### Controls live in the frame they control

**Invariant:** If a control changes one framed object, then it appears in that object's frame rather than in an adjacent layer.

**Scope:** Editor actions, panel frame actions, plugin tabs, and instance controls.

**Mechanism:** The editor bottom border owns editor actions; the splitter row owns panel frame functions; the tabs row owns plugins; the instances panel owns instance add, split, and close controls.

**Generates:** Local action ownership and predictable control placement.

**Evidence:** `src/modules/ui/RootView.ts`; `src/modules/ui/PanelTabBar.ts`; `src/modules/ui/PanelContentsList.ts`.

**Impossible if true:** An editor action on the panel splitter or an instance action on the plugin tabs row.

**Verification:** `bun scripts/harness/smoke-panel-chrome-harness.ts scripts/harness/smoke-panel-split-harness.ts`.

**Status:** established

**Last refined:** 2026-08-01
