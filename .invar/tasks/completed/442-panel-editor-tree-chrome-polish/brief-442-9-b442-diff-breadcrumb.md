# Brief 442-16 — the breadcrumb row belongs to the editor AREA

## In plain words

The git diff view has an empty row above it. The diff is showing a
file, so that row should say which file, the same way it does for a
normal file. The back and forward arrows live on that row too. One
row, one job, everywhere in the editor area.

## The change

The breadcrumb and history row is a property of the EDITOR AREA, not
of the text editor. Any view that occupies the editor area renders it:

- the text editor (today)
- the git diff view (the empty row above the diff today)
- the markdown preview
- any other editor-area view

Render the same row, in the same position, with the same parts: the
history cluster at the left, then the path of whatever is being
shown. A diff shows the path of the file being diffed.

Do NOT special-case each view. If the row is currently owned by the
text editor, lift it to the editor area shell and let views supply
the path. Name the seam in your report.

The history CONTROLS render here per the earlier items. Whether the
diff is a history ENTRY is a separate task; do not implement history
semantics in this one. The row only has to render.

## Invariants in scope

The editor-area and breadcrumb records in the ui module contracts.
Propose a record if none states it: the breadcrumb row belongs to the
editor area and every editor-area view supplies its path.

## Bycatch expected

Per the [AGENTS.md](../../../../AGENTS.md) taxonomy; `None observed`
is a valid section.
