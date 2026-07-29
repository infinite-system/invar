# 235 — a tasks dashboard pane: live / active / done, cycling overview, linked to the records

State: ACTIVE
Created: 2026-07-29
Engine: claude
Environment: linux
Model: fable-5
Effort: medium
Priority: user-directed
Assignment note: User roadmap 2026-07-29 ("add tasks module right after the structure module"). Strictly after #35 lands — it consumes the proven contributor seam.

## Outline

The task system becomes visible inside Invar: a dashboard pane showing what
`bun run tasks:live / tasks:active / tasks:done` show in the terminal —
in-app, as a contributor.

User's shape, verbatim intent:
- Tabs (or sections) for LIVE, ACTIVE, DONE — the three lenses.
- An optional CYCLING overview: rotate through the views on an interval for a
  glanceable wall display, with play/pause.
- Each task LINKS to its md files — selecting a task opens its
  `task-<n>-<slug>.md` (and from there the folder's briefs/reports) in the
  editor. Reading is the new writing.

Structure notes:
- The data generator already exists: `scripts/tasks/tasks-status.ts` reads the
  folders deterministically. The pane must share that generator, not re-parse
  (convention 2) — likely by importing its exported readers, not by shelling
  out.
- This is a dock contributor like #35's structure pane: manifest, uninstall
  symmetry with the reinstall arm, degrade honestly when `.invar/tasks/` is
  absent (not every workspace has one — say so, never blank).
- Durations and agent identity render as the lenses do (meta.json is the
  source).

## Invariants in scope

- *The editor column's default occupant is a contribution* — read-only
  precedent (you are a dock contributor).
- *A pane content projects through exactly one surface*.
- Expect to AUTHOR `src/modules/tasks-dashboard/…invariants.md` (or extend the
  existing tasks module's record — decide against the seam rule and say why).

## Bycatch expected

Per AGENTS.md's taxonomy, all seven categories. The READY report carries
`## Bycatch` even if it reads `None observed`.

## Sources

- User goal message 2026-07-29 (~02:1x), verbatim in the session; briefing
  entry of the same time.
- `scripts/tasks/tasks-status.ts` — the shared generator.

### Reactive refinement (user, 2026-07-29 ~02:2x)

Motion semantics, decided for the CLI watch and binding here too: the spinner
belongs to WORK IN MOTION only — building tasks spin (one glyph per task, not
per line), READY tasks hold STILL (stillness = a report waits for the
conductor). Active-duration updates reactively every minute while a task
runs. The CLI prototype is `bun run tasks:watch` (2s redraw, braille frames);
the pane does it natively through ivue reactivity instead of redraw polling.
