# Task 503 — a task is a terminal pane with task metadata, not a pane kind

Priority: user-directed
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
State: IN-PROGRESS

## In plain words (user, verbatim intent)

"Task is task WITHIN terminal, not a PLUGIN." A declared task pane is
a terminal running a command. Its pane KIND must be terminal; the
task identity is metadata. Add a glyph on the tab saying it is a
task; clicking the glyph opens the workspace's .invar/tasks.json.

## The honest history

Bootstrap's task launch port has always set kind: request.identifier
(the task:<root>:N string) — the conflation predates the decoupling
wave (same line at fe0b9e48). Pre-#405 the panel FORCED unknown kinds
into the terminal space, masking it; #405 unmasked it (minted spaces,
#501), #502 patched restore. This task removes the false category so
that machinery cannot be needed again.

## The design

1. Bootstrap's launch port passes kind: 'terminal'; the task identity
   stays the pane IDENTIFIER (already task:<root>:N) plus explicit
   task metadata (label, source path) on the pane.
2. TaskLauncher reuse/dedup keys off the identifier as today; #502's
   restore liveness logic simplifies or dissolves (a terminal-kind
   pane with a task identifier restores like any terminal UNLESS its
   process is a declared task — decide and state the rule).
3. Tab affordance: a task glyph (theme-contributed, per the icon
   seams) on task panes' tabs; CLICK on the glyph opens
   .invar/tasks.json of the pane's workspace in the editor.
4. Settings migration: legacy saved panes with kind task:... load as
   terminal-kind with the identifier; #502's drop-dead-entries rule
   preserved in the new shape.
5. Census: 'task:' prefix disappears from panel-layer vocabulary
   (Bootstrap restorePane's startsWith('task:') special case should
   dissolve or move behind the tasks seam).

## Invariants in scope (candidates)

- Each task owns one terminal; Folder open starts declared tasks
  (tasks.invariants.md — the #502 refinement wording will need a
  follow-up refinement; propose it)
- Panel content order is one persisted sequence; A persisted pane
  identity is never reissued; restore-no-placeholder clause
  (ui.invariants.md)
- Pane identity is separate from presentation (ui.invariants.md) —
  this task makes it TRUE for tasks
