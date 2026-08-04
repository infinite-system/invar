# Brief 503-1 — a task is a terminal pane with task metadata, not a pane kind

## In plain words

Task panes carry their task identity in the pane KIND field, which
made the panel treat them as their own species (minted spaces, restore
special cases). Make their kind terminal, keep the identity as the
identifier plus metadata, add a task glyph on their tabs, and let a
click on the glyph open the workspace's .invar/tasks.json.

## Reproduce by DRIVING first

Warm fluent server (drive-pty skill; bun run drive is the alias).
Use a scratch workspace with a .invar/tasks.json declaring one
folderOpen task (copy the shape from [the task file](task-503-a-task-is-a-terminal-pane-not-a-kind.md)). Boot; SEE the
task tab; read panelContentKinds via the graph — today it carries the
task:<root>:N string. That is the defect made visible.

## The work (task file carries the full design; highlights)

1. Bootstrap launch port: kind 'terminal', identity via identifier +
   task metadata on the pane. The restorePane startsWith('task:')
   special case dissolves or moves behind the tasks seam.
2. #502's semantics survive in the new shape: a dead declared-task
   entry still does not restore as a zombie; state the new rule
   plainly (the liveness question may simplify to "declared tasks
   relaunch via TaskLauncher; their saved entries are dropped like
   today" — verify against smoke-tasks-harness and the #502 smoke arm).
3. Glyph: theme-contributed task icon on task panes' tabs; pointer
   click on the glyph cell opens .invar/tasks.json of that pane's
   workspace in the editor (real gesture, screen-derived cell).
4. Migration: legacy kind task:... in saved settings loads correctly;
   double-boot heal proven.
5. Ratchet: extend the existing #501/#502 smoke arm to assert
   panelContentKinds contains no task: strings, the glyph paints, and
   the glyph click opens tasks.json; positive controls as usual.

## Invariants in scope

- Each task owns one terminal; Folder open starts declared tasks
  ([src/modules/tasks/tasks.invariants.md](../../../../src/modules/tasks/tasks.invariants.md)) — propose the follow-up
  refinement of #502's wording to match the new shape.
- Pane identity is separate from presentation; Panel content order is
  one persisted sequence; A persisted pane identity is never
  reissued ([src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)).
Answer record by record; name misses.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy even when None observed.

## Instrument feedback

EASY / CONFUSING / MISSING; asks get converted.

## Rules

Never run scripts/merge-gate.sh; SKIP_GATE=1 commits; the conductor
gates and lands. NEVER write the user's real ~/.config.
