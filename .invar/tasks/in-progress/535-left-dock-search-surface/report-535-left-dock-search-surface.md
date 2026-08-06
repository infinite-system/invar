# READY report — left-dock Search surface

## In plain words

Invar had a workspace search engine, but users had no panel to use it. I added the Search icon, fields, controls, result tree, and file opening. Search now works with mouse and keyboard at 10 and 100,000 lines.

## Result

Commit `7c571aa2` adds the left-dock Search surface from the [task brief](brief-535-1-left-dock-search-surface.md).

The surface has four shared text fields: Search, Replace, Files to include, and Files to exclude. It has Aa, ab, regex, and ignore-file toggles with hover, pressed, and on states.

Results stream into file groups. Match rows open the exact file span. Replace text adds preview rows. Empty Replace text adds no blank rows.

Users can collapse files, dismiss matches, select and copy result text, page, wheel, and drag the shared scroll bar. The final limit notice wraps at the live dock width.

`Ctrl+Shift+F` focuses Search. `Ctrl+Shift+R` focuses Replace. Tab and Shift+Tab cross all fields and the result tree.

The Search contributor performs the idempotent activity-slot migration. Fresh orders place Search after Files. Existing Search positions remain unchanged.

## Main code

- [WorkspaceSearchContributor.ts](../../../../src/modules/search/WorkspaceSearchContributor.ts) registers the activity item, commands, chords, status, and order migration.
- [WorkspaceSearchPaneContent.ts](../../../../src/modules/search/WorkspaceSearchPaneContent.ts) owns input, pointer, copy, file-open, and shared-scroll behavior.
- [WorkspaceSearchPaneRenderer.ts](../../../../src/modules/search/WorkspaceSearchPaneRenderer.ts) paints the four fields, controls, summaries, errors, groups, matches, and previews.
- [WorkspaceSearchResultTree.ts](../../../../src/modules/search/WorkspaceSearchResultTree.ts) owns grouping, collapse, dismissal, selection, the visible window, and limit rows.
- [RootView.ts](../../../../src/modules/ui/RootView.ts) gives the primary dock the shared thumb and hosted-pane momentum tick.
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

## Ripgrep premise correction

The machine does have ripgrep. The active binary was `/home/parallels/.codex/packages/standalone/releases/0.146.1-aarch64-unknown-linux-musl/codex-path/rg`, version `15.2.0`.

I launched Invar with an isolated PATH that contained only `setsid`. Search then published `unavailable`, 0 results, and this exact message:

> Workspace search is unavailable because ripgrep is not installed. Install ripgrep, make rg available in PATH, and restart Invar.

The panel painted the full message across five wrapped rows.

## Verification

The full unit pass completed before the final structural cleanup: 2,486 tests passed, 0 failed, with 72,800 assertions across 383 files.

After the structural cleanup, 34 focused tests passed with 167 assertions. The contributor positive-control restoration then passed 2 tests with 6 assertions.

These final checks passed:

- `bunx tsc --noEmit`
- `bun run build`
- `bash scripts/conventions-gate.sh`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 1,428 annotations and 287 lattice links, with 0 problems
- `bun scripts/harness/smoke-workspace-search-harness.ts`: `ALL-PASS`
- `git show --check 7c571aa2`

I ran `bash scripts/behavioral-contracts.sh` once, as required. It ended `FAILURES` because the new Search smoke read two old grids after status-only waits.

I changed those two waits to named screen conditions. The isolated Search smoke then passed every arm. I did not run the full behavioral script a second time.

## Positive controls

I planted four defects and removed each plant.

- Appending Search after Git made the slot test fail with `git, search` instead of `search, git`.
- Always adding Replace previews made the empty-Replace test find an unwanted `replacementPreview` row.
- Removing the primary-dock momentum tick made the large-scale wheel wait time out at scroll row 47.
- Removing sidebar pointer release made [Sidebar.test.ts](../../../../src/modules/ui/Sidebar.test.ts) miss its `up` call.

The permanent smoke also rejects a planted idle result state and wrong open file before it trusts live state.

## Invariant verdicts

The change aligns with shared text input, shared pane hosting, one scroll owner, shared momentum, theme-only appearance, and host clipboard records.

The record `Search results are click-set and highlight-shown` refines. Its generator now applies to Quick Open and workspace Search, but its current scope names only Quick Open.

Proposed wording: every selectable search-result list stores click selection, moves it by keyboard, and paints selection only with the shared row background. Hover stays separate and transient.

The record `Activity bar order is one persisted sequence` also refines. A new product slot needs one versioned, idempotent insertion without moving existing identifiers.

Proposed wording: one persisted sequence owns order. An unseen product slot may insert once at its declared anchor while preserving every existing relative position. Later launches preserve the user's exact position.

I did not edit either invariant record. The four records proposed by the [Find/Replace design](../../../../project-find-replace-design.md) remain proposals.

## Bycatch

- `DriveSession.waitForHoverState()` assumed row 0 while the pointer was over the activity bar. It timed out although the Search tooltip painted. Observed once. The graph tooltip wait and permanent screen wait both passed.
- Contract gap: [search.invariants.md](../../../../src/modules/search/search.invariants.md) limits the click-set record to Quick Open. Workspace Search now has the same generator.
- Contract pressure: [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) says unseen activity contributions append. The required fixed Search slot needs the proposed migration refinement above.

No unrelated runtime defect reproduced twice.

## Worktree state

The task diff is committed. The worktree still contains dispatch-owned [AGENTS.md](../../../../AGENTS.md) and [BUILDER-FUNDAMENTALS.md](../../../../.invar/worktrees/535-left-dock-search-surface/BUILDER-FUNDAMENTALS.md) changes. I preserved them and did not include them in `7c571aa2`.
