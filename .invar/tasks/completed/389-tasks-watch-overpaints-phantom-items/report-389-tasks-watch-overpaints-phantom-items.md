# READY — tasks watch overpaints phantom items

Commit: `87eaab00`
GATE_EXIT: `0`

## Result

Fixed the `tasks:watch` phantom-row repaint defect.

The model shrink was correct. The existing logical-row diff also cleared removed logical rows.
The defect came from terminal autowrap. A long ANSI-styled line could occupy extra physical rows,
but [TasksWatchRenderer.ts](../../../../scripts/tasks/TasksWatchRenderer.ts) tracked only its one
logical row. A later shrink could therefore leave the wrapped physical tail on screen.

The renderer now clips data and animation rows to the live terminal width before it compares or
paints them. It preserves ANSI controls and grapheme boundaries. It reads the controlling PTY width
when Bun reports zero columns, prefers that real width over an inherited `COLUMNS` value, and
refreshes the fallback on `SIGWINCH`. Hidden text changes do not cause a repaint.

## Driven evidence

The assertion-free
[shrink drive](389-tasks-watch-shrink-drive.ts) reproduced the defect at 60 columns. Before the
fix, a 3-to-1 shrink left a task-name fragment on row 13 and a footer fragment on row 15. The
model headline already said `IN-PROGRESS (1)`.

After the fix:

- The 3-to-1 drive left only the one task and its footer.
- The 100-to-1 drive left only seven nonblank physical rows. It cleared the former rows through
  row 305.
- The direct PTY arm in
  [smoke-terminal-harness.ts](../../../../scripts/harness/smoke-terminal-harness.ts) asserts that
  the painted task count equals the model count after shrink and that no wrapped physical tail
  remains.

Positive control: I removed data-row clipping. The unit contract failed with 1 failure, and the
direct PTY contract failed at `direct tasks:watch leaves no autowrapped physical tail after a
shrink` with exit 1. I restored clipping. Both contracts passed.

## Contract and invariants

- Refined
  [Child synchronized updates commit as one repaint](../../../../src/modules/terminal/terminal.invariants.md#child-synchronized-updates-commit-as-one-repaint)
  to require one physical terminal row per logical watch row.
- Upheld
  [The CLI lenses are the dashboard's one generator](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md#the-cli-lenses-are-the-dashboards-one-generator).
  The model readers did not change.
- Upheld
  [Cost tracks the actively observed set](../../../../project.invariants.md#cost-tracks-the-actively-observed-set).
  Data ticks clip their current rows once. Animation ticks clip only animation rows. The renderer
  still emits no unchanged row.

## Verification

- Small PTY drive, 3 tasks to 1: exit 0.
- Large PTY drive, 100 tasks to 1: exit 0.
- `bun test scripts/tasks/TasksWatchRenderer.test.ts`: 12 passed, 0 failed.
- `bun scripts/harness/smoke-terminal-harness.ts`: `ALL-PASS`.
- Full pre-commit merge gate: `GATE_EXIT=0`.
- Worktree is clean.

## Bycatch

- [Scrollbar harness](../../../../scripts/harness/smoke-scrollbars-harness.ts):
  the final full gate timed out once in the parallel pool and passed its one quiet retry. It did
  not reproduce on the second attempt. The gate classified the first result as a starvation-class
  flake and recorded it in the retry tally. Not fixed in this task.
