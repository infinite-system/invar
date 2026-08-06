# READY report — left-dock Search surface

## In plain words

Invar had a workspace search engine, but users had no panel to use it. I added that panel, then removed copied rules found in review. A second scrollbar and stale neighbor drives also caused gate failures. Search now uses the shared generators, and all five gate drives pass alone and together.

## Result

Commit `7c571aa2` adds the left-dock Search surface from the [task brief](brief-535-1-left-dock-search-surface.md). Commit `db857fa9` closes the five findings from the [structural brief](brief-535-2-2.md). Commit `81a419ee` closes the gate failures from the [gate-red brief](brief-535-3-3.md).

The surface has four shared text fields: Search, Replace, Files to include, and Files to exclude. It has Aa, ab, regex, and ignore-file toggles with hover, pressed, and on states.

Results stream into file groups. Match rows open the exact file span. Replace text adds preview rows. Empty Replace text adds no blank rows.

Users can collapse files, dismiss matches, select and copy result text, page, wheel, and drag the shared scroll bar. The final limit notice wraps at the live dock width.

`Ctrl+Shift+F` focuses Search. `Ctrl+Shift+R` focuses Replace. Tab and Shift+Tab cross all fields and the result tree.

`Alt+I` toggles ignore files. `Alt+D` dismisses the selected match. Both chords run named Search commands.

The Search contributor performs the idempotent activity-slot migration. Fresh orders place Search after Files. Existing Search positions remain unchanged.

## Structural amendment

1. WrapText reuse: the error surface calls the shared wrapper in [WorkspaceSearchPaneRenderer.ts](../../../../src/modules/search/WorkspaceSearchPaneRenderer.ts):182. Limit notices use the same generator in [WorkspaceSearchResultTree.ts](../../../../src/modules/search/WorkspaceSearchResultTree.ts):245. Both local wrap loops are gone.
2. One render-context builder: [WorkspaceSearchPaneContent.ts](../../../../src/modules/search/WorkspaceSearchPaneContent.ts):210 builds all context fields and selection ranges. The interaction path is a thin caller at [WorkspaceSearchPaneContent.ts](../../../../src/modules/search/WorkspaceSearchPaneContent.ts):677.
3. One result geometry source: [WorkspaceSearchPaneRenderer.ts](../../../../src/modules/search/WorkspaceSearchPaneRenderer.ts):18 owns `RESULT_START_ROW`. Rendering reads it at line 178. Pane hit testing, scrolling, and resize geometry read it through [WorkspaceSearchPaneContent.ts](../../../../src/modules/search/WorkspaceSearchPaneContent.ts):155.
4. Dedicated options row: the four field definitions contain only fields at [WorkspaceSearchPaneRenderer.ts](../../../../src/modules/search/WorkspaceSearchPaneRenderer.ts):28. The four option definitions start at line 50, and one row lays them out from line 139. The forced-width path is gone.
5. Keyboard paths: [WorkspaceSearchContributor.ts](../../../../src/modules/search/WorkspaceSearchContributor.ts):127 binds `Alt+I` to `workspaceSearch.toggleIgnoreFiles`. Line 132 binds `Alt+D` to `workspaceSearch.dismissMatch`. Their commands register at lines 267 and 273. The selected-match action reaches [WorkspaceSearchPaneContent.ts](../../../../src/modules/search/WorkspaceSearchPaneContent.ts):353.

## Gate-red amendment

1. Quick Open PATH confinement: [smoke-quickopen-harness.ts](../../../../scripts/harness/smoke-quickopen-harness.ts):34 creates one private binary directory. Lines 38-39 add only `setsid` and `git`. Lines 445-453 give that PATH only to the degraded app. Line 525 removes the directory. The old filter removed `/usr/bin` because it contained `rg`, which also removed `setsid` and `git`. No process environment escaped to a sibling.
2. Canonical activity order: [smoke-activitybar-harness.ts](../../../../scripts/harness/smoke-activitybar-harness.ts):531 asserts `files,search,git`. Lines 970-978 derive the Git row from that order instead of assuming one Down press.
3. Plugin-manifest navigation: [smoke-plugin-manifest-harness.ts](../../../../scripts/harness/smoke-plugin-manifest-harness.ts):493 uses the existing visible-row selector. One Down press had selected Search, not Git.
4. Workspace-layout clicks: [smoke-workspace-layout-isolation-harness.ts](../../../../scripts/harness/smoke-workspace-layout-isolation-harness.ts):107 gets each glyph from the theme ladder. Lines 122-145 find its live painted row and click it. The drive no longer stores rows from the old activity order.
5. One primary-dock scrollbar: [ScrollbarSync.ts](../../../../src/modules/ui/ScrollbarSync.ts):64 creates the one shared vertical bar. Lines 369-374 apply active-content geometry to it. [RootView.ts](../../../../src/modules/ui/RootView.ts):1872 attaches the Search scroll port, and lines 2545-2558 tick primary-dock momentum. Commit `81a419ee` deletes the second bar that the first task round added.

The three remaining timeouts had these three-clock results.

| Drive | Input clock | Model clock | Painted-frame clock | Fix |
| --- | --- | --- | --- | --- |
| Workspace layout | The click landed on stored row 10. | The active item became Structure, not Tasks. | The Tasks pane never painted. | Find the requested icon on the current screen before each click. |
| Settings applied | Ten wheel events reached the File Tree. | `treeScrollTop` changed, and the status frame settled. | Thickness 1 painted two staggered dim columns. The pre-Search base painted one. | Delete the duplicate bar and keep `ScrollbarSync` as the generator. |
| Plugin manifest | One Down press reached the list. | Search became selected because it now follows Files. | Git never gained the selected marker. | Use the existing visible-label row selector. |

The Search smoke keeps its separate missing-ripgrep arm. [smoke-workspace-search-harness.ts](../../../../scripts/harness/smoke-workspace-search-harness.ts):546 creates a private binary directory with only `setsid`. Lines 551-556 pass it only to that app. Lines 575-608 require the exact unavailable state and all five painted message rows.

## Main code

- [WorkspaceSearchContributor.ts](../../../../src/modules/search/WorkspaceSearchContributor.ts) registers the activity item, commands, chords, status, and order migration.
- [WorkspaceSearchPaneContent.ts](../../../../src/modules/search/WorkspaceSearchPaneContent.ts) owns input, pointer, copy, file-open, and shared-scroll behavior.
- [WorkspaceSearchPaneRenderer.ts](../../../../src/modules/search/WorkspaceSearchPaneRenderer.ts) paints the four fields, controls, summaries, errors, groups, matches, and previews.
- [WorkspaceSearchResultTree.ts](../../../../src/modules/search/WorkspaceSearchResultTree.ts) owns grouping, collapse, dismissal, selection, the visible window, and limit rows.
- [ScrollbarSync.ts](../../../../src/modules/ui/ScrollbarSync.ts) owns the shared primary-dock thumb.
- [RootView.ts](../../../../src/modules/ui/RootView.ts) attaches the Search scroll port and ticks hosted-pane momentum.
- [Sidebar.ts](../../../../src/modules/ui/Sidebar.ts) forwards pointer drag, release, and drag-end to primary-dock content.
- [smoke-workspace-search-harness.ts](../../../../scripts/harness/smoke-workspace-search-harness.ts) is the permanent PTY contract.

## Driven evidence

I drove defaults first in the task worktree.

- The default order was `files, search, git, structure, tasks, monitoring, extensions`.
- `WorkspaceSearchContributor` returned 13 matches in 4 files.
- Replace text produced 30 grouped visual rows. Empty Replace text removed the preview rows.
- Mouse and Enter opened the exact path and selected the exact match span.
- File collapse changed the visible row count from 30 to 24, then back to 30.
- Thirteen dismiss clicks changed selected count after every click: 13 through 0.
- A new query generation restored selected count from 0 to 13.
- Boundary queries returned 0, 1, and 13 matches.
- A queued edit followed by Escape reached `idle`. The next edit produced one new generation and 13 matches.
- PageDown moved result scroll from 0 to 47. Three wheel notches moved it from 47 to 53.
- A pointer drag selected 11 result characters. `Ctrl+C` advanced the shared clipboard completion count from 0 to 1.
- Query selection had anchor 0 and caret 1. Its copy advanced the completion count from 1 to 2.
- Aa, ab, regex, and ignore controls showed their exact tooltips. Every mouse click changed the owned option.
- Tab moved forward through all four fields. Shift+Tab moved back. `Ctrl+Shift+R` focused Replace.

The shared scale fixtures gave the same exact-open shape at both ends.

- At 10 lines, one query returned one result. Enter opened `scale-10.txt` at line index 9 and selected columns 0 through 17.
- At 100,000 lines, one query returned one result. Enter opened `scale-100000.txt` at line index 99,999 with the same columns.
- The broad 100,000-line query stopped at 20,000 matches. Its last logical item was the wrapped `limitNotice`.
- The permanent smoke repeated activity mouse input, control tooltips, mouse open, keyboard open, copy, cap, PageDown, and wheel input at both scales.

I drove the saved-order migration with `extensions, files, git` in a fresh profile. Launch one saved `extensions, files, search, git, structure, tasks, monitoring`. Launch two kept the same sequence.

The neighbor sweep also passed.

- Files painted its tree at boot.
- Quick Open returned 2 matches and opened `WorkspaceSearchPaneContent.ts`.
- The in-file Find bar found 40 `WorkspaceSearch` matches and closed with Escape.

I re-drove the structural round after the refactor.

- The panel painted four full-width fields and one row with `Aa`, `ab`, `.*`, and `Use ignores`.
- Mouse clicks still toggled all four options and showed the same tooltips.
- `Alt+I` changed ignore files from on to off, then from off to on.
- `Alt+D` left a selected file group unchanged. It dismissed the selected match and stayed at zero after a repeat.
- Enter still opened the dismissed match at its exact file line.
- The full permanent smoke repeated the same exact-open path at 10 and 100,000 lines.

## Ripgrep premise correction

The machine does have ripgrep. The active binary was `/home/parallels/.codex/packages/standalone/releases/0.146.1-aarch64-unknown-linux-musl/codex-path/rg`, version `15.2.0`.

I launched Invar with an isolated PATH that contained only `setsid`. Search then published `unavailable`, 0 results, and this exact message:

> Workspace search is unavailable because ripgrep is not installed. Install ripgrep, make rg available in PATH, and restart Invar.

The panel painted the full message across five wrapped rows.

## Verification

The final unit pass completed after the gate-red amendment: 2,485 tests passed, 0 failed, with 72,804 assertions across 383 files.

These final checks passed:

- `bun run typecheck`
- `bun run build`
- `bash scripts/conventions-gate.sh`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 1,428 annotations and 287 lattice links, with 0 problems
- `bun scripts/harness/smoke-workspace-search-harness.ts`: `ALL-PASS`
- `git show --check 7c571aa2`
- `git show --check db857fa9`
- `git show --check 81a419ee`

The five required drives passed alone with exit 0:

- `bun scripts/harness/smoke-quickopen-harness.ts`
- `bun scripts/harness/smoke-activitybar-harness.ts`
- `bun scripts/harness/smoke-workspace-layout-isolation-harness.ts`
- `bun scripts/harness/smoke-settings-applied-harness.ts`
- `bun scripts/harness/smoke-workspace-search-harness.ts`

The same five commands ran at the same time. Every process exited 0. Quick Open, Activity Bar, Settings, and workspace Search ended `ALL-PASS`. Workspace layout isolation ended `ALL PASS`.

The related `bun scripts/harness/smoke-plugin-manifest-harness.ts` neighbor also passed alone with exit 0.

I ran `bash scripts/behavioral-contracts.sh` once, as required. It ended `FAILURES` because the new Search smoke read two old grids after status-only waits.

I changed those two waits to named screen conditions. The isolated Search smoke then passed every arm. I did not run the full behavioral script a second time.

## Positive controls

I planted four defects and removed each plant.

- Appending Search after Git made the slot test fail with `git, search` instead of `search, git`.
- Always adding Replace previews made the empty-Replace test find an unwanted `replacementPreview` row.
- Removing the primary-dock momentum tick made the large-scale wheel wait time out at scroll row 47.
- Removing sidebar pointer release made [Sidebar.test.ts](../../../../src/modules/ui/Sidebar.test.ts) miss its `up` call.

The permanent smoke also rejects a planted idle result state and wrong open file before it trusts live state.

For the structural round, I changed the `Alt+D` binding to `Alt+X`. The permanent smoke failed with `Timed out waiting for Alt+D dismisses the selected match`. I restored `Alt+D`, and the same smoke passed.

For the gate-red round, I planted the old `files,git,search` order in the new activity check. The drive exited 1 with `FAIL the default primary-dock order places Search between Files and Git`. I restored `files,search,git`, and the same drive ended `ALL-PASS`.

The existing Settings check was also a positive control for the scrollbar reduction. It failed at `2/3` with both generators, then passed at `1/3` after the duplicate was removed. I did not change that assertion.

## Invariant verdicts

The change aligns with shared text input, shared pane hosting, one scroll owner, shared momentum, theme-only appearance, and host clipboard records.

The record `Search results are click-set and highlight-shown` refines. Its generator now applies to Quick Open and workspace Search, but its current scope names only Quick Open.

Proposed wording: every selectable search-result list stores click selection, moves it by keyboard, and paints selection only with the shared row background. Hover stays separate and transient.

The record `Activity bar order is one persisted sequence` also refines. A new product slot needs one versioned, idempotent insertion without moving existing identifiers.

Proposed wording: one persisted sequence owns order. An unseen product slot may insert once at its declared anchor while preserving every existing relative position. Later launches preserve the user's exact position.

I did not edit either invariant record. The four records proposed by the [Find/Replace design](../../../../project-find-replace-design.md) remain proposals.

## Bycatch

- Brief mismatch: [brief-535-2-2.md](brief-535-2-2.md) calls `WrapText.Class.wrap` a greedy word wrapper. [WrapText.ts](../../../../src/modules/ui/WrapText.ts):79 hard-wraps graphemes by display cells. Routing both Search copies through it kept the full error text but changed its line breaks. This reproduced in the unavailable-ripgrep drive.
- `DriveSession.waitForHoverState()` assumed row 0 while the pointer was over the activity bar. It timed out although the Search tooltip painted. Observed once. The graph tooltip wait and permanent screen wait both passed.
- Contract gap: [search.invariants.md](../../../../src/modules/search/search.invariants.md) limits the click-set record to Quick Open. Workspace Search now has the same generator.
- Contract pressure: [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) says unseen activity contributions append. The required fixed Search slot needs the proposed migration refinement above.

No unrelated runtime defect reproduced twice.

## Worktree state

The task diff is committed in `7c571aa2`, `db857fa9`, and `81a419ee`. The worktree still contains dispatch-owned [AGENTS.md](../../../../AGENTS.md) and [BUILDER-FUNDAMENTALS.md](../../../../.invar/worktrees/535-left-dock-search-surface/BUILDER-FUNDAMENTALS.md) changes. I preserved them and did not include them in any task commit.
