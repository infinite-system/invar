## In plain words

The dirty dot was visible, but six checks stopped at the same file name in the breadcrumb row and read its next blank cell. I changed the shared checker to require real tab-and-close geometry before it reads the dot cell. Now the editor and dirty-marker smokes find the real dot, while four broader smokes stop earlier on separate problems listed below.

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
- [Round 10 gate repairs](brief-442-10-gate-reds.md)
- [Round 11 dirty-dot repair](brief-442-11-dirty-dot.md)

The worktree is clean. The branch contains 56 changed files, with 1,571 insertions and 326 deletions against `main`.

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

## Round 10 gate repairs

- The reveal-button failure was an old test expectation, not an oversized hit area. In the short 120-by-40 drive, the button paints and hovers at global columns 32 through 34. In the overflowing 120-by-24 drive, it paints and hovers at columns 31 through 33 while the scrollbar keeps column 34. The 12-column pane test now accepts local columns 8 through 10, including both painted pads, and rejects the true outside cells at 7 and 11.
- The coverage failure was a wrong declaration, not excess smoke code. The panel smoke has 19 assertions and 55 waits, down from 25 assertions and up from 46 waits. The earlier declaration understated the new smoke by 3 assertions and 6 waits. I changed [the coverage record](../../../../project.coverage-deltas.md) from `25 → 16` and `46 → 49` to the measured `25 → 19` and `46 → 55`. I did not remove any smoke coverage.

## Round 11 dirty-dot repair

The product did not lose its dirty dot. A 100-by-28 drive published `dirty=true` and painted `FileTreePaneContent.ts ● ×` on row 4. The `●` occupied column 60, with the close mark at column 62. The exact dirty-marker smoke also ended with `dirty-marker.txt ● ×` while its wait still timed out.

The shared `activeTabHasDirtyMarker` helper returned after the first ` filename ` match. The editor-area rewrite moved the breadcrumb to row 3 and the file tabs to row 4, so the helper read the breadcrumb's blank next cell and never reached the tab. It now accepts a candidate only when the active theme's close glyph sits two cells after the marker cell. A unit test locks the breadcrumb-above-tab case.

### Per-tab indicator inventory

- Dirty: the rich marker `●` paints between the padded filename and `×`. Clean state keeps the same cell blank. The direct editor and dirty-marker smokes both pass.
- Active: in a 140-by-28 two-tab drive, inactive `TabBarRenderer.ts` used panel background `1447454`, while active `TabBar.ts` used content background `1710886`. The active chip still joins the editor content tone.
- Preview or italic: neither `TabStripItem` nor `TabBarRenderer` has a preview or italic state. Structural searches found no `previewTab` or `isPreview` identifier, and history found no italic tab rendering. This indicator did not exist in the old renderer and was not dropped by this rewrite.
- Close: both visible tabs painted `×`, with a blank marker cell and spacing before the close. The tab smoke also opened eight tabs and confirmed the shared close mark.
- Overflow: a 100-by-28 two-tab drive painted padded `«` and `»` controls beside `2/2`; the 140-column drive omitted them when both tabs fit. The tab smoke clicked the right arrow and preserved the active buffer.

### Contract finding and proposal

[The existing dirty-marker record](../../../../src/modules/text/text.invariants.md#the-dirty-marker-is-derived-from-content-never-asserted) names `TabBarRenderer`'s marker cell, so no new record is needed. Its current impossible case only rejects a clean buffer that shows a dot. It does not reject the opposite false negative that this gate reported.

I propose refining its `Invariant` field to state that content equal to the saved baseline reports clean and paints no `●`, while content different from that baseline reports dirty and paints the active `tabDirtyMarker` glyph. I also propose adding `a dirty buffer whose visible tab marker cell is blank` to `Impossible if true`. I did not change the contract because the invariant workflow requires proposal and confirmation first.

## Positive controls

- I planted the old crossing background by passing `palette.panel` to the panel separator. `smoke-panel-chrome-harness.ts` exited 1 at `Timed out waiting for grid condition: the panel splitter repaints the right-dock crossing`. I restored `palette.bg`.
- I planted a one-row reveal error. `smoke-tree-scroll-harness.ts` exited 1 at `FAIL automatic reveal centers the selected file in the tree viewport`. I restored the centered calculation.
- I planted a missing editor-area path by passing `null` at the shell seam. `smoke-diff-overview-harness.ts` exited 1 at `Timed out waiting for grid condition: the editor-area row names the file shown by the comparison`. I restored `editorContentMount.displayedPath`.
- Before the round 10 repair, `bun test src/modules/filetree/FileTreePaneContent.test.ts` failed because local column 8 returned `Reveal open file` while the test expected `null`. After the repair, that file passed 2 tests with 16 expectations.
- Before the round 10 repair, `bun scripts/check-coverage-ratchet.ts` failed because the declared `25 → 16` assertions and `46 → 49` waits did not match the measured `25 → 19` and `46 → 55`. After the record repair, it inspected 392 files and passed.
- For round 11, I temporarily replaced the dirty glyph with a blank in `TabBarRenderer`. The dirty-marker smoke failed at `the typed line and the tab dirty marker are both painted`, and its grid showed `dirty-marker.txt   ×`. I restored the glyph. The smoke then passed every arm.

## Verification

- Full unit pass, run as the last code check: 2,295 passed, 0 failed, 71,871 expectations across 348 files.
- Round 11 focused unit pass: 9 passed, 0 failed, 22 expectations across `HarnessSmoke.test.ts` and `TabBarRenderer.test.ts`.
- Round 11 direct PTY pass: `smoke-editor-harness.ts`, `smoke-dirty-marker-harness.ts`, and `smoke-tabs-harness.ts` all passed.
- Four requested aggregate checks did not reach a dirty-tab failure: `smoke-scrollbars-harness.ts`, `smoke-agent-pane-ux-harness.ts`, `smoke-agent-cancel-harness.ts`, and `behavioral-contracts.sh` stopped on the unrelated Bycatch items below. I do not claim that all six named checks are green.
- PTY pass after merging main: all 11 smokes passed: panel chrome, tree scroll, navigation history, breadcrumb, activity bar, tabs, workspace tabs, go to line, reserved chord, diff overview, and Markdown.
- Coverage ratchet: 392 files inspected, with no undeclared decrease against `a9700d9`.
- Contract pass: 1,329 annotations resolved, 266 lattice links resolved, 0 problems.
- `git diff --check` passed.
- `bunx tsc --noEmit` passed.
- `bash scripts/conventions-gate.sh` passed, including both static-self-read census arms.
- I did not run the full merge gate, as required by the task. Each task commit used `SKIP_GATE=1`.

## Commits

- `d78cda06fb1485bf8ef43d68d90efae2af9fae45` — Polish panel editor tree chrome
- `b520a4e490097be231c28c5c73d21887b701baf4` — Merge `main` and load the plain-words report law
- `5fd0787debd969f288e7871135c579dcb3c9ac8d` — Make chrome rows and counts line up
- `9bcb116bed7c5f954b36bb53b613b7cb56d99d5c` — Complete chrome design records
- `3af48785d7a3a452da85249e98583a5812c90e42` — Merge `main` before the round 10 repairs
- `25f1106c859249c96f9ddee60d1416901fb28c13` — Fix chrome gate records
- `93e2488d088d3673487417a5ac9bda7d3b788ed1` — Fix dirty tab smoke geometry

HEAD is `93e2488d088d3673487417a5ac9bda7d3b788ed1`.

## Bycatch

- The earlier [Drive.ts](../../../../scripts/harness/Drive.ts) hover-action type failure no longer reproduces after the round 10 merge from main. `bunx tsc --noEmit` now passes.
- Suspect Quick Open delay, seen once: a default drive against the full repository left `quickOpenFileEnumerationState` at `loading` until the drive timed out. The later 60-file Quick Open arm passed, so I did not reproduce it a second time.
- Suspect panel-drag input delay, seen once: `bun scripts/harness/smoke-panel-chrome-harness.ts` timed out while waiting for the last-cell drag. Its immediate rerun and the final 120-column and 88-column pass succeeded.
- Right-dock close from right-dock focus, reproduced during exploratory crossing drives: with the bottom panel open, Ctrl+Alt+B opened the right dock, but the same chord did not close it after focus moved into that dock. The focused-task reserved-chord smoke passed. I kept this behavior outside the chrome-paint change.
- Diff scrollbar start state, reproduced twice in round 11: `smoke-scrollbars-harness.ts` timed out at `the diff pane vertical thumb is painted before frame collection begins`. The final diff grid showed no thumb. I did not change diff scrolling in the tab-detector repair.
- Agent-pane grid bounds, reproduced twice in round 11: `smoke-agent-pane-ux-harness.ts` threw `Invalid grid region rows 27-2, columns 38-108 for 50x110 snapshot` during its tail-scroll arm. I did not change the shared region code.
- Agent composer activation, seen once in round 11: `smoke-agent-cancel-harness.ts` timed out waiting for `/resolver-smoke ARGUMENTANCHOR`; its final grid showed an empty composer. I did not change agent activation.
- Structure-filter focus tone, seen once in round 11: `behavioral-contracts.sh` failed while waiting for `the focused structure filter has one leading cell in the shared active tone`. Other contract arms continued, but the script ended with `behavioral-contracts: FAILURES`. I did not change structure filtering.
