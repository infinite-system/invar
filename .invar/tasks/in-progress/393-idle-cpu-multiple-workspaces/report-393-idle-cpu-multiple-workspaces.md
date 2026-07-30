# READY #393 — idle CPU with multiple workspaces

Commit: `417084fa056f1aee8430bec59ba61adde112a770`

GATE_EXIT: 1

## Outcome

The tasks dashboard now observes the exact content that the side-dock painter
projects. A collapsed dock, another active tab, and another active workspace
stop both dashboard timers and all data work.

The visible data cycle now scales with painted task rows. It uses a
constant-cost state-directory stamp, mtime guards for painted records and
worktrees, one rotating painted-row freshness audit, one session-list read,
and changed-row replacement. It no longer reads every task folder or rebuilds
the full row set on each cycle.

The branch includes the current-main merge at `fc7ff76b` and the final change
at `417084fa`.

## Monitoring readings

The task-local
[painted-cost measurement](393-dashboard-painted-cost-measurement.ts) drove a
real PTY over 250 in-progress task folders. Six painted folders had dirty Git
worktrees. Monitoring stayed painted in the left dock while Tasks used the
right dock. Each value is the mean of three one-second Monitoring samples.

| Revision and arm | Monitor reading | Monitor-only baseline | Dashboard cost |
| --- | ---: | ---: | ---: |
| Before, `fc7ff76b`, Tasks painted | 4.95% | 2.55% | 2.40 points |
| After, `417084fa`, Tasks painted | 2.81% | 2.74% | 0.07 points |

The after reading is in the low single digits before subtraction and near
zero after subtracting the monitor's own cost.

Every after hide arm reported `tasksDataHeartbeatAtRest=true` and zero data
ticks, task-tree reads, fleet probes, session probes, and row rebuilds:

- another right-dock tab painted;
- the right dock collapsed; and
- another workspace became active.

The Monitoring plugin exposes the data-heartbeat state through the Tasks
status projection. No missing Monitoring reading blocked this task.

## Contracts

The
[tasks dashboard PTY smoke](../../../../scripts/harness/smoke-tasks-dashboard-harness.ts)
now checks both timers at boot, dock collapse, and tab replacement. Its
500-folder fixture records three steady visible ticks. Those ticks performed
zero task-tree reads, two fleet probes, two session-list reads, and zero row
rebuilds across 30 painted rows. A planted 500-row scan fails the same bound.

The
[workspace layout isolation smoke](../../../../scripts/harness/smoke-workspace-layout-isolation-harness.ts)
now checks that switching away from a workspace whose Tasks pane was painted
leaves the dashboard data heartbeat at rest.

[Dashboard motion exists only while observed](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
now defines observed as painted and records the painted-window cost bound.
[Cost tracks the actively observed set](../../../../project.invariants.md)
now covers pane timers and visible cadence work.

## Verification

- Targeted module tests: 126 passed, 0 failed.
- Tasks dashboard PTY smoke: PASS, including the positive control and
  500-folder scale arm.
- Workspace layout isolation PTY smoke: PASS.
- Invariant checker: 1,286 annotations and 231 lattice links resolved, 0
  problems.
- Type check: PASS.
- Full pre-commit gate: `GATE_EXIT=1`.

The one full gate passed conventions, formatting, invariant checks, coverage,
2,089 unit tests, the binary build, 65 of 66 parallel PTY jobs, all three
serial jobs, and the input-byte first-frame gate. The unrelated
`smoke-workspace-tabs-harness` timed out while waiting for retained workspace
sessions. Its permitted quiet retry failed at the same wait. Both logs are in
`/tmp/merge-gate-failures.4cf13740dfdb3756.3819427`. I did not rerun the full
gate. I committed with `SKIP_GATE=1` after recording the red, as the work
order required a commit before READY.

The worktree is clean.

## Bycatch

- The workspace-tabs smoke timed out twice at
  `the retained workspace sessions settle in the selected panel world`.
  This was the only full-gate failure. The changed dashboard and workspace
  isolation smokes passed in that gate.
