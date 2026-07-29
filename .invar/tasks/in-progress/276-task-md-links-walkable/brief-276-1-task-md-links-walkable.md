# Brief — #276: task views emit md links; links are walkable by click (user-directed)

Read first: `.invar/tasks/in-progress/276-task-md-links-walkable/task-276-*.md`.

Two ends, one seam:

1. **Generator end.** `tasks-status.ts write-active` gains relative
   markdown links on every task line in `project.active-tasks.md` /
   `project.tasks-completed.md` → `.invar/tasks/<state>/<name>/task-<name>.md`.
   ONLY in the generator — the views are never hand-edited. The exported
   readers just landed (#235); extend at the same seam.
2. **Walkability end.** Clicking a RELATIVE .md link in the markdown
   preview opens that file in a tab (workspace open seam:
   `workspace.openFileInTab` + focus — #235's pattern). If the preview has
   no link-click support yet, THAT is the deliverable, scoped to local
   relative file links. http(s) links: a STATED no-op or copy-to-status —
   silent nothing is not acceptable. A link to a missing file states the
   miss. Both jump ends recorded for Back/Forward (#35's convention).
   From a task file, links to briefs/reports in the same folder walk too.

Verify by DRIVING the loop: open project.active-tasks.md → click a task →
land in the record → click its report link → jump Back twice to the view.
Positive controls: missing-target link shows the stated miss; the
generator arm — regenerate and diff shows links for every task line (both
polarities: a task line without a link fails the check).

Real defaults throughout (preview left + auto-open, structure right):
measure panes, use the pane-scoped text helpers from #238/#268.

## Invariants in scope

- markdown.invariants.md — likely a NEW link-handling record; the
  tasks-status view generation records; the workspace open seam record;
  the jump records.

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## End state (mechanical)

READY report: the driven loop with evidence, both positive controls
quoted, the new record(s), green `bun test` + markdown/tasks smokes. The
conductor gates at landing.
