# Brief — #329: tasks:watch animation tick restored (60fps diff frames)

USER-DIRECTED regression fix. Read first:
[task-329-tasks-watch-animation-tick-restored.md](task-329-tasks-watch-animation-tick-restored.md)
— his verbatim words and the record's design GOVERN.

## Work discipline

- ONE COMMIT (`tasks-watch: <summary> (#329)`), full gate through the
  enforcing hook, NO SKIP_GATE product commits.
- #321 (f0a860bf) built the machinery you extend: TasksWatchRenderer
  emits DEC-2026-bracketed cursor-home row diffs on ledger data ticks.
  ADD the second tick source exactly per the record: 60fps animation
  tick advancing ONLY animated cells (building spinner on live rows),
  bytes-per-frame bounded, zero full clears; the timer IDLES with zero
  live animating rows (no wakeups at all).
- Skip-never-queue under load (lightest-streaming law from the media
  contract applies to this watcher).
- Acceptance per record, both polarities: spinner advances with NO
  data changes (raw capture, bounded diff frames); idle dashboard
  writes NOTHING (capture silence); #321's contracts stay green;
  planted frozen clock fails the advancing-spinner assert red.

## Invariants in scope

terminal contract (synchronized-output records), TasksWatchRenderer +
its tests, #214 census (note load behavior; do not retire classes).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy; `## Bycatch` even if
`None observed`.

## End state (mechanical)

READY report: captures quoted both arms, planted-clock red quoted,
commit hash, GATE_EXIT=0 through the hook. Conductor lands.
