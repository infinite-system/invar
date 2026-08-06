## In plain words

Search could find workspace matches, but it could not safely change them. It can now replace one match or many files after consent. Undo and redo restore the changed items, while changed or unreadable files stay untouched and named.

## Status

READY for the conductor gate.

The task is [replace, consent, drift, and history](brief-536-1-workspace-replace-consent-history.md). The branch contains these commits:

- `3dd6d2978387de81321eddb4a831b81e6ec73ea5` — `Add consented workspace replace history`
- `d1b1ec3cc5612f41cf5d30ad3e77ef8b799c0918` — `Prove replacement history stays patch-bounded`

## What changed

- [WorkspaceSearchWorkspace.ts](../../../../src/modules/search/WorkspaceSearchWorkspace.ts) now freezes selected matches before consent. It verifies exact text and context again at the acting boundary.
- The same model applies replacement, undo, and redo across open documents and closed files. It reports applied, skipped, drifted, and failed item counts.
- [WorkspaceSearchPaneContent.ts](../../../../src/modules/search/WorkspaceSearchPaneContent.ts) uses the shared dialog for replacement consent, history consent, drift details, and the 64 MiB alert.
- [WorkspaceSearchPaneRenderer.ts](../../../../src/modules/search/WorkspaceSearchPaneRenderer.ts) paints one themed replace control per match. It also paints fixed `Replace All`, `Undo`, and `Redo` controls.
- [Editor.ts](../../../../src/modules/editor/Editor.ts) accepts external text edits as one editor transaction. Open files stay dirty and keep the normal local undo order.
- [Files.ts](../../../../src/modules/system/Files.ts) verifies bytes, writes an exclusive temporary sibling, renames it, and reads the result back. Closed files never use the open-document path.
- [WorkspaceReplacementHistory.ts](../../../../src/modules/search/WorkspaceReplacementHistory.ts) keeps at most 20 complete transactions and 64 MiB of patch text. It evicts the oldest complete action first.
- [WorkspaceSearchBackend.ts](../../../../src/modules/search/WorkspaceSearchBackend.ts) records byte offsets and bounded context. It now encodes each source once, not once for every match.
- [smoke-workspace-search-harness.ts](../../../../scripts/harness/smoke-workspace-search-harness.ts) locks the live consent, cancel, replace, undo, redo, drift, scale, and unavailable-search paths.

## Invariants

The path and content scope includes [editor.invariants.md](../../../../src/modules/editor/editor.invariants.md), [search.invariants.md](../../../../src/modules/search/search.invariants.md), and [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md).

| Record | Verdict | Evidence |
| --- | --- | --- |
| [Undo records deltas not whole-document snapshots](../../../../src/modules/editor/editor.invariants.md#undo-records-deltas-not-whole-document-snapshots) | Strengthened | Open files use external editor edits. History retains one arena with successful reverse patches only. |
| [Input overlays share one modal slot](../../../../src/modules/ui/ui.invariants.md#input-overlays-share-one-modal-slot) | Upheld | Every new consent and alert opens the shared `Dialog.Class` through the exclusive overlay coordinator. |
| [Search results are click-set and highlight-shown](../../../../src/modules/search/search.invariants.md#search-results-are-click-set-and-highlight-shown) | Untouched | The Quick Open result path did not change. |
| [The selected quick-open row is always visible](../../../../src/modules/search/search.invariants.md#the-selected-quick-open-row-is-always-visible) | Untouched | The Quick Open selection path did not change. |
| [Quick Open activates the selected entry](../../../../src/modules/search/search.invariants.md#quick-open-activates-the-selected-entry) | Untouched | The Quick Open activation path did not change. |
| [Exact basenames rank above fuzzy paths](../../../../src/modules/search/search.invariants.md#exact-basenames-rank-above-fuzzy-paths) | Untouched | Search ranking did not change. |
| [File enumeration failures stay visible](../../../../src/modules/search/search.invariants.md#file-enumeration-failures-stay-visible) | Untouched | Quick Open enumeration did not change. Workspace failures also stay visible. |
| [Find bar controls are mouse-clickable buttons](../../../../src/modules/search/search.invariants.md#find-bar-controls-are-mouse-clickable-buttons) | Upheld | The neighbor drive kept in-file controls clickable. Workspace controls use one paint and hit range. |
| [Find options re-run the active query](../../../../src/modules/search/search.invariants.md#find-options-re-run-the-active-query) | Upheld | The neighbor drive and final behavioral pass kept this path green. |
| [The open-project path input is a live directory navigator](../../../../src/modules/search/search.invariants.md#the-open-project-path-input-is-a-live-directory-navigator) | Untouched | The open-project path did not change. |
| [An un-openable open-project path is flagged live](../../../../src/modules/search/search.invariants.md#an-un-openable-open-project-path-is-flagged-live) | Untouched | The open-project error path did not change. |

The change also upholds [Cost tracks the actively observed set](../../../../project.invariants.md#cost-tracks-the-actively-observed-set). One 1 MiB file leaves 141 bytes in retained replacement history.

The four records in [design section 12](../../../../project-find-replace-design.md#12-proposed-invariant-records) remain proposals, as the brief requires.

## Driven evidence

- Defaults first, 10 lines: `Replace All` showed `Replace 10 items across 1 file?`. Escape kept 10 results and changed no text.
- Consent applied all 10 items. Results became zero, the open document became dirty, and one workspace transaction appeared.
- Local `Ctrl+Z` opened `Undo workspace replace`. Consent restored all 10 items and cleared the dirty marker.
- Ordinary typing followed by `Ctrl+Z` used direct editor undo. It did not open a workspace dialog.
- Redo restored the replacement. A later edit drifted one item before undo. Undo restored nine items and left the changed item untouched.
- A per-match replace changed one row and reduced the result count from nine to eight. A drifted per-match action opened `Match changed` and kept the item.
- One read-only file among three produced two applied items, one failed item, and one skipped item. The read-only file stayed byte-identical.
- The partial-failure workspace also held one open file and one closed file. The open buffer became dirty without a disk write. The closed file changed on disk.
- The 100,000-line fixture used the same replace, consent, undo, and redo gestures. A match on the final line restored exactly.
- Repeated Enter on consent did not apply twice. Repeated clicks on disabled `Replace All` did nothing. Repeated Enter on undo did not undo twice.
- The shared dialog allowed a pointer drag across `Replace`. `Ctrl+C` showed `Copied 7 chars (osc52)`.
- The result pane kept `Replace All`, `Undo`, and `Redo` visible while it reported a failed item.
- The unavailable-search neighbor still painted its full ripgrep remedy.

The drive server is stopped. The partial-failure scratch workspace was removed.

## Positive controls

- I planted `appliedCount = 0`. The PTY check failed with `Timed out waiting for replace scale 10: one item applies with no skip`.
- I replaced context verification with offset-only subject matching. The changed-context test expected `drifted` but received `exact` at byte 64.
- I planted a full 1 MiB file snapshot in retained history. The memory test expected 141 bytes but received 1,048,724 bytes.
- I bypassed `Dialog.Class` before replacement. The PTY check failed because `quitConfirmation.open` stayed false for 15,000 ms.

I removed every plant. Each targeted check then passed.

## Verification

- `bun test`: 2,493 pass, 0 fail, 72,851 expectations, 383 files.
- `bunx tsc --noEmit`: pass.
- `bash scripts/conventions-gate.sh`: pass.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 1,428 annotations, 287 lattice links, 0 problems.
- `bash scripts/behavioral-contracts.sh`: `ALL-PASS`.
- `bun scripts/harness/smoke-workspace-search-harness.ts`: `ALL-PASS` after all plants were removed.
- `git diff --check -- src/modules/search/WorkspaceSearchWorkspace.test.ts`: pass.
- `bun scripts/tasks/lint-task-links.ts <report>`: pass.
- STE report lint: 1.39 findings per 100 words.

## Bycatch

- The Search summary says `10 results in 1 files`. I saw it in the default 10-line flow and reproduced it more than once. I did not fix this grammar defect.
- [search.invariants.md](../../../../src/modules/search/search.invariants.md) names Quick Open, Find Bar, and open-project rules. It has no workspace replacement, consent, drift, or history records. [Design section 12](../../../../project-find-replace-design.md#12-proposed-invariant-records) has proposals, but no approved contract records. I did not promote them.

## Worktree

The task changes are committed. [AGENTS.md](../../../../AGENTS.md) remains modified because dispatch injected it. The untracked [BUILDER-FUNDAMENTALS.md](../../../../.invar/worktrees/536-workspace-replace-consent-history/BUILDER-FUNDAMENTALS.md) has the same source. I did not stage or change either artifact.
