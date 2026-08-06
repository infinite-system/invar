# READY — workspace undo transaction core (#532)

## In plain words

A workspace replacement can now keep the exact text needed to reverse its changes without copying whole files. Editors keep only small labels that point to the shared transaction. Those labels stay correct when a file closes, detaches, or opens again.

## Outcome

READY at commit `4786ef3b`.

The work follows the [task brief](brief-532-1-workspace-undo-transaction-core.md). It adds the Milestone 2 data boundary only. It adds no Search UI or replacement policy.

## What changed

- [TextArena.ts](../../../../src/modules/workspace/TextArena.ts) stores UTF-8 bytes in fixed slabs. Repeated replacement bytes share one interned slice. Reads return defensive copies, so a caller cannot corrupt retained transaction text.
- [TextPatch.ts](../../../../src/modules/workspace/TextPatch.ts) stores removed text, inserted text, and both 64-byte contexts as arena slices. It checks exact offsets first. It relocates only one exact context and rejects zero or multiple candidates.
- [WorkspaceReplacementHistory.ts](../../../../src/modules/search/WorkspaceReplacementHistory.ts) keeps at most 20 transactions and 64 MiB of arena text. It plans complete-entry evictions before changing history. One oversized or impossible addition changes nothing.
- [UndoStore.ts](../../../../src/modules/storage/UndoStore.ts) now accepts opaque external references. A local undo request does not move an external reference. The workspace coordinator moves it only after the provider completes the action.
- [ExternalUndoHistory.interface.ts](../../../../src/modules/workspace/ExternalUndoHistory.interface.ts) gives editor views and the coordinator one shared reference-history seam.
- [WorkspaceUndoCoordinator.ts](../../../../src/modules/workspace/WorkspaceUndoCoordinator.ts) registers generic providers and transactions. It suppresses repeated pending requests. It restores chronological references when a document view reattaches.
- [Workspace.ts](../../../../src/modules/workspace/Workspace.ts) attaches and detaches editor histories at the existing document lifecycle boundary. It keeps the original language close order, so `didClose` still sees the live document.
- [check-unwired-capabilities.sh](../../../../scripts/check-unwired-capabilities.sh) names the three forward Milestone 2 data classes. Workspace replacement actions wire them in Milestone 5.

## Invariant review

Derived scope: editor undo, workspace document lifecycle, Search history, and the project cost and seam rules.

| Record | Verdict | Evidence |
| --- | --- | --- |
| [Undo records deltas not whole-document snapshots](../../../../src/modules/editor/editor.invariants.md#undo-records-deltas-not-whole-document-snapshots) | Strengthened | External editor entries copy only three identifiers. Patch text stays in one transaction arena. |
| [Document identity survives document instance replacement](../../../../src/modules/workspace/workspace.invariants.md#document-identity-survives-document-instance-replacement) | Strengthened | The coordinator rebinds still-live references by document path after detach, close, and reopen. |
| [One provider creates every workspace buffer view](../../../../src/modules/workspace/workspace.invariants.md#one-provider-creates-every-workspace-buffer-view) | Upheld | The existing buffer creator still makes every view. The lifecycle seam only attaches its external history capability. |
| [N open tabs do not cost N live documents](../../../../src/modules/workspace/workspace.invariants.md#n-open-tabs-do-not-cost-n-live-documents) | Upheld | Detached views retain no patch text. The coordinator owns only bounded reference metadata per transaction and document. |
| [Cost tracks the actively observed set](../../../../project.invariants.md#cost-tracks-the-actively-observed-set) | Strengthened | History has independent 20-transaction and 64-MiB bounds. Repeated replacement bytes are interned once. |
| [Seams are drawn at the shared generator](../../../../project.invariants.md#seams-are-drawn-at-the-shared-generator) | Strengthened | The coordinator knows providers and document identifiers. It does not know Search queries, replacement expansion, dialogs, or patch rules. |
| [Search results are click-set and highlight-shown](../../../../src/modules/search/search.invariants.md#search-results-are-click-set-and-highlight-shown) | Untouched | This task adds no result surface. |
| [The selected quick-open row is always visible](../../../../src/modules/search/search.invariants.md#the-selected-quick-open-row-is-always-visible) | Untouched | This task changes no Quick Open list. |
| [Quick Open activates the selected entry](../../../../src/modules/search/search.invariants.md#quick-open-activates-the-selected-entry) | Untouched | This task changes no activation route. |
| [Exact basenames rank above fuzzy paths](../../../../src/modules/search/search.invariants.md#exact-basenames-rank-above-fuzzy-paths) | Untouched | This task changes no ranking. |
| [File enumeration failures stay visible](../../../../src/modules/search/search.invariants.md#file-enumeration-failures-stay-visible) | Untouched | This task changes no enumeration. |
| [Find bar controls are mouse-clickable buttons](../../../../src/modules/search/search.invariants.md#find-bar-controls-are-mouse-clickable-buttons) | Untouched | This task adds no control. |
| [Find options re-run the active query](../../../../src/modules/search/search.invariants.md#find-options-re-run-the-active-query) | Untouched | This task changes no query option. |
| [The open-project path input is a live directory navigator](../../../../src/modules/search/search.invariants.md#the-open-project-path-input-is-a-live-directory-navigator) | Untouched | This task changes no path input. |
| [An un-openable open-project path is flagged live](../../../../src/modules/search/search.invariants.md#an-un-openable-open-project-path-is-flagged-live) | Untouched | This task changes no path warning. |

The four proposed replacement records in the [design](../../../../project-find-replace-design.md#12-proposed-invariant-records) remain proposals. I did not add them to the contract layer.

## Verification

### Real PTY drive

I drove the editor with default settings before and after the change.

- Small scale: the shared 10-line fixture. I typed `Z`, undid it, redid it, typed `Q` rapidly, then undid and redid the coalesced edit. I checked the painted line after every step. The diagnostic log had no errors.
- Large scale: the shared 100,000-line fixture. I used the same click, `End`, type, undo, and redo gestures. The graph still reported exactly 100,000 lines. The painted result and dirty state matched the small fixture.
- Nearby behavior: ordinary local undo and redo stayed visible and ordered. No new UI route exists yet for an external workspace reference.

### Adversarial state coverage

- Counts: zero-document registration rejects; one and many documents work; removing the last transaction returns to empty; the same identifier can enter again after removal.
- Order: applied references attach oldest to newest. Redo references attach in reverse stack order, so the oldest undone transaction redoes first.
- Interleaving: a local edit above an external reference must undo before the external request becomes reachable.
- Midflight: two rapid undo requests produce one provider request. Cancellation permits a fresh request.
- Lifecycle: tests name and check closed, open, detached, and reopened states. A real `Workspace` test dehydrates a view, closes it, opens the path again, and reaches the correct redo reference.
- Memory: repeated replacement text returns the same arena slice. A planted second arena throws. A planted extra patch-text field is stripped from the editor reference.

### Positive controls

I planted a verifier that ignored saved context. The focused run failed with `changed exact context drifts instead of trusting an unchanged subject`, receiving `exact` at byte 64 instead of `drifted`.

I also planted a history that ignored both bounds. The focused run failed three checks. The count case retained no eviction, and the impossible-fit case returned `accepted: true`. The planted run exited `1`. I removed both defects, and the same nine tests passed.

The committed tests also carry live known-bad values. A second patch-text arena throws `One workspace replacement transaction must use one text arena.` A second stored replacement location throws `Replacement bytes were stored more than once.`

### Final checks

- `bunx tsc --noEmit`: exit `0`.
- `bun test`: 2,455 passed, 0 failed, 72,655 expectations.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 1,405 annotations resolved, 287 lattice links resolved, 0 problems.
- `bash scripts/conventions-gate.sh`: PASS.
- `bash scripts/behavioral-contracts.sh`: `behavioral-contracts: ALL-PASS`, exit `0`.
- `git diff --cached --check`: clean before commit.

The first full test attempt exposed a real ordering regression in my draft. I detached the document before the language lifecycle sent `didClose`. The focused test timed out. I restored the original order, and all eight go-to-definition workspace tests passed before the full green run.

## Coherence

The change reduces variance. Editor views and the coordinator share [ExternalUndoHistory.interface.ts](../../../../src/modules/workspace/ExternalUndoHistory.interface.ts). The workspace host stays provider-neutral. Search keeps ownership of its patch arena and history.

## Bycatch

- CONTRACT DRIFT: [A structural line edit is one atomic undo step that keeps the cursor on the moved line](../../../../src/modules/editor/editor.invariants.md#a-structural-line-edit-is-one-atomic-undo-step-that-keeps-the-cursor-on-the-moved-line) still calls the current undo path “snapshot-based” and says `captureBefore` stores a snapshot. [UndoStore.ts](../../../../src/modules/storage/UndoStore.ts) and [Editor.ts](../../../../src/modules/editor/Editor.ts) now store localized deltas. Inspection reproduced the disagreement at both sites. I did not edit the contract because this task forbids adopting the proposed record set and the drift is outside its data-core scope.

No runtime UI bycatch appeared in the small or large drives.
