## In plain words

The lines, buttons, paths, and little numbers around the editor did not line up or use the right colors. I gave the shared editor and chrome parts one set of placement rules, so the same fix reaches normal files, Git diffs, Markdown previews, small trees, and large trees. Now the rows stay in order, the icons do not jump, and each file view says which path it shows.

## READY

#442 (panel editor tree chrome polish) is complete. I implemented the [task](task-442-panel-editor-tree-chrome-polish.md), the [main brief](brief-442-1-panel-editor-tree-chrome-polish.md), and all later amendments:

- [Conditional reveal-button shift](brief-442-4-2-reveal-button-conditional-shift.md)
- [One-space toggle count](brief-442-6-3-toggle-count-single-space.md)
- [Small-digit counts](brief-442-8-7-small-digit-counts.md)
- [Git count alignment](brief-442-10-9-git-count-alignment.md)
- [Monitoring icon](brief-442-12-11-monitoring-icon.md)
- [Chrome-strip backgrounds](brief-442-14-13-chrome-strip-backgrounds.md)
- [Splitter-gap reversion](brief-442-8-b442-revert.md)
- [Editor-area breadcrumb ownership](brief-442-9-b442-diff-breadcrumb.md)

The worktree is clean. The branch contains 52 changed files, with 1,522 insertions and 314 deletions against `main`.

## Result

- The bottom-panel splitter keeps its original start column. Columns 37 and 91 keep the `─` glyph and now use row background `1710886`. No leading gap was added. [SeparatorAppearance](../../../../src/modules/ui/SeparatorAppearance.ts) owns the opaque separator surface.
- The panel instances toggle owns a clickable right pad. Its rich count is `≡ ¹²`, with one space before superscript digits. Counts cap at 999. ASCII mode uses plain digits.
- The Git activity count uses one leading space and subscript digits. The Git icon stays in column 2 for no count, 1, 12, and 999. A 1,001-file fixture paints 999.
- The monitoring activity icon now uses the Live Tasks circle `◉`. ASCII mode uses `O`. Both occupy one cell. [ThemeIcons](../../../../src/modules/theme/ThemeIcons.ts) owns these glyph and count ladders.
- Editor-frame actions use active border color `8037111`. Their hit targets keep one painted cell on each side.
- The tree reveal button stays at columns 32 through 34 in a short tree. It shifts to columns 31 through 33 only when the scrollbar occupies column 34. Click, Quick Open, and automatic reveal center the selected row. The setting-off arm still needs an explicit reveal.
- The top rows now read workspace, branch, project, breadcrumb and history, file tabs, then editor content. The five chrome strips use panel background `1447454`. Only editor content and the active file-tab chip use content background `1710886`.
- The history buttons are padded three-cell controls. Terminal Alt+Left and Alt+Right, macOS Option-arrow byte forms, and Ctrl+Alt+bracket fallbacks traverse the same history. Ctrl+Alt+B stays reserved for the right dock.
- The breadcrumb row belongs to the editor-area shell. The seam is `EditorContentMount.displayedPath`, backed by `EditorSurfaceContent.displayedPath` for contributed views. [RootView](../../../../src/modules/ui/RootView.ts) has no Git or Markdown branch. Git comparisons supply the diffed file path, and Markdown previews supply their source path.
- [The UI contract](../../../../src/modules/ui/ui.invariants.md) now records editor-area path ownership. [The design contract](../../../../design.invariants.md) records chrome order, backgrounds, spacing, centered reveal, and count attachment.

## Driven evidence

- Panel chrome passed at 120 by 40 and 88 by 24. The smoke checked the line at columns 37 and 91, drag input at both ends, editor-action colors, toggle padding, and the superscript count.
- Tree reveal passed with the short tree, a 60-file scrolling tree, a clicked lower file, Quick Open, automatic reveal, explicit reveal, and the setting disabled.
- Breadcrumb and Markdown scale checks passed at 10, 12, 500, and 100,000 lines. The diff smoke painted `❮  ❯` and `long.txt` on the same row before and after a diff remount.
- Navigation painted the breadcrumb at row 3 and file tabs at row 4. The project, branch, workspace, breadcrumb, and file-tab strips all used `1447454`; the editor and active file tab used `1710886`.
- Activity checks passed for 0, 1, 12, and 1,001 Git changes. Rich monitoring painted `◉`; ASCII monitoring painted `O`.

## Positive controls

- I planted the old crossing background by passing `palette.panel` to the panel separator. `smoke-panel-chrome-harness.ts` exited 1 at `Timed out waiting for grid condition: the panel splitter repaints the right-dock crossing`. I restored `palette.bg`.
- I planted a one-row reveal error. `smoke-tree-scroll-harness.ts` exited 1 at `FAIL automatic reveal centers the selected file in the tree viewport`. I restored the centered calculation.
- I planted a missing editor-area path by passing `null` at the shell seam. `smoke-diff-overview-harness.ts` exited 1 at `Timed out waiting for grid condition: the editor-area row names the file shown by the comparison`. I restored `editorContentMount.displayedPath`.

## Verification

- Focused unit pass: 144 passed, 0 failed, 868 expectations across 18 files.
- PTY pass: all 11 smokes passed: panel chrome, tree scroll, navigation history, breadcrumb, activity bar, tabs, workspace tabs, go to line, reserved chord, diff overview, and Markdown.
- Contract pass: 1,324 annotations resolved, 263 lattice links resolved, 0 problems.
- `git diff --check` passed.
- `bunx tsc --noEmit` exited 2 only for the four pre-existing hover-action errors listed under Bycatch.
- I did not run the full merge gate, as required by the task. Each task commit used `SKIP_GATE=1`.

## Commits

- `d78cda06fb1485bf8ef43d68d90efae2af9fae45` — Polish panel editor tree chrome
- `b520a4e490097be231c28c5c73d21887b701baf4` — Merge `main` and load the plain-words report law
- `5fd0787debd969f288e7871135c579dcb3c9ac8d` — Make chrome rows and counts line up
- `9bcb116bed7c5f954b36bb53b613b7cb56d99d5c` — Complete chrome design records

HEAD is `9bcb116bed7c5f954b36bb53b613b7cb56d99d5c`.

## Bycatch

- Pre-existing type-check failure, reproduced twice: [Drive.ts](../../../../scripts/harness/Drive.ts) lines 921, 922, 968, and 969 read `resolvedPosition` from a hover action that does not declare that property. `bunx tsc --noEmit` exits 2 with four `TS2339` errors. I did not change this harness type.
- Suspect Quick Open delay, seen once: a default drive against the full repository left `quickOpenFileEnumerationState` at `loading` until the drive timed out. The later 60-file Quick Open arm passed, so I did not reproduce it a second time.
- Suspect panel-drag input delay, seen once: `bun scripts/harness/smoke-panel-chrome-harness.ts` timed out while waiting for the last-cell drag. Its immediate rerun and the final 120-column and 88-column pass succeeded.
- Right-dock close from right-dock focus, reproduced during exploratory crossing drives: with the bottom panel open, Ctrl+Alt+B opened the right dock, but the same chord did not close it after focus moved into that dock. The focused-task reserved-chord smoke passed. I kept this behavior outside the chrome-paint change.
