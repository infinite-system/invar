## In plain words

Replace All changed the file without giving undo the removed text. I moved every replacement through the editor's normal edit and undo path. One confirmed undo now restores the full file, and one confirmed redo applies the change again.

## Result

The work is ready in commit `7b3572a719113989f356812fe7ec06b87580341d` (`Repair in-file Replace All undo`). I did not push, merge, or run the merge gate.

Replace All now prepares exact edits in [FindInBuffer.ts](../../../../src/modules/search/FindInBuffer.ts). [Editor.ts](../../../../src/modules/editor/Editor.ts) verifies and applies those edits from the file end to its start. The editor records all line deltas in one undo state.

The Find bar now shows `Aa`, `ab`, and `.*`. `Alt+C`, `Alt+W`, and `Alt+R` use the same option methods as the buttons. Each option reruns the current query at once.

Replace All, its undo, and its redo now use the shared [Dialog.ts](../../../../src/modules/ui/Dialog.ts) model and [OverlayLayer.ts](../../../../src/modules/ui/OverlayLayer.ts) painter. Each dialog has exact counted copy, safe initial focus, one-key button padding, Escape cancellation, selection, and host copy.

## Main changes

- [FindInBuffer.ts](../../../../src/modules/search/FindInBuffer.ts) returns exact `TextEdit` values. It no longer changes a document.
- [SourceTextView.interface.ts](../../../../src/modules/workspace/SourceTextView.interface.ts) exposes one batch-edit operation and the next undo or redo metadata.
- [Editor.ts](../../../../src/modules/editor/Editor.ts) verifies expected text, applies safe edits in reverse order, and records one delta undo step.
- [UndoStore.ts](../../../../src/modules/storage/UndoStore.ts) keeps the bulk item count, label, and display path with the undo state.
- [FindBar.ts](../../../../src/modules/search/FindBar.ts) owns the `verifying`, `awaitingConsent`, `applying`, and `ready` flow states.
- [Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts) routes keyboard shortcuts and Command Palette undo or redo through the same consent controller.
- [FindBarRenderer.ts](../../../../src/modules/ui/FindBarRenderer.ts) paints all three option buttons from one button geometry.
- [smoke-search-mouse-harness.ts](../../../../scripts/harness/smoke-search-mouse-harness.ts) now locks the mouse, dialog, undo, redo, dirty-marker, and neighbor behavior.

## Driven verification

I first drove the old build against a four-match file. Replace All changed all four matches. `Ctrl+Z` did nothing because the old path bypassed the editor's delta capture.

I drove the fixed build against `/tmp/521-replace-all-drive-hyEOXO/replace-all-small.txt`. The task-owned fixture is now in the desktop trash.

- A four-match Replace All showed the counted dialog and safe `Cancel` focus.
- Escape closed the dialog and left all four matches unchanged.
- Confirmation replaced the exact four matches.
- The first `Ctrl+Z` showed `Undo Replace All`. Cancel left the replacement intact.
- A second `Ctrl+Z`, followed by confirmation, restored every original line.
- `Ctrl+Y`, followed by confirmation, restored every replacement.
- The dirty marker became true after replace, false after undo, and true after redo.
- A zero-match Replace All opened no dialog and returned the flow to `ready`.
- Two fast Replace All clicks left one consent dialog and one `awaitingConsent` state.
- Find Next still advanced the selected match and the painted counter.
- Mouse clicks and `Alt+C`, `Alt+W`, and `Alt+R` changed the same live option states.
- Dragging through dialog text selected `Replace`. `Ctrl+C` copied 7 characters through OSC 52.

I also drove the shared 100,000-line fixture with `bun run drive -- --serve --size 100000`.

- The query matched only `DRIVE-LINE-100000` on the last line.
- Replace All changed that line to `LAST content at scale 100000`.
- One confirmed undo restored the exact original last line.
- One confirmed redo restored the exact replacement.
- The first visible line stayed at `99948`.
- The selection stayed at line `99999`, column `0`.

The target verifies every edit's expected text at the acting boundary. A focused test changes one expected value before apply and confirms that the stale edit stays unchanged. The modal blocks user editing, and in-file apply runs synchronously after consent. I did not invent a drift-warning dialog because [section 6 of the design](../../../../project-find-replace-design.md#6-shared-dialog-family-and-exact-copy) defines no in-file drift copy.

## Positive controls

I removed the batch `captureBefore` call and ran the focused editor test. It failed because `nextUndoMetadata` was `null`. I restored the call and the test passed.

I changed the dialog's initial focus from `Cancel` to `Replace`. The PTY smoke timed out on `Replace All waits in the shared dialog with safe focus`. I restored safe focus and the smoke passed.

The new smoke also exposed a pre-satisfied `Ctrl+H` wait and a mouse-release race. I made the wait observe replace mode and moved Find actions to mouse release. These changes are part of the touched Find contract.

## Final checks

- `bun test src/modules/search/FindInBuffer.test.ts src/modules/search/FindBar.test.ts src/modules/editor/Editor.test.ts src/modules/ui/FindBarRenderer.test.ts src/modules/ui/Dialog.test.ts src/modules/ui/OverlayLayer.test.ts src/modules/ui/OverlayDialogGeometry.test.ts`: 54 pass, 0 fail.
- `bunx tsc --noEmit`: exit 0.
- `bun run build`: exit 0.
- `bun scripts/harness/smoke-search-mouse-harness.ts`: `ALL-PASS`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all`: exit 0 across 42 record files.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs`: 1,395 annotations and 287 lattice links resolved, 0 problems.
- `bash scripts/conventions-gate.sh`: `PASS`.
- `git diff HEAD^ HEAD --check`: exit 0.

I did not run `behavioral-contracts.sh` during iteration or the full merge gate. The conductor owns that final combined pass.

## Invariant evaluation

[Undo records deltas not whole-document snapshots](../../../../src/modules/editor/editor.invariants.md#undo-records-deltas-not-whole-document-snapshots) was violated before this task. The new editor batch seam repairs it. The positive control proves the focused test sees a missing undo record.

I reviewed every record in [search.invariants.md](../../../../src/modules/search/search.invariants.md):

- `Search results are click-set and highlight-shown`: untouched.
- `The selected quick-open row is always visible`: untouched.
- `Quick Open activates the selected entry`: upheld by the neighbor section of the PTY smoke.
- `Exact basenames rank above fuzzy paths`: untouched.
- `File enumeration failures stay visible`: untouched.
- `Find bar controls are mouse-clickable buttons`: strengthened for `ab`, `.*`, consent, undo, and redo. The verification now uses the PTY harness.
- `Find options re-run the active query`: refined from the case-only record. It now covers case, whole-word, and regex through mouse and keyboard paths.
- `The open-project path input is a live directory navigator`: upheld by the neighbor section of the PTY smoke.
- `An un-openable open-project path is flagged live`: upheld by the neighbor section of the PTY smoke.

The change also upholds these existing records:

- [Editable text fields share one input model](../../../../project.invariants.md#editable-text-fields-share-one-input-model). The two Find fields still use the shared input model.
- [Seams are drawn at the shared generator](../../../../project.invariants.md#seams-are-drawn-at-the-shared-generator). Mouse and keyboard actions converge on one Find or consent method.
- [Input overlays share one modal slot](../../../../src/modules/ui/ui.invariants.md#input-overlays-share-one-modal-slot). All three consent paths use the existing dialog slot.
- [A scrollable text surface is drag-selectable with edge auto-scroll](../../../../src/modules/ui/ui.invariants.md#a-scrollable-text-surface-is-drag-selectable-with-edge-auto-scroll). Dialog details use the shared viewport and selection behavior.
- [Copy reaches the host terminal](../../../../src/modules/system/system.invariants.md#copy-reaches-the-host-terminal). Dialog copy uses the shared clipboard authority.

I did not add the four proposed records from [section 12 of the design](../../../../project-find-replace-design.md#12-proposed-invariant-records). The brief says they are not law.

## Instrument feedback

EASY: The warm Drive session made repeated consent, undo, redo, and scale checks quick. Published flow and dialog fields gave false-before-true waits. Screen probes still checked the painted buttons and copy.

MISSING: `HarnessInput` rejects a modified Enter chord such as `Control+Shift+Enter`. I drove Replace All through its visible button instead. A primitive modified-key API would let the same instrument reach this existing shortcut.

## Bycatch

- Name drift: the shared dialog model and overlay slot are still named `quitConfirmation` in [Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts), [RootView.ts](../../../../src/modules/ui/RootView.ts), and [OverlayLayer.ts](../../../../src/modules/ui/OverlayLayer.ts). They now serve quit, Replace All, undo, and redo. I did not start a rename sweep in this task.
- Contract gap: no current search record governs in-file bulk consent, undo, redo, or stale-edit reporting. The design proposes a broader bulk record, but the brief forbids adding it without user approval.
- No other runtime bycatch reproduced.

## Ready state

Commit `7b3572a719113989f356812fe7ec06b87580341d` contains all task changes. I did not stage or change the dispatcher-owned files below.

```text
 M AGENTS.md
?? BUILDER-FUNDAMENTALS.md
```
