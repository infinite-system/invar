# READY — Gate registry isolation (#433)

Task: [tasks dashboard auto-reveal priced out](task-433-tasks-dashboard-auto-reveal-priced-out.md)

Round brief: [isolate the gate registry](brief-433-3-2-isolate-gate-registry.md)

Commit: `1add291c5ddc2ad4c1057ef088fc67a3f8690d03`

## Result

The Tasks dashboard smoke no longer reads the host fleet gate registry.

The [task status seam](../../../../scripts/tasks/tasks-status.ts) now reads
`INVAR_FLEET_GATE_REGISTRY` at each glance refresh. It falls back to
`/tmp/fleet-watch-gates` when the override is absent.

Every PTY driver in the [Tasks dashboard smoke](../../../../scripts/harness/smoke-tasks-dashboard-harness.ts)
sets the override to one fixture-owned path. The smoke drives these states:

- No registry file adds no gate row.
- A running log without `GATE_EXIT` adds one gate row and keeps `tasksGateExitCode=null`.
- A finished log with `GATE_EXIT=0` keeps the gate row and publishes exit zero.

The fixture has four LIVE rows, two ACTIVE rows, one DONE row, and 1,000 large-fixture rows.
A running or finished gate adds one row. Exit-code nullability no longer decides whether a row
exists.

The smoke changes the registry state through the file seam. It then switches from Structure back
to Tasks through user shortcuts. This starts a fresh observation without changing the governed
glance cadence.

## Isolation evidence

The pre-change smoke failed its large arm when the injected running registry had no `GATE_EXIT`.
The observed gate row made the total 1,001 while `tasksGateExitCode` remained null.

After the fix, the smoke passed with a missing parent registry and with a parent registry that named
a running gate. Both runs produced the same fixture-derived rows.

I also planted the original baked `/tmp/fleet-watch-gates` read after the new smoke contract existed.
The smoke went red at its first visible LIVE count because the host registry added a row. I removed
the plant and the smoke returned to green.

I did not overwrite the fleet-owned `/tmp/fleet-watch-gates` file. A private bind-mount drive was not
available because `bwrap` could not create a user namespace on this host. The conductor's running
landing gate supplies that literal host state during landing.

## Contract and audit

The [Tasks dashboard contract](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
now separates two path generators. Workspace-owned paths still derive from the workspace. The new
`Harness fleet facts are isolated from host state` record governs process-global fixture paths.

The final change upholds `Dashboard motion exists only while observed`. Gate facts still refresh
only when Tasks becomes observed or the task tree causes a full refresh. Hidden Tasks still owns no
read or timer.

The final change also upholds `Task truth lives in the folders the CLI reads`. Task record reads did
not change.

The audit found no second gate-registry status consumer. `smoke-terminal-harness.ts` imports only
`tasksTreeStamp`, which does not read gate facts. `fleet-watch.sh` owns the host registry and is not a
harness status consumer.

## Verification

- `bun test src/modules/tasks-dashboard` — PASS: 41 tests, 0 failures, 180 expectations.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — PASS: 1,323
  annotations, 263 lattice links, 0 problems.
- Missing-parent-registry Tasks smoke — ALL-PASS.
- Running-parent-registry Tasks smoke — ALL-PASS with identical fixture counts.
- Prettier check for all three changed files — PASS.
- `git diff --check` — PASS.
- Full merge gate — not run, as required by the round brief. The conductor runs it at landing.

The worktree is clean at `1add291c5ddc2ad4c1057ef088fc67a3f8690d03`.

## Bycatch

- Plain nonsense: [TasksDashboardPaneRenderer.ts](../../../../src/modules/tasks-dashboard/TasksDashboardPaneRenderer.ts)
  can render `Gate: no fleet gate registry.` only when a gate row has a null glance. However,
  [TasksDashboardOverview.ts](../../../../src/modules/tasks-dashboard/TasksDashboardOverview.ts)
  creates a gate row only when the glance is not null. I observed the missing message twice after
  opening Tasks at 150 by 40 with no fixture registry. I did not fix this separate behavior.

No other bycatch was observed.
