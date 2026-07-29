# Brief — #235: the tasks dashboard pane — live / active / done, linked to the records

Read first: `.invar/tasks/in-progress/235-tasks-dashboard-pane-live-active-done/task-235-*.md`
— it carries the user's verbatim shape and the seam law. Honor it exactly.

The one-paragraph version: make the task system visible inside Invar as a
dock contributor. Three lenses (LIVE / ACTIVE / DONE) matching
`bun run tasks:live|active|done`; an optional cycling overview with
play/pause; every task row opens its `task-<n>-<slug>.md` in the editor on
selection. THE CLI LENSES ARE THE PRIMITIVE: import the exported readers
from `scripts/tasks/tasks-status.ts` — re-implementing any reader is the
named seam failure. Add only what a pane can do that a terminal cannot:
ivue reactivity (no redraw polling), selection, opening files.

Landscape that changed since the task was filed (all landed, read them):
- #35's structure pane proved the contributor seam you consume; #238 made
  the right dock default-visible with `structureShowByDefault` — study how
  it registers, docks right, and how its smoke arms are built.
- The watch's motion semantics are decided and live in tasks-status.ts:
  spinner = work in motion only, READY holds still, durations tick
  per-minute, gradient vocabulary (building teal, exploring white→navy,
  gate gold). Reuse the vocabulary; the pane renders natively, not by
  embedding the PTY widget (the user named the PTY embed as an interim
  only — if the native pane lands, the interim is unnecessary).
- Degrade honestly when `.invar/tasks/` is absent: say so, never blank.

Uninstall symmetry with the reinstall arm, per the manifest smoke
convention. Smokes must hold under the app's REAL defaults (structure pane
right, markdown preview left where applicable) — measure panes, never
assume full width; `HarnessSnapshot.findEditorText` / pane-scoped helpers
from #238 are the pattern.

## Invariants in scope

- "The editor column's default occupant is a contribution" (read-only
  precedent); "A pane content projects through exactly one surface";
  AUTHOR `src/modules/tasks-dashboard/...invariants.md` (or extend the
  tasks module's record — decide against the seam rule and say why).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy, all seven categories. The READY report carries
`## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report in the task folder: the contributor registered + manifest
smoke arms (install/uninstall/reinstall), the three lenses driven with the
real `.invar/tasks` tree AND the absent-tree degrade, selection opening
the md file (driven), green `bun test` + touched smokes. The conductor
gates at landing.
