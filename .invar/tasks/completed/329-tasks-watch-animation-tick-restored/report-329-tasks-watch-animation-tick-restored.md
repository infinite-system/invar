# READY — tasks:watch animation tick restored

READY

## Result

#329 (tasks:watch animation tick restored) is complete. The implementation follows the
[task record](task-329-tasks-watch-animation-tick-restored.md) and
[brief](brief-329-1-tasks-watch-animation-tick-restored.md).

`tasks:watch` now has two clocks:

- The existing two-second data clock reads the ledger and sends changed data rows.
- One absolute 60 FPS motion clock sends only animated live rows.

The motion clock owns one timer. A delayed callback calculates the current absolute frame. It skips
missed frames and schedules only the next deadline. A dashboard with no animated row cancels the
timer and writes no motion frame.

Each motion write uses one matched DEC 2026 bracket. It moves the cursor to changed rows and clears
only those rows. It never clears the screen or enters the alternate screen again. The change keeps
the [terminal synchronized-output contract](../../../../src/modules/terminal/terminal.invariants.md)
from #321 (terminal flicker from child TUI repaints).

The default `NO_COLOR` path needed a separate visible glyph cycle. Without it, color-only
subframes collapsed to about 20 FPS because the row diff correctly removed equal text. The
monochrome glyph cycle makes each target frame visible while keeping output bounded.

## Driven diagnosis

I drove the default watcher before I changed code. The building row moved only when the two-second
data loop ran. The existing #321 integrated probe still showed two complete and safe data frames at
both 100x30 and 160x50. This confirmed that commit `f0a860bf` kept synchronized data frames but
removed the independent motion clock.

After the change, I drove the watcher in a real PTY. The building row moved continuously while the
task-tree stamp stayed fixed. I then added the
[raw capture probe](329-tasks-watch-animation-capture-probe.ts) and the permanent terminal-harness
contract.

## Live and idle captures

Default 100x30 capture:

```text
geometry=100x30
animationFrames=24
animationFps=60.0
frameBytes=82-83
dec2026Brackets=24/24
motionFingerprints=3
fullClears=0
alternateScreenEntries=0
taskTreeChanged=false
idleWrites=0
idleAnimationTimers=0
```

Large 160x50 capture:

```text
geometry=160x50
animationFrames=24
animationFps=59.8
frameBytes=82-83
dec2026Brackets=24/24
motionFingerprints=3
fullClears=0
alternateScreenEntries=0
taskTreeChanged=false
idleWrites=0
idleAnimationTimers=0
```

The renderer test also sent one changed row at row 100,000. The complete frame stayed below 64
bytes. This confirms that frame work depends on animated rows, not dashboard length.

## Positive control

I replaced the clock calculation with `return 0` and ran the renderer test. The intended motion and
skip assertions failed:

```text
Expected: 1
Received: 0
(fail) a live animation advances from its own 60 FPS clock without a data tick

Expected: 7
Received: 0
(fail) a delayed animation callback skips missed frames and never queues them

6 pass
2 fail
TEST_EXIT=1
```

I restored the real clock before the final pass.

## Verification

- `bun test scripts/tasks/TasksWatchRenderer.test.ts src/modules/terminal/TerminalInstance.test.ts`
  passed: 23 tests, 72 expectations.
- `bunx tsc --noEmit` passed.
- `bun scripts/harness/smoke-terminal-harness.ts` passed. It observed live motion with an unchanged
  task tree and five complete outer frames with no blank or partial frame.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` passed with 1,202
  annotations, 223 lattice links, and zero problems.
- Prettier and `git diff --check` passed.
- The normal commit hook passed its full gate. It printed `GATE_EXIT=0`. No step passed only on
  retry in that green run.
- The worktree is clean.

Commit: `cf2104e3ddb5f109448e695289eeba25d697955f`

Subject: `tasks-watch: restore 60fps diff animation (#329)`

## Bycatch

- Contract-layer gap: `scripts/tasks/` owns the watcher clock and frame policy, but it has no local
  invariant record. The module
  [tasks contract](../../../../src/modules/tasks/tasks.invariants.md) and
  [tasks-dashboard contract](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
  do not state the watcher clock, bounded-row frame, or idle-timer rules.
- The
  [#321 diagnostic probe](../../completed/320-terminal-pane-fidelity-two-bundle/321-terminal-synchronized-update-diagnostic-probe.ts)
  classified the shell's partly typed `b` command as a partial child frame on the first 100x30
  post-change run. The same command passed immediately after it. It did not reproduce a second time.
- The first commit-hook run hit the known
  [#193 fold-dense row shortfall](../../active/193-fold-dense-contract-row-shortfall/task-193-fold-dense-contract-row-shortfall.md):
  actual start 74,998, travel 995 rows, and 30.0 FPS. It ended with `GATE_EXIT=1`. The unchanged
  second full hook passed the contract and ended with `GATE_EXIT=0`.
- The first hook run had starvation-class retry passes in the scrollbars, Git watch, and panel
  split smokes. Each passed without a retry in the unchanged second hook. This matches the census in
  [#214 (panel chrome Agent 2 close intermittent)](../../active/214-panel-chrome-agent-close-intermittent/task-214-panel-chrome-agent-close-intermittent.md).
- The final hook's input-byte canary passed ordering but warned at p50 13.187 ms against the 6.406
  ms report threshold. The previous hook measured p50 5.167 ms. The final hook started beside two
  live test app instances, so concurrent gate load is a suspect. I made no change outside this task.
