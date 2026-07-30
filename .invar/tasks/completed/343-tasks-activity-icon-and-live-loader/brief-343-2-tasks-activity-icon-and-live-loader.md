# Brief #343 round 1 — tasks icon becomes a play glyph; LIVE rows get the watch spinner

codex auto-reads [AGENTS.md](../../../../AGENTS.md). Load the invariants skill for governed code.

## The task (user-directed, two visuals)

1. The tasks entry in the activity bar shows a gear. Change it to a play
   glyph or another glyph that reads as run/tasks, not settings. Check the
   glyph also renders in the ASCII glyph tier (glyphMode fallback).
2. In the tasks pane LIVE section: building/exploring rows show a number.
   Put the animated spinner beside the word, like "* building" where * is
   the SAME glyph cycle bun run tasks:watch uses. The reference generator
   is scripts/tasks/TasksWatchRenderer.ts — reference the shared frames,
   never copy them (seam rule).

## Method — drive first, contract last

1. Drive the real app: open the tasks pane with a LIVE row, see the gear
   and the bare number. Iterate drive -> change -> drive.
2. Idle-quiescence contract binds: the spinner may only animate while a
   LIVE row exists ([src/modules/tasks-dashboard/tasks-dashboard.invariants.md](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
   — dashboard motion exists only while observed). No live rows: no timer,
   frame counter at rest.
3. Contract assertions only AFTER the visuals are right. One verification
   pass at the end.

## Rules

- Do NOT run scripts/merge-gate.sh yourself and do NOT use SKIP_GATE.
  Commit normally; the hook runs the gate. A GATE_EXIT=0 chain in your
  final commit is part of DONE.
- Builders never push; the conductor lands.
- Known pre-existing red classes: panel-chrome Terminal-2-list-close
  (#214), structure-outline timeouts (#337). Name them if they bite; do
  not chase.

## Invariants in scope

- Dashboard motion exists only while observed —
  [src/modules/tasks-dashboard/tasks-dashboard.invariants.md](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md) — the spinner
  is new motion; it must obey idle quiescence.
- Any activity-bar / glyph-tier records found in scope-adjacent contracts.
  Answer record by record in the READY report: upheld / violated / needs
  refinement, plus records this list missed.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s bycatch taxonomy. Include a ## Bycatch section even
if it reads: None observed.

## Definition of done

READY report in this folder, standard naming (report prefix, number 343,
the task slug, md extension): glyph choice + ASCII-tier proof, spinner
driven evidence (frames advancing on LIVE, at rest when none), gate chain,
invariants answered, bycatch.
