# READY #393 — idle CPU with multiple workspaces

Commits:

- `417084fa056f1aee8430bec59ba61adde112a770` — painted dashboard cost
- `fdfd25854357f2f122cc31aeb7ad3338c3ca287b` — reachable idle contract and per-plugin readings

GATE_EXIT: 0

## Outcome

The tasks dashboard observes the exact content that the side-dock painter
projects. A collapsed dock, another active tab, and another active workspace
stop both dashboard timers and all dashboard data work.

The visible data cycle scales with painted task rows. It uses constant-cost
state-directory stamps, mtime guards, one rotating painted-row freshness
audit, one session-list read, and changed-row replacement. It no longer reads
every task folder or rebuilds every row on each cycle.

The expected live win is 3–7%, not the earlier 30–42% attribution. The user
measured the LSP at 0%. Closing a terminal pane that streamed the busy #393
builder removed most of the 42% reading. Streaming terminal work and a hidden
dashboard heartbeat are separate generators.

## Monitoring readings

The task-local
[painted-cost measurement](393-dashboard-painted-cost-measurement.ts) drove a
real PTY over 250 in-progress task folders. Six painted folders had dirty Git
worktrees. Monitoring stayed painted in the left dock while Tasks used the
right dock. Each processor value is the mean of three one-second Monitoring
samples.

| Arm | Processor | Tasks renders | Terminal renders | Monitor renders | Dashboard work |
| --- | ---: | ---: | ---: | ---: | --- |
| Monitor only | 3.08% | 0 | 0 | 3 | all counters zero |
| Tasks painted | 3.04% | 0 | 0 | 3 | 3 ticks, 2 fleet probes, 2 session probes |
| Tasks behind another tab | 2.82% | 0 | 0 | 3 | all counters zero |
| Right dock collapsed | 2.49% | 0 | 0 | 3 | all counters zero |
| Another workspace active | 2.23% | 0 | 0 | 3 | all counters zero |

The visible dashboard result is within measurement noise of the monitor-only
baseline: -0.04 percentage points in this run. Its heartbeat raised zero
render requests. The fixture had no streaming terminal, and Terminal raised
zero render requests. Monitoring raised exactly its own three cadence
requests in every arm. The status projection now publishes the live
per-plugin attribution map, so a streaming Terminal cannot be charged to the
Tasks heartbeat.

For the same synthetic fixture before the fix, `fc7ff76b` measured 4.95%
with Tasks painted against a 2.55% monitor-only baseline, or 2.40 points.
That comparison does not replace the user's five-workspace evidence. The
user's 3–7% idle floor is the correct expectation for the hidden-pane win.

Every hidden arm reported `tasksDataHeartbeatAtRest=true` and zero heartbeat
ticks, task-tree reads, fleet probes, session probes, row rebuilds, and Tasks
render requests.

## Workspace-tabs diagnosis

The unreachable-wait hypothesis held. Runtime settle behavior did not
regress.

The terminal restored, painted its retained scrollback, and published the
selected panel world. Merge resolution had then placed a newer `Control+J`
close step before the older idle assertion. The close published
`panelVisible=false`. The following wait required `panelVisible=true`, so no
publisher could satisfy it.

The idle assertion now runs while the restored panel is still painted, as it
did when introduced. The existing close gesture follows it before the
language-feature arm. No timeout changed. The
[workspace-tabs PTY smoke](../../../../scripts/harness/smoke-workspace-tabs-harness.ts)
passes standalone and in the full gate.

## Contracts

The
[tasks dashboard PTY smoke](../../../../scripts/harness/smoke-tasks-dashboard-harness.ts)
checks both timers at boot, dock collapse, and tab replacement. Its
500-folder fixture records three steady visible ticks. The last run performed
zero task-tree reads, two fleet probes, two session-list reads, and zero row
rebuilds across 30 painted rows. A planted 500-row scan fails the same bound.

The
[workspace layout isolation smoke](../../../../scripts/harness/smoke-workspace-layout-isolation-harness.ts)
checks that switching away from a workspace whose Tasks pane was painted
leaves its data heartbeat at rest.

[Dashboard motion exists only while observed](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
defines observed as painted and records the painted-window cost bound.
[Cost tracks the actively observed set](../../../../project.invariants.md)
covers pane timers and visible cadence work.

## Verification

- Targeted module tests: 126 passed, 0 failed.
- Workspace-tabs PTY smoke: ALL-PASS standalone.
- Tasks dashboard PTY smoke: PASS, including the positive control and
  500-folder scale arm.
- Workspace layout isolation PTY smoke: PASS.
- Monitoring PTY smoke: PASS.
- Invariant checker: 1,286 annotations and 231 lattice links resolved, 0
  problems.
- Type check: PASS.
- Full pre-commit gate: ALL-PASS, `GATE_EXIT=0`.

The successful full gate passed all 66 PTY pool jobs without a retry,
including workspace-tabs, dashboard, workspace isolation, and terminal-stage.
The behavioral-contract serial step passed on its permitted retry. The final
input-byte timing warning was report-only.

The task changes are committed. The worktree contains only conductor-owned
brief and metadata updates that were not part of the builder commit.

## Bycatch

- `smoke-terminal-stage-harness` failed its tool-result expansion wait twice
  in the first follow-up gate and once standalone, then passed unchanged on
  current main, standalone on this branch, and in the successful full gate.
  This is an intermittent smoke defect. I did not change its timeout or code.
- The successful gate's behavioral-contract step passed only on its permitted
  retry. No dashboard contract needed a retry.
