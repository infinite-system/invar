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
