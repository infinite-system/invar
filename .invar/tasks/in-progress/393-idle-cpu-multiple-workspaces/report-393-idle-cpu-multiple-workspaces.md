# READY #393 — idle CPU with multiple workspaces

Commit: `c290ef74b4a8458ee3fa560308314dd680ea603c`

GATE_EXIT: 0

## Outcome

I could not reproduce the reported 15–25% idle CPU on the current source.
One, two, and four fixture workspaces stayed between 0.4% and 1.6% CPU.
CPU did not grow with workspace count. No candidate generator won.

I did not make a speculative runtime fix. I added a reusable
[multi-workspace idle measurement](393-multi-workspace-idle-measurement.ts),
published the animation cadence timer count at its ownership seam, and added
a timeless idle contract to the
[workspace tabs PTY smoke](../../../../scripts/harness/smoke-workspace-tabs-harness.ts).

## Method

The probe extends the paired `/proc/<pid>/stat` method from
[#380 (idle CPU at fifteen to twenty-five percent)](../../completed/380-idle-cpu-fifteen-to-twentyfive-percent/report-380-idle-cpu-fifteen-to-twentyfive-percent.md).
It creates isolated fixture repositories and an isolated home directory.
It never opens this repository as an Invar workspace.

Each candidate and quiet-reference sample lasted five seconds. The probe
drove the real PTY path. It measured Invar CPU, process-tree CPU, complete
frames, descendants, live Git watchers, animation timer ownership, task
motion, and render quiescence.

The first values below are the candidate and quiet-reference CPU
percentages. The values in parentheses are complete frames. App CPU and
process-tree CPU were equal in every sample.

## Measured matrix

### Empty workspaces

| Workspaces | Before candidate / reference | After candidate / reference |
| ---: | ---: | ---: |
| 1 | 1.2 / 0.8 (2 / 0) | 1.2 / 0.6 (1 / 0) |
| 2 | 0.4 / 0.8 (0 / 0) | 0.6 / 0.8 (0 / 0) |
| 4 | 0.8 / 0.4 (1 / 0) | 0.8 / 0.6 (0 / 0) |

### One retained terminal per workspace

| Workspaces | Before candidate / reference | After candidate / reference |
| ---: | ---: | ---: |
| 1 | 1.0 / 0.6 (0 / 0) | 0.6 / 0.6 (0 / 0) |
| 2 | 1.0 / 0.8 (1 / 0) | 0.6 / 0.8 (0 / 1) |
| 4 | 1.0 / 1.6 (0 / 0) | 0.4 / 0.6 (0 / 0) |

The descendant count was 1, 2, and 4. The idle shells added processes, but
they added no CPU trend.

### One retained idle agent per workspace

| Workspaces | Before candidate / reference | After candidate / reference |
| ---: | ---: | ---: |
| 1 | 0.8 / 0.6 (0 / 0) | 0.6 / 0.6 (0 / 0) |
| 2 | 0.6 / 1.0 (0 / 1) | 0.8 / 0.6 (0 / 0) |
| 4 | 1.4 / 0.6 (0 / 0) | 0.6 / 0.6 (0 / 0) |

Every agent was idle. This fixture used the process-free harness agent, so
the descendant count stayed zero.

### One TypeScript document opened per workspace

| Workspaces | Before candidate / reference | After candidate / reference |
| ---: | ---: | ---: |
| 1 | 1.0 / 0.8 (0 / 0) | 1.0 / 1.0 (1 / 0) |
| 2 | 0.8 / 0.8 (1 / 0) | 0.8 / 1.6 (0 / 0) |
| 4 | 0.6 / 0.6 (0 / 0) | 0.8 / 0.6 (0 / 0) |

The descendant count stayed one. Only the active workspace retained a
language-service process. Every arm also retained exactly one live Git
watcher.

## Candidate verdicts

1. Per-workspace subsystems measured zero scaling cost. Terminal children
   scaled with workspace count, but CPU did not. Agent CPU did not scale.
   Language services and Git observation stayed at one live resource.
2. The render scheduler parked. Complete frames stayed flat. The settled
   two-workspace contract reported zero animation cadence timers.
3. Status and chrome clocks did not produce sustained frames. One setup
   sample ended while one cadence timer was armed, emitted one frame, and
   returned to zero in the paired reference. This was not a persistent loop.
4. Hidden workspaces did not keep render loops alive. Their retained worlds
   stayed quiet while only the selected workspace owned active services.

The change adds observability and a contract. It does not change runtime
ownership. The before and after matrices therefore show the same quiet
behavior.

## Permanent contract and positive control

[Bootstrap](../../../../src/modules/app/Bootstrap.ts) now projects
`animationFrameCadenceTimerCount` as 0 or 1 at the scheduler ownership seam.
The workspace smoke settles two workspaces with retained terminal and agent
worlds. It then requires:

- zero animation cadence timers;
- an idle agent;
- task motion at rest;
- panel and workspace scroll motion at rest; and
- exactly one live Git watcher.

I planted a real 60-second cadence timer and published a count of one. The
smoke went red with:

`FAIL two idle workspaces own no animation cadence timer`

I removed the plant. The normal smoke passed. This positive control proves
that the new assertion can fail on the defect it claims to catch.

## Dashboard sibling contract

The [dashboard PTY smoke](../../../../scripts/harness/smoke-tasks-dashboard-harness.ts)
still proves that an off-screen building row owns no dashboard motion timer.
Its old visual wait looked for the text `READY`. The newer missing-session
projection paints `DEGRADED` for those held rows, so that wait could never
complete. I changed it to wait for the exact held fixture row while still
requiring the building row to be absent and the motion state to be at rest.

## Invariant verdict

PASS.

- [Cost tracks the actively observed set](../../../../project.invariants.md)
  is upheld. CPU, frames, Git watchers, and language-service children do not
  scale with the total open-workspace population. The new timer count exposes
  the scheduler ownership state directly.
- [Dashboard motion exists only while observed](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
  is upheld. The corrected large-fixture smoke reaches motion rest after the
  building row leaves the observed window.
- [Harness input and output use the real PTY](../../../../scripts/harness/harness.invariants.md)
  is upheld. The measurement and both permanent contracts use
  `PtyTestDriver`.
- [Each workspace owns one panel world](../../../../src/modules/workspace/workspace.invariants.md)
  is upheld. Hidden terminal and agent sessions remained retained and idle.
- The same workspace contract records that N workspaces do not cost N live
  Git watchers and that activation is view-only. The probe observed one live
  watcher in every arm and drove workspace activation through the painted
  project picker.

The invariant checker reported 0 problems and 1,239 resolved annotations.

## Verification

- Default small drive: `bun run drive --size 10` — PASS.
- Default large drive: `bun run drive --size 100000` — PASS.
- Type check: `bunx tsc --noEmit` — PASS.
- Unit suite: 2,089 passed, 0 failed, 70,580 assertions in 318 files.
- Workspace tabs smoke — PASS.
- Tasks dashboard smoke — PASS.
- Panel chrome smoke in isolation — PASS.
- Invariant structure and reference checker — 0 problems.
- Full pre-commit gate with `INVAR_GATE_WORKERS=1` — ALL-PASS,
  `GATE_EXIT=0`, with no retry-assisted pass.
- Worktree after commit — clean.

## Bycatch

- The six-worker gate starved the panel chrome smoke. Two final attempts
  timed out at different instance-close actions. The same smoke passed alone
  and passed in the one-worker full gate. This reproduced more than twice.
  I did not change its timeout or its code.
- The six-worker gate also hid intermittent starvation in panel split,
  bracket match, and overlay dialog on earlier attempts. Each passed in the
  clean one-worker gate. I did not change them.
- Contract drift: [project conventions](../../../../project.conventions.md)
  call the complete-frame counter authoritative for idle CPU. The
  [#380 probe](../../completed/380-idle-cpu-fifteen-to-twentyfive-percent/380-dashboard-idle-cpu-toggle-measurement.ts)
  and a task positive-control trial both showed that repeated no-op render
  requests can consume CPU while emitting zero complete frames. A scheduler
  ownership count is needed beside the frame counter. I did not change the
  convention in this task.
