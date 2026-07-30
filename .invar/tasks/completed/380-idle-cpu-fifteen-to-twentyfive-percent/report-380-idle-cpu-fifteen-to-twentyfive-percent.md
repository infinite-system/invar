# READY #380 — idle CPU from dashboard motion

Commit: `8d860007758ce7352c573c9fd7006126df3e6a0f`

GATE_EXIT: `0`

## Outcome

The tasks dashboard no longer runs motion for hidden or off-screen rows.

The 103-row off-screen case fell from 33.17% CPU to 2.00%. It emitted zero
complete frames before and after. The timer and render work caused the CPU use,
even when the terminal diff had no changed cells to write.

The current source did not reproduce the user's older `--smol` closed-pane
result. The controlled closed-pane arm was already quiet before this change.
The fix now also checks visibility inside each timer callback. The permanent
smoke closes a moving pane and proves that no motion timer survives.

## Toggle matrix

The committed
[measurement probe](380-dashboard-idle-cpu-toggle-measurement.ts) uses only
temporary fixture task folders. It selects the real app process by the
`PtyTestDriver` process identifier and reads `/proc/<pid>/stat` across each
five-second arm.

### User's older build

| Toggle | CPU | Result |
|---|---:|---|
| Tasks pane visible | 15–25% | User report |
| Tasks pane closed | 15–25% | User measurement. Closing the pane caused no drop. |

This result rejects “visibility gating already works” for that running binary.
No frame count or source hash was available for the binary.

### Current source before the fix

| Scale and toggle | CPU | Complete frames | Motion timer |
|---|---:|---:|---|
| Small, pane hidden at boot | 2.40% | 0 | stopped |
| Small, visible building row | 34.59% | 28 | running |
| Small, visible empty Active lens | 1.00% | 0 | stopped |
| Small, pane closed with live rows | 1.20% | 0 | stopped |
| Large, pane hidden at boot | 1.60% | 1 | stopped |
| Large, building row below viewport | 33.17% | 0 | running |
| Large, visible empty Active lens | 1.00% | 0 | stopped |
| Large, pane closed with live rows | 0.80% | 0 | stopped |

The off-screen arm isolates the generator. The ledger probe and renderer stay
quiet when the Live lens is absent. An existing building row kept the 30 Hz
motion timer active even when its animated detail row was below the viewport.

### Current source after the fix

| Scale and toggle | CPU | Complete frames | Motion timer |
|---|---:|---:|---|
| Small, pane hidden at boot | 1.00% | 0 | stopped |
| Small, visible building row | 10.80% | 29 | running |
| Small, visible empty Active lens | 0.80% | 0 | stopped |
| Small, pane closed with live rows | 0.80% | 0 | stopped |
| Large, pane hidden at boot | 1.20% | 0 | stopped |
| Large, building row below viewport | 2.00% | 0 | stopped |
| Large, visible empty Active lens | 1.20% | 0 | stopped |
| Large, pane closed with live rows | 0.80% | 0 | stopped |

The small and large quiet paths now have the same shape. Visible motion remains
active, but it requests only changed animation steps.

## Cause and fix

[TasksDashboardOverview](../../../../src/modules/tasks-dashboard/TasksDashboardOverview.ts)
used `rows.some(...)` to decide whether motion existed. That test measured row
existence, not painted visibility. An off-screen building row therefore kept a
30 Hz interval alive.

The same interval advanced `animationPaint` five times before the renderer
selected a new exported motion frame. Four of every five render requests
repainted the same row state.

The fix:

- tests only the current row window;
- treats only a visible detail row or running gate row as motion;
- resynchronizes the timer after scroll and viewport changes;
- checks pane visibility again inside both timer callbacks;
- advances one exported visual step per callback at six steps per second.

The last item preserves the existing two-second breath. It removes four
identical render requests for each visible row change.

[TasksDashboardPaneContent](../../../../src/modules/tasks-dashboard/TasksDashboardPaneContent.ts)
now sends viewport changes through the overview's timer synchronization seam.

## Permanent contract

[TasksDashboardOverview tests](../../../../src/modules/tasks-dashboard/TasksDashboardOverview.test.ts)
assert that the timer follows pane visibility and the visible row window.

The
[dashboard PTY smoke](../../../../scripts/harness/smoke-tasks-dashboard-harness.ts)
now covers two timeless conditions:

1. A closed pane with live rows has no motion timer.
2. A 500-task pane stops its timer after the only building row leaves the viewport.

The positive control replaced the visible-window scan with the old all-row
scan. The smoke failed with exit `1`:

`Timed out waiting for the motion timer stops after the only building row leaves the viewport`

After the plant was removed, the smoke passed.

## Verification

- Invariant checker: 0 problems. It resolved 1,233 annotations and 231 lattice links.
- TypeScript: exit `0`.
- Unit tests: 2,068 passed, 0 failed, 70,202 assertions.
- Dashboard unit tests: 39 passed, 0 failed.
- Dashboard PTY smoke: all arms passed.
- Commit hook attempt 3: `GATE_EXIT=0`, `merge-gate: ALL-PASS`.
- Hook input boundary: p50 4.921 ms and p95 6.493 ms.
- Worktree after commit: clean.

Hook attempt 1 exposed a race in the new close-and-reopen smoke arm. Published
state could lead painted rows under pool load. The smoke now waits for both
named live rows before it continues.

## Invariants

Scope came from the annotations and path of
[TasksDashboardOverview](../../../../src/modules/tasks-dashboard/TasksDashboardOverview.ts),
the dashboard contract, the root observed-cost rule, and the PTY smoke
contract.

| Record | Verdict |
|---|---|
| Dashboard motion exists only while observed | Strengthened. Timer ownership now follows the painted row window and checks hidden state inside each callback. |
| Task truth lives in the folders the CLI reads | Upheld. The app still reads facts only through the CLI readers. |
| Fleet extras name their repository scope | Upheld. Scope selection and readers did not change. |
| Tasks stay hidden by default | Upheld. The new close and reopen smoke preserves default-off behavior. |
| The CLI lenses are the dashboard's one generator | Upheld. Motion frames and cadence still derive from exported CLI tables. |
| The tasks dashboard is a pane content citizen | Upheld. The fix stays inside the plugin's overview and pane content. |
| An absent task tree is stated, never blank | Untouched. |
| Each dashboard lens has one stable row shape | Upheld. The visible detail row remains the motion row. |
| Dashboard controls state their selection and next action | Untouched. |
| Task actions use the workspace and runtime seams | Untouched. |
| Cost tracks the actively observed set | Strengthened. Off-screen task count no longer creates motion cost. |
| Harness input and output use the real PTY | Upheld. Both regression arms drive the real app through `PtyTestDriver`. |

The
[dashboard contract](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
already said “visible row or gate.” It needed no wording change.

## Bycatch

- Known #362 (Markdown harness ordinal drive and preview clipping) reproduced once in hook attempt 1. The preview clipped `alpha` to `alph`. Later hooks passed it.
- Known #214 (panel chrome agent close intermittent) failed both tries in hook attempt 2. It passed on retry in the green hook.
- The voice-picker smoke timed out once in hook attempt 1 and passed its built-in retry. It did not reproduce in later hooks.
