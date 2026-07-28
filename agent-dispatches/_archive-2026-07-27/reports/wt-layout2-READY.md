# Layout Wave 2 — READY

Branch: `feat-layout-wave2`

Exact tip: `4513b4398c21f9806aa825e5ea469ec92162ad00`

Commit: `4513b43 feat: add command bar and pane-hosted file tree`

Rebased onto: `d6670d7c41b1975393711ebf9fe93c464c610728` (`origin/main`)

## Delivered

- Added `FileTreePaneContent` and registered it in a generic primary-dock `PanelHost`.
- Routed file-tree paint, wheel, horizontal wheel, hover, pointer leave, and click activation through
  the `PaneContent` seam while preserving the existing `TreePaneRenderer`, `FileTree`, and
  `Workspace` behavior generators.
- Added a one-row `CommandBar` below the workspace tabs with centered Back, Forward, and current
  folder controls plus a right-pinned Layouts control.
- Wired Back/Forward to the existing navigation history, the folder control to existing QuickOpen
  file search, and Layouts to the existing `BoundedListPopup`.
- Added all 32 wave-one layout configurations to `LayoutModel`; popup selection writes the four
  existing layout settings and applies them live.
- Added command-bar and tree-as-pane invariants, colocated tests, and driven SGR-mouse coverage.
- Corrected splitter status projection to use screen coordinates, preserving the existing splitter
  hover/drag smoke after the new command-bar row shifted nested layout origins.

## Files

- `src/modules/ui/CommandBar.ts`
- `src/modules/ui/CommandBar.test.ts`
- `src/modules/ui/FileTreePaneContent.ts`
- `src/modules/ui/FileTreePaneContent.test.ts`
- `src/modules/ui/PaneContent.ts`
- `src/modules/ui/RootView.ts`
- `src/modules/ui/Sidebar.ts`
- `src/modules/ui/ui.invariants.md`
- `src/modules/app/Bootstrap.ts`
- `src/modules/layout/LayoutModel.ts`
- `src/modules/layout/LayoutModel.test.ts`
- `scripts/harness/smoke-layout-harness.ts`
- `scripts/harness/smoke-navigation-history-harness.ts`
- `scripts/harness/smoke-workspace-tabs-harness.ts`

## Driven evidence

- SGR click on command-bar Back and Forward replayed the existing navigation history.
- SGR click on the current folder opened the existing QuickOpen surface in file-search mode.
- SGR click on Layouts opened the bounded popup, selected a non-default four-axis configuration,
  and verified its exact byte-level panel and dock slot edges.
- SGR clicks opened files from the pane-hosted tree with the primary dock on both the left and right.
- Existing file-tree scrolling, buffer tabs, workspace tabs, splitters, right dock, and compact
  viewport behavior remained green.

## Verification

| Instrument | Result |
| --- | --- |
| `bunx tsc --noEmit` | PASS |
| `bun test` | PASS — 1,199 tests, 0 failures, 15,380 expectations |
| `bun .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | PASS — 602 annotations, 39 lattice links, 0 problems |
| `bun scripts/check-file-grammar.ts` | PASS |
| `bash scripts/conventions-gate.sh` | PASS |
| `bun scripts/harness/smoke-layout-harness.ts` | ALL-PASS |
| `bun scripts/harness/smoke-navigation-history-harness.ts` | ALL-PASS |
| `bun scripts/harness/smoke-tree-scroll-harness.ts` | ALL-PASS |
| `bun scripts/harness/smoke-tabs-harness.ts` | ALL-PASS |
| `bun scripts/harness/smoke-workspace-tabs-harness.ts` | ALL-PASS |
| `git diff --check origin/main...HEAD` | PASS |
| `git merge-base --is-ancestor origin/main HEAD` | PASS |

All verification above was repeated after the final rebase. The worktree has no uncommitted task
changes; only the supplied `TASK.md` remains intentionally untracked.
