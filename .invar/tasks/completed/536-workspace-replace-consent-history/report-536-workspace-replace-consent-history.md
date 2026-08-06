## In plain words

The workspace replace behavior was right, but several parts had copied rules or lived in the wrong file. I moved each rule to one shared home and separated search state from replacement state. The same clicks now apply, undo, and redo at both small and large scale.

## Status

READY for the conductor gate.

This report closes the seven items in [brief 536-2](brief-536-2-2.md). The branch contains these commits:

- `3dd6d2978387de81321eddb4a831b81e6ec73ea5` — `Add consented workspace replace history`
- `d1b1ec3cc5612f41cf5d30ad3e77ef8b799c0918` — `Prove replacement history stays patch-bounded`
- `f76d94ca63817eaf7d5039c74618e95ec4365830` — `Reduce workspace replace to shared generators`

## Structural review answers

### 1. One editor edit primitive

[Editor.ts](../../../../src/modules/editor/Editor.ts):932 filters safe undo edits and records the undo history step. [Editor.ts](../../../../src/modules/editor/Editor.ts):950 keeps the external path all-or-nothing. Both call the one protected `applyVerifiedEdits` primitive at [Editor.ts](../../../../src/modules/editor/Editor.ts):970.

The shared `textEditStillMatches` check starts at [Editor.ts](../../../../src/modules/editor/Editor.ts):961. The descending sort and `replaceRange` loop now exist only inside the primitive.

### 2. The patch engine lives beside TextPatch

[TextPatchApplication.ts](../../../../src/modules/workspace/TextPatchApplication.ts):12 owns verified ordering, overlap detection, byte splicing, and final offset bookkeeping. Its editor conversion starts at [TextPatchApplication.ts](../../../../src/modules/workspace/TextPatchApplication.ts):57. Search calls this seam instead of owning patch math.

[TextPatch.ts](../../../../src/modules/workspace/TextPatch.ts):56 no longer has a validation-free constructor twin. It rejects negative offsets, context before the file, and context beyond the shared bound. Both construction paths meet at `createWithContext` in [TextPatch.ts](../../../../src/modules/workspace/TextPatch.ts):82.

`createRecorded` cannot compare removed bytes with a full source because recorded results do not carry that source. It now validates every fact available at that boundary. The acting boundary still verifies the complete source before mutation.

### 3. Search and replacement have separate state

[WorkspaceSearchWorkspace.ts](../../../../src/modules/search/WorkspaceSearchWorkspace.ts):105 owns search state. [WorkspaceSearchWorkspace.ts](../../../../src/modules/search/WorkspaceSearchWorkspace.ts):109 owns bulk replacement state. Their disjoint unions start at [WorkspaceSearchWorkspace.ts](../../../../src/modules/search/WorkspaceSearchWorkspace.ts):874 and [WorkspaceSearchWorkspace.ts](../../../../src/modules/search/WorkspaceSearchWorkspace.ts):877.

The replacement transition methods start at [WorkspaceSearchWorkspace.ts](../../../../src/modules/search/WorkspaceSearchWorkspace.ts):306. The dialog copy now calls named prototype methods. Those methods start at [WorkspaceSearchPaneContent.ts](../../../../src/modules/search/WorkspaceSearchPaneContent.ts):689.

The partial-failure test proves search state stays unchanged through apply, undo, and redo. Its assertions start at [WorkspaceSearchWorkspace.test.ts](../../../../src/modules/search/WorkspaceSearchWorkspace.test.ts):148.

### 4. One patch context bound

[WorkspaceSearchBackend.ts](../../../../src/modules/search/WorkspaceSearchBackend.ts):64 reads `TextPatch.Class.CONTEXT_BYTE_LENGTH`. The bare `64` context geometry is gone from the backend. The public patch bound lives at [TextPatch.ts](../../../../src/modules/workspace/TextPatch.ts):7.

### 5. The remaining copies have one home

- [ByteArrays.ts](../../../../src/modules/system/ByteArrays.ts):4 owns byte-array equality. Files, the arena, and workspace replacement all call it.
- [WorkspaceSearchWorkspace.ts](../../../../src/modules/search/WorkspaceSearchWorkspace.ts):514 owns the shared read and read-only prologue for classify and apply.
- [TextByteCoordinates.ts](../../../../src/modules/text/TextByteCoordinates.ts):45 owns the line-break scan. Its byte-position conversion starts at [TextByteCoordinates.ts](../../../../src/modules/text/TextByteCoordinates.ts):27.
- [Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts):523 owns the one `quitConfirmation` overlay call. The application surface publishes `confirm` at [ApplicationContributor.interface.ts](../../../../src/modules/app/ApplicationContributor.interface.ts):64.

The structural census found zero `bytesEqual` identifiers. It found one production `quitConfirmation` literal in Bootstrap, at the shared helper.

### 6. Pane and editor undo share the guard

[WorkspaceUndoCoordinator.ts](../../../../src/modules/workspace/WorkspaceUndoCoordinator.ts):125 finds the latest provider transaction. It then enters the same guarded request seam at [WorkspaceUndoCoordinator.ts](../../../../src/modules/workspace/WorkspaceUndoCoordinator.ts):142.

The pane Undo and Redo methods enter the coordinator at [WorkspaceSearchPaneContent.ts](../../../../src/modules/search/WorkspaceSearchPaneContent.ts):379 and [WorkspaceSearchPaneContent.ts](../../../../src/modules/search/WorkspaceSearchPaneContent.ts):396. Provider callbacks only show consent after the coordinator accepts the request. Their wire-up is at [WorkspaceSearchContributor.ts](../../../../src/modules/search/WorkspaceSearchContributor.ts):44.

The repeated button request check starts at [WorkspaceUndoCoordinator.test.ts](../../../../src/modules/workspace/WorkspaceUndoCoordinator.test.ts):82.

### 7. The ivue shape is restored

The dialog noun, location, title, label, action, and changed-item rules are prototype methods. They occupy [WorkspaceSearchPaneContent.ts](../../../../src/modules/search/WorkspaceSearchPaneContent.ts):689 through line 745.

[Workspace.ts](../../../../src/modules/workspace/Workspace.ts):104 starts the state block. Derived getters run from [Workspace.ts](../../../../src/modules/workspace/Workspace.ts):120 through line 210. Methods start at [Workspace.ts](../../../../src/modules/workspace/Workspace.ts):213. An AST comparison found no changed member bodies and no getter after a method.

[TextByteCoordinates.ts](../../../../src/modules/text/TextByteCoordinates.ts):7 owns the shared cached `TextEncoder`. The reviewed production path has no second encoder. Result ordering now uses `orderedResults`, `firstResult`, `secondResult`, `previousResult`, and `nextResult` at [WorkspaceSearchWorkspace.ts](../../../../src/modules/search/WorkspaceSearchWorkspace.ts):336.

## What changed for users

- Workspace Search freezes selected matches before consent. It verifies exact text and context again at the acting boundary.
- Apply, undo, and redo use one patch engine across open documents and closed files.
- Open files stay dirty and retain normal local undo order. Closed files use verified atomic disk replacement.
- Every bulk action uses the shared dialog. Counts, skips, drift, and failures remain visible.
- History keeps at most 20 complete transactions and 64 MiB of patch text.

## Invariants

The path and content scope includes [editor.invariants.md](../../../../src/modules/editor/editor.invariants.md), [search.invariants.md](../../../../src/modules/search/search.invariants.md), and [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md).

| Record | Verdict | Evidence |
| --- | --- | --- |
| [Undo records deltas not whole-document snapshots](../../../../src/modules/editor/editor.invariants.md#undo-records-deltas-not-whole-document-snapshots) | Strengthened | Open files use shared verified editor edits. History retains successful reverse patches only. |
| [Input overlays share one modal slot](../../../../src/modules/ui/ui.invariants.md#input-overlays-share-one-modal-slot) | Strengthened | All five confirmation callers now enter one application `confirm` seam. |
| [Search results are click-set and highlight-shown](../../../../src/modules/search/search.invariants.md#search-results-are-click-set-and-highlight-shown) | Untouched | The Quick Open result path did not change. |
| [The selected quick-open row is always visible](../../../../src/modules/search/search.invariants.md#the-selected-quick-open-row-is-always-visible) | Untouched | The Quick Open selection path did not change. |
| [Quick Open activates the selected entry](../../../../src/modules/search/search.invariants.md#quick-open-activates-the-selected-entry) | Untouched | The Quick Open activation path did not change. |
| [Exact basenames rank above fuzzy paths](../../../../src/modules/search/search.invariants.md#exact-basenames-rank-above-fuzzy-paths) | Untouched | Search ranking did not change. |
| [File enumeration failures stay visible](../../../../src/modules/search/search.invariants.md#file-enumeration-failures-stay-visible) | Untouched | Quick Open enumeration did not change. Workspace failures also stay visible. |
| [Find bar controls are mouse-clickable buttons](../../../../src/modules/search/search.invariants.md#find-bar-controls-are-mouse-clickable-buttons) | Upheld | The neighbor drive kept in-file controls clickable. Workspace controls share paint and hit ranges. |
| [Find options re-run the active query](../../../../src/modules/search/search.invariants.md#find-options-re-run-the-active-query) | Upheld | The final behavioral pass kept this path green. |
| [The open-project path input is a live directory navigator](../../../../src/modules/search/search.invariants.md#the-open-project-path-input-is-a-live-directory-navigator) | Untouched | The open-project path did not change. |
| [An un-openable open-project path is flagged live](../../../../src/modules/search/search.invariants.md#an-un-openable-open-project-path-is-flagged-live) | Untouched | The open-project error path did not change. |

The change also upholds [Cost tracks the actively observed set](../../../../project.invariants.md#cost-tracks-the-actively-observed-set). One 1 MiB file leaves 141 bytes in retained replacement history.

The four records in [design section 12](../../../../project-find-replace-design.md#12-proposed-invariant-records) remain proposals, as the task requires.

## Driven evidence

- I reran `bun scripts/harness/smoke-workspace-search-harness.ts` after the structural commit.
- At 10 lines, consent, cancel, apply, undo, and redo passed through real keys and clicks.
- At 100,000 lines, the same gestures passed. The final-line match restored exactly.
- Search state stayed `ready` while bulk state moved through `applied`, `undone`, and `applied`.
- Acting-boundary drift still skipped changed text. Repeated input still did not apply an action twice.
- Idle controls, wrong-file controls, selection, dismissal, unavailable search, and both scale searches also passed.
- The final `behavioral-contracts.sh` pass ran the same workspace-search contract again at both scales.

The drive process stopped cleanly. Its bounded scratch homes were removed by the harness.

## Positive controls

- I made byte equality always return true. The byte test expected `false` and received `true`.
- I removed patch ordering. The reversed patch test failed with `Verified text patches overlap.`
- I wrote `verifyingReplace` into search state. The split-state test expected `idle` and received `verifyingReplace`.
- I removed the coordinator pending guard. Repeated editor and pane requests both fired twice.
- Earlier task controls caught a zero applied count, offset-only context matching, a 1 MiB history snapshot, and a dialog bypass.

I removed every plant. The targeted tests then passed with 18 tests, 0 failures, and 96 expectations across four files.

## Verification

- `bun test`: 2,498 pass, 0 fail, 72,875 expectations, 385 files.
- `bunx tsc --noEmit`: pass.
- `bash scripts/conventions-gate.sh`: pass.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 1,428 annotations, 287 lattice links, 0 problems.
- `bun scripts/harness/smoke-workspace-search-harness.ts`: `ALL-PASS` at 10 and 100,000 lines.
- `bash scripts/behavioral-contracts.sh`: `ALL-PASS`.
- `git diff --cached --check`: pass before commit.
- `bun scripts/tasks/lint-task-links.ts <report>`: pass.
- STE report lint: 1.03 findings per 100 words.

## Bycatch

- The Search summary says `10 results in 1 files`. I saw it in the default 10-line flow and reproduced it more than once. I did not fix this grammar defect.
- [search.invariants.md](../../../../src/modules/search/search.invariants.md) names Quick Open, Find Bar, and open-project rules. It has no workspace replacement, consent, drift, or history records. [Design section 12](../../../../project-find-replace-design.md#12-proposed-invariant-records) has proposals, but no approved contract records. I did not promote them.

## Worktree

All task changes are committed through `f76d94ca63817eaf7d5039c74618e95ec4365830`. [AGENTS.md](../../../../AGENTS.md) remains modified because dispatch injected it. The untracked [BUILDER-FUNDAMENTALS.md](../../../../.invar/worktrees/536-workspace-replace-consent-history/BUILDER-FUNDAMENTALS.md) is also a dispatch artifact. I did not stage or change either file.
