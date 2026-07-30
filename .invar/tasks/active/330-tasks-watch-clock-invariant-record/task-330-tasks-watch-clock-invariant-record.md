# 330 — tasks:watch clock and frame policy have no invariant record

State: active
Priority: architecture-hygiene
Engine: codex
Model: 5.6-sol
Effort: low
Provenance: BYCATCH of #329 (tasks:watch animation tick restored), 2026-07-30

## Gap

`scripts/tasks/` owns the watcher's two-clock design after #329 landed
(cf2104e3), but no local invariant record states it. The builder's exact
finding, from
[report-329](../../completed/329-tasks-watch-animation-tick-restored/report-329-tasks-watch-animation-tick-restored.md):

- Two clocks: a two-second data clock (ledger reads, changed data rows)
  and one absolute 60 FPS motion clock (animated live rows only).
- The motion clock owns ONE timer; a delayed callback computes the
  absolute frame, skips missed frames, schedules only the next deadline.
- No animated row => timer cancelled, zero idle writes.
- Each motion write is one matched DEC 2026 bracket; never a full clear,
  never a re-entry into the alternate screen (keeps the terminal
  synchronized-output contract from #321).
- Frame work depends on animated-row count, not dashboard length
  (proven at row 100,000, frame < 64 bytes).

Neither [tasks.invariants.md](../../../../src/modules/tasks/tasks.invariants.md)
nor
[tasks-dashboard.invariants.md](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
states the watcher clock, bounded-row frame, or idle-timer rules.

## Work

Author the record (location per convention: with its domain — decide
`scripts/tasks/tasks-watch.invariants.md` or fold into the tasks module
record), following the /invariants schema. Annotate the upholding sites
in `TasksWatchRenderer.ts` / `tasks-status.ts`. The #329 capture probe
and renderer test are the evidence channels; checker must stay at zero
problems.
