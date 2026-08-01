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

**Scope:** Quit, terminal-instance close, and input-carrying prompts.

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
