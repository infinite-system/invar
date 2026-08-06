# Brief 521-1 — repair in-file Replace All undo (Find/Replace milestone 1)

## In plain words

Replace All inside a file changes the text, but pressing undo cannot bring
the old text back. Fix it so one undo restores everything. Add the missing
whole-word and regex switches and proper dialogs while you are in there.

## Source of truth

[project-find-replace-design.md](../../../../project-find-replace-design.md)
is the landed specification. This task is its Milestone 1 (section 13).
Read sections 5 (in-file surface), 6 (dialog family and exact copy),
9 (open-buffer undo coherence), 13 (milestone list), and 14 (verification
matrix) before any code. Follow the ui-design doctrine
([.claude/skills/ui-design/SKILL.md](../../../../.claude/skills/ui-design/SKILL.md) — in your fundamentals) for the
dialogs, buttons, and text inputs.

## The defect (reproduced twice by #515)

[FindInBuffer.replaceAll](../../../../src/modules/search/FindInBuffer.ts)
calls `TextDocument.replaceAll` directly; that method does not emit the
line change event that feeds `UndoStore`. The nearby comment claims one
undo step is captured — comment drift, fix it too. This violates the
record "Undo records deltas not whole-document snapshots" in
[editor.invariants.md](../../../../src/modules/editor/editor.invariants.md).

## Scope (Milestone 1 verbatim)

- Make `FindInBuffer` return text edits instead of mutating documents.
- Add the target batch-edit seam.
- Record one delta-based undo step.
- Add visible whole-word and regex toggles.
- Add in-file bulk replace, undo, and redo dialogs per section 6 copy.
- Drive one small file and the shared 100,000-line fixture.

## End state

Replace All then one undo restores the exact prior buffer, driven and
asserted at both scales. Redo re-applies. The toggles work and are
visible. Dialogs follow the doctrine (1-key padding, Escape, safe focus).

## The bar

DRIVE ADVERSARIALLY per your fundamentals: reproduce the undo defect by
driving BEFORE any code; iterate drive-change-drive; write contracts only
after the symptom is gone; test the surroundings (find-next, selection,
scroll position, dirty markers, file-changed-midflight warning) and leave
the design more coherent than you found it. Both polarities on every new
assertion.

## Invariants in scope

- "Undo records deltas not whole-document snapshots" —
  [editor.invariants.md](../../../../src/modules/editor/editor.invariants.md) —
  the violated record this task repairs.
- Any search-module records in
  [search.invariants.md](../../../../src/modules/search/search.invariants.md)
  if present — answer record by record.
- The four proposed records in the design doc's section 12 are NOT law
  yet — do not write them into contracts; the user confirms them.

## Bycatch expected

Report per the taxonomy in [AGENTS.md](../../../../AGENTS.md), even when
None observed.
