# File tree — Invariants

Load-bearing rules for `src/modules/filetree/`. Stands on
`project.invariants.md` and the shared pane contracts in
`src/modules/ui/ui.invariants.md`.

## Reality-based invariants

_None specific — the file tree consumes the bounded-viewport and referenced-resource
reality invariants._

## Chosen invariants

### The file tree costs only what is expanded and visible

**Invariant:** If the project tree is large, then only expanded directories are listed and only
the visible window is rendered — cost is O(expanded + viewport), never O(total files).

**Scope:** `FileTree` listing, expansion, row materialization, and `TreePaneRenderer`.

**Mechanism:** Lazy directory reads are cached in a `Map`, expansion is tracked in a `Set`, and
flattened rows are replaced only on structural change. `TreePaneRenderer` slices that flattened
set to the live `PaneContent` viewport before materializing terminal rows.

**Generates:** Lazy expansion; windowed tree rendering; flat activation and paint cost as the
repository grows.

**Evidence:** `src/modules/filetree/FileTree.ts`;
`src/modules/filetree/TreePaneRenderer.ts`;
`src/modules/filetree/FileTree.test.ts`;
`src/modules/filetree/FileTreePaneContent.test.ts`.

**Impossible if true:** Opening a workspace lists an unexpanded descendant directory; painting
one tree viewport materializes a terminal row for every file in the repository.

**Verification:** `bun test src/modules/filetree/FileTree.test.ts
src/modules/filetree/FileTreePaneContent.test.ts`.

**Status:** provisional

**Last refined:** 2026-07-26

### The tree reveal follows the active file

**Invariant:** If a visible workspace file becomes active while `fileTreeRevealOpenFile` is enabled,
or the user invokes the reveal button, then the file tree expands its ancestors, selects its row,
and minimally scrolls that row into view without changing editor focus.

**Scope:** Files inside the active workspace root. A path hidden by `fileTreeShowHiddenFiles` is
outside the visible-row promise. Its reveal is a safe no-op.

**Mechanism:** `Workspace` publishes one `documentBecameActive` contribution event from
`OpenBufferSet.becameActive`. `FileTreeWorkspace` gates automatic reveal on its contributed setting,
halts vertical momentum, and delegates both automatic and button actions to `FileTree.revealPath`.
That method expands only ancestor paths, recomputes once, selects by absolute path, and uses the
tree's existing minimum-scroll authority.

**Generates:** One reveal path for tree clicks, Quick Open, goto-definition, palette opens, tab
activation, and the on-demand header button; one default-on contributed setting; safe hidden-file
behavior.

**Evidence:** `src/modules/workspace/Workspace.ts`; `src/modules/filetree/FileTree.ts`;
`src/modules/filetree/FileTreeWorkspace.ts`; `src/modules/filetree/FileTreePaneContent.ts`;
`src/modules/filetree/FileTree.test.ts`; `scripts/harness/smoke-tree-scroll-harness.ts`.

**Impossible if true:** A visible active workspace file with collapsed ancestors, an off-screen or
different selected row, live tree momentum competing with reveal, or reveal moving keyboard focus
away from the editor.

**Verification:** `bun test src/modules/filetree && bun
scripts/harness/smoke-tree-scroll-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-30

### File tree controls share paint and hit geometry

**Invariant:** If the file-tree header row paints a control, then the same projection segment
determines the columns that hover and activate it.

**Scope:** `FileTreeHeaderRow` and header-row pointer routing in `FileTreePaneContent`.

**Mechanism:** `FileTreeHeaderRow.project` lays out right-aligned button segments and returns their
half-open columns with the `StyledText`. `buttonAtColumn` resolves hover and clicks only from those
segments. The tree viewport and pointer row both start below the one-row control strip.

**Generates:** The circled-dot reveal control; one row that can accept the add-file and add-folder
controls without new layout or hit-test math.

**Evidence:** `src/modules/filetree/FileTreeHeaderRow.ts`;
`src/modules/filetree/FileTreePaneContent.ts`;
`src/modules/filetree/FileTreeHeaderRow.test.ts`;
`scripts/harness/smoke-tree-scroll-harness.ts`.

**Impossible if true:** A painted reveal control that does nothing, a neighboring blank column that
reveals a file, or the header row shifting tree click targets by a different amount than tree paint.

**Verification:** `bun test src/modules/filetree/FileTreeHeaderRow.test.ts
src/modules/filetree/FileTreePaneContent.test.ts && bun
scripts/harness/smoke-tree-scroll-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-30
