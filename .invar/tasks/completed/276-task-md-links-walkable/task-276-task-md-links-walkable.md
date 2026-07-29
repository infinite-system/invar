# 276 — project.active-tasks.md and task files link into the task records, walkable by click

State: COMPLETED — 173daff9 — task views link to records; md links walk by click with jump ends
Created: 2026-07-29
Engine: claude
Environment: linux
Model: fable-5
Effort: medium
Priority: USER-DIRECTED (2026-07-29 09:0x)

## Outline

User: "project.active-tasks.md and other task.md should link via md system
to the tasks and be walkable via click."

Two ends, one seam:

1. **The generated views emit links.** `tasks-status.ts write-active`
   generates `project.active-tasks.md` / `project.tasks-completed.md`;
   each task line gains a real markdown link to its
   `.invar/tasks/<state>/<name>/task-<name>.md` (relative paths so they
   survive the repo moving). The generator is the ONE place to add this —
   never hand-edit the views.
2. **Markdown links are walkable in Invar.** Whatever the markdown
   preview/editor already does with links, clicking a RELATIVE .md link
   must open that file in a tab (the workspace open seam #235 used:
   `workspace.openFileInTab`). If link-click support does not exist yet in
   the preview, THAT is the real deliverable — scoped to local relative
   file links (no browser, no http in this task; state what http links do:
   nothing silently is not acceptable — a stated no-op or copy is).
   From a task-<n>.md, links to briefs/reports in the same folder walk the
   same way. Check both directions: view → task file → report → back via
   Back/Forward jumps (#35's jump convention).

Verify by driving: open project.active-tasks.md, click a task link, land
in the record, click a report link, jump Back. Positive control: a link to
a missing file states the miss (never silent).

## Invariants in scope

- markdown.invariants.md (link handling — likely a NEW record); the
  tasks-status generator's view records; the workspace open seam record;
  the jump records.

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- User message 2026-07-29 09:0x; #235's open-seam usage.
