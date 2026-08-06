# 521 — repair in-file Replace All undo

Priority: user-directed
State: COMPLETED — 2b633367 — Replace All undo repaired through the editor delta path with consent dialogs, toggles, and scale-parity drives; Find/Replace milestone 1 complete.
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## In plain words

Replace All inside a file changes the text but the editor cannot undo it.
Fix Replace All so one undo step restores the file. Also add the missing
whole-word and regex toggles and the proper dialogs.

## Evidence (from #515 research, reproduced twice)

- `FindInBuffer.replaceAll` calls `TextDocument.replaceAll` directly. That
  method does not emit the line change event that feeds `UndoStore`. The
  nearby comment claims one undo step is captured — comment drift.
- Violates the record "Undo records deltas not whole-document snapshots"
  (src/modules/editor/editor.invariants.md).

## Source of truth

project-find-replace-design.md, Milestone 1 (section 13) + sections 5, 6,
9, 14. This is Milestone 1 of the Find/Replace build order; the design doc
is the specification. Scope per the milestone list:
- Make `FindInBuffer` return text edits instead of mutating documents.
- Add the target batch-edit seam.
- Record one delta-based undo step.
- Add visible whole-word and regex toggles.
- Add in-file bulk replace, undo, and redo dialogs (ui-design chapters).
- Drive one small file and the shared 100,000-line fixture.
