# Brief — #291: task links survive state moves — the name is the identity, the state is a wildcard

Read first: [task-291-task-links-survive-state-moves.md](task-291-task-links-survive-state-moves.md)
— it holds all five arms with their user-set cost bounds. Summary only here;
the record governs.

Generator: task folders MOVE between `.invar/tasks/{active,in-progress,completed,retired}/`
but the folder NAME is stable for life. Every resolver that meets a
task-state path treats the state dir as a HINT and the name as the
identity. ONE structural predicate (path matches
`.invar/tasks/<state>/<task-folder>/...`) shared by every arm — do not
write four copies of the match.

Arms (the record details each):

1. **App link opener** (#276's walk): on miss under one state dir, retry
   the SAME `<name>/<file>` tail under the other three. Genuine miss
   keeps the stated-miss behavior.
2. **lint-task-links.ts**: moved-vs-dead distinction — moved is VALID +
   flagged + `--fix`-rewritable; dead stays red. Self-test arms:
   current (silent) / moved (flagged) / dead (red) / **dead src/ link
   NOT rescued** (the scope constraint's negative arm).
3. **Retro-sweep**: `--fix` across all records once, one sweep commit.
4. **`--fix --moved-only` at land + dispatch**: acted-on records ONLY,
   never a walk; measure — if >~100ms per invocation, drop the wiring
   and report the measurement instead. Must never touch bare references
   even when unambiguous.
5. **Preview paints dead links red** (both themes), cached per parse
   revision — no per-frame fs probing; live repair repaints normal
   (watcher revision). http(s) out of scope.

Convention lands in the manage-tasks skill: link by name; state dir in a
written path is a hint.

## Invariants in scope

#276's link-walk records; the lint-task-links self-test contract (#288);
markdown preview settled-frame records (arm 5 must not add per-paint fs
work).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if
it reads `None observed`.

## End state (mechanical)

READY report in the task folder: five arms driven with both polarities +
positive controls, the moved/dead/bare triage demonstrated on real
records, the land/dispatch wiring measured against the 100ms bound (or
dropped with numbers), preview red/normal repaint driven live, green
`bun test` + markdown/lint smokes. The conductor gates at landing.
