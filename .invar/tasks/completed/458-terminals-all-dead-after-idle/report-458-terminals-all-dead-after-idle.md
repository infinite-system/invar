## In plain words

Each quiet terminal left a blocking reader sitting in one of Bun's four shared file workers. After
four terminals, later panes had live shells but no worker to bring their text back. I moved each
reader to the terminal readiness path, and six terminals now keep reading at both 10 and 100,000
file lines.

## Result

READY. Commit `ffd0353c0d4be656ea4e538ecdf2f082c58a4626` on
`fleet/458-terminals-all-dead-after-idle` contains the fix and regression smoke. The worktree is
clean. I did not push, merge, tag, or land it.

The changed files are:

- [`OpenPty.ts`](../../../../src/modules/terminal/OpenPty.ts)
- [`OpenPty.test.ts`](../../../../src/modules/terminal/OpenPty.test.ts)
- [`smoke-terminal-harness.ts`](../../../../scripts/harness/smoke-terminal-harness.ts)
- [`project.terminal-feasibility.md`](../../../../project.terminal-feasibility.md)

## Reproduction

I followed the default path from the [task](task-458-terminals-all-dead-after-idle.md) and
[brief](brief-458-1-terminals-all-dead-after-idle.md). I opened the panel with `Ctrl+J`. I then used
the visible `+ Plugin` control and its `Add panel` popup to create ten terminal panes.

The first bad fingerprint was immediate. It needed quiet terminals, but it did not need an elapsed
idle timer:

1. Terminal 10 opened blank.
2. Typing `x` exposed its delayed banner and prompt, but not `x`.
3. Typing `y` exposed `$ x`, but not `y`.
4. The UI still accepted clicks and keys. The shell still handled each input.

Starting the same app with `UV_THREADPOOL_SIZE=64` made terminal 10 paint its prompt and reach
`$ xy`. I held every other setting and gesture fixed. This one change separated the process file
worker pool from pane identity, child death, PTY close, UI rendering, and elapsed-time cleanup.

## Cause

[`OpenPty.ts`](../../../../src/modules/terminal/OpenPty.ts) gave each PTY master duplicate to
`fs.createReadStream`. The master was in blocking read mode. Bun ran each quiet character-device
read on one process-wide file worker. Its default pool had four workers, so four quiet terminals
occupied the pool. Later terminal reads waited behind them.

Each `OpenPty` still owned its master descriptor, duplicate descriptor, stream, callback, backend,
emulator, and restart timer. The static FFI library handles were also shared, but they did not move
bytes. The process file worker pool was the only shared read stage.

The time-based terminal mechanics were per-instance read restart, write retry, synchronized-output,
and agent-typing timers. No shared idle timer, reaper, or pane-age rule existed. The failure appeared
as soon as the fifth quiet read entered a four-worker process.

The competing causes ranked as follows:

1. Shared file-worker exhaustion was proven by the exact four-reader boundary and the
   `UV_THREADPOOL_SIZE=64` control.
2. A shared reaper or timeout was refuted because no time had to pass.
3. A dropped shared subscription was refuted because each instance owned its callback, and changing
   only the worker count restored delivery.
4. A shared epoll or event multiplexer defect was refuted because the old read path had no such
   shared stage.
5. A normal per-instance PTY close remained covered by the existing restart test. It could not
   explain why raising only the process worker count restored all new panes.

## Fix

[`OpenPty.ts`](../../../../src/modules/terminal/OpenPty.ts) now reads each duplicated PTY master with
`node:tty` `ReadStream`. That stream uses the terminal readiness handle instead of a file worker.
The read side remains blocking. The existing write queue switches the shared open file to
nonblocking mode only for its bounded write turn, then restores read mode.

The stream still owns only a duplicate. Closing a pane destroys that stream and closes the master
through the existing ownership path. A first attempt with `Bun.file(fd).stream()` fixed the worker
limit but kept the process alive during shutdown. I rejected that attempt. The final TTY stream
passes both liveness and immediate shutdown probes.

The registered terminal harness now creates terminals 2 through 6 through the visible add control.
It requires every new prompt without output from another pane. Terminal 6 then runs an escaped
`printf` whose input does not contain `LIVE-6`, and the smoke waits for that output.

## Positive control

I temporarily stopped the fifth application read from starting. The new smoke failed with:

`Timed out waiting for grid condition: idle terminal 5 paints its prompt without another terminal producing output`

The final grid showed terminal 5 blank. I removed the plant. The same smoke then passed terminal 6.
This proves that the check detects the reported failure instead of only detecting typed input or an
older pane's output.

## Scale parity

I drove the same default gesture on both shared fixtures after the final TTY-stream change:

- 10 lines: six quiet terminals painted their prompts, and terminal 6 returned `LIVE-6`.
- 100,000 lines: six quiet terminals painted their prompts, and terminal 6 returned `LIVE-6`.

Both warm drive servers stopped immediately after the probe. Document size did not change the
terminal fingerprint.

## Verification

- `bun test`: 2,353 passed, 0 failed, 72,111 expectations across 353 files.
- `bunx tsc --noEmit`: passed.
- `bun scripts/harness/smoke-terminal-harness.ts`: `ALL-PASS`, including the six-terminal ratchet.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 1,374 annotations,
  266 lattice links, 0 problems.
- `bash scripts/conventions-gate.sh`: passed.
- `bun scripts/check-coverage-ratchet.ts`: passed against `a9700d9`; the terminal smoke moved from
  37 assertions and 42 waits to 43 assertions and 53 waits.
- `git diff --check`: passed before commit.

The commit hook started the full merge gate automatically. I stopped it during its unit-test step
because the [brief](brief-458-1-terminals-all-dead-after-idle.md) forbids builders from running that
gate. I then used the hook's documented `SKIP_GATE=1` path. The explicit checks above are the builder
verification pass.

## Contract verdicts

The terminal contract in
[`terminal.invariants.md`](../../../../src/modules/terminal/terminal.invariants.md) has these
record-by-record results:

| Record | Verdict |
|---|---|
| [The emulator is the single source of terminal screen state](../../../../src/modules/terminal/terminal.invariants.md#the-emulator-is-the-single-source-of-terminal-screen-state) | Upheld. The transport still feeds the same emulator. |
| [Terminal emulator behavior is specified by byte fixtures](../../../../src/modules/terminal/terminal.invariants.md#terminal-emulator-behavior-is-specified-by-byte-fixtures) | Upheld. Byte parsing did not change. |
| [Child synchronized updates commit as one repaint](../../../../src/modules/terminal/terminal.invariants.md#child-synchronized-updates-commit-as-one-repaint) | Upheld. Delivery timing changed, not repaint grouping. |
| [Observation never writes to the PTY](../../../../src/modules/terminal/terminal.invariants.md#observation-never-writes-to-the-pty) | Untouched. |
| [Observation payloads are bounded and self describing](../../../../src/modules/terminal/terminal.invariants.md#observation-payloads-are-bounded-and-self-describing) | Untouched. |
| [Agent terminal reads are redacted](../../../../src/modules/terminal/terminal.invariants.md#agent-terminal-reads-are-redacted) | Untouched. |
| [One openpty allocator serves both PTY roles](../../../../src/modules/terminal/terminal.invariants.md#one-openpty-allocator-serves-both-pty-roles) | Strengthened. Both integrated and harness roles use the fixed reader. |
| [A controlling PTY resize reaches the renderer](../../../../src/modules/terminal/terminal.invariants.md#a-controlling-pty-resize-reaches-the-renderer) | Upheld by the full terminal smoke. |
| [Shared PTY writes never block the event loop](../../../../src/modules/terminal/terminal.invariants.md#shared-pty-writes-never-block-the-event-loop) | Upheld. Writes still use the bounded nonblocking queue and restore read mode. |
| [Terminal bytes cross exactly one backend seam](../../../../src/modules/terminal/terminal.invariants.md#terminal-bytes-cross-exactly-one-backend-seam) | Upheld. No second byte route was added. |
| [Pane chrome and child cells keep separate authority](../../../../src/modules/terminal/terminal.invariants.md#pane-chrome-and-child-cells-keep-separate-authority) | Untouched. |
| [Child terminal modes own wheel input](../../../../src/modules/terminal/terminal.invariants.md#child-terminal-modes-own-wheel-input) | Upheld by the full terminal smoke. |
| [Animated agent commands stay visible and inert](../../../../src/modules/terminal/terminal.invariants.md#animated-agent-commands-stay-visible-and-inert) | Untouched. |
| [Terminal word operations reach readline](../../../../src/modules/terminal/terminal.invariants.md#terminal-word-operations-reach-readline) | Untouched. |
| [Terminal replacement preserves human execution](../../../../src/modules/terminal/terminal.invariants.md#terminal-replacement-preserves-human-execution) | Untouched. |
| [The terminal is a runtime plugin](../../../../src/modules/terminal/terminal.invariants.md#the-terminal-is-a-runtime-plugin) | Upheld. The fix stays inside the terminal provider. |

The system contract in
[`system.invariants.md`](../../../../src/modules/system/system.invariants.md) has these results:

| Record | Verdict |
|---|---|
| [Clipboard emissions flush at frame boundaries](../../../../src/modules/system/system.invariants.md#clipboard-emissions-flush-at-frame-boundaries) | Untouched. |
| [Capability classes are stateless and Static wrapped](../../../../src/modules/system/system.invariants.md#capability-classes-are-stateless-and-static-wrapped) | Upheld. `OpenPty` keeps its anchored namespace form. |
| [External tools share one launch policy](../../../../src/modules/system/system.invariants.md#external-tools-share-one-launch-policy) | Upheld. The documented interactive-PTY exception did not change. |
| [File access is confined to a single root](../../../../src/modules/system/system.invariants.md#file-access-is-confined-to-a-single-root) | Untouched. |
| [Observability never crashes the app](../../../../src/modules/system/system.invariants.md#observability-never-crashes-the-app) | Upheld. Drive graph reads remained diagnostic only. |
| [Graph observation reads and never mutates](../../../../src/modules/system/system.invariants.md#graph-observation-reads-and-never-mutates) | Upheld. No graph mutation was used. |
| [The composition graph reaches every installed contributor](../../../../src/modules/system/system.invariants.md#the-composition-graph-reaches-every-installed-contributor) | Upheld. The terminal provider remained reachable through the existing graph. |
| [Copy reaches the host terminal](../../../../src/modules/system/system.invariants.md#copy-reaches-the-host-terminal) | Untouched. |

The directly implicated UI record,
[A pane runtime owns its processes](../../../../src/modules/ui/ui.invariants.md#a-pane-runtime-owns-its-processes),
is strengthened. Each terminal runtime still owns its child, PTY, duplicate, and read stream. Closing
the runtime now also releases the readiness handle without delaying process exit.

The directly implicated project records are also upheld. The fix makes a terminal's read stream an
owned live resource under
[A referenced resource stays alive](../../../../project.invariants.md#a-referenced-resource-stays-alive).
It removes the hidden file-worker cost from each quiet pane under
[Cost tracks the actively observed set](../../../../project.invariants.md#cost-tracks-the-actively-observed-set).
The responsive UI during reproduction and the final drives uphold
[The render loop never wedges](../../../../project.invariants.md#the-render-loop-never-wedges).

## Proposed invariant

The exact generator needs a stronger terminal record than the earlier proposal. I propose:

**A live PTY read is readiness driven**

- Scope: the shared `OpenPty` allocator in both integrated and harness roles.
- Mechanism: one owned TTY readiness stream reads one duplicated master descriptor. Bounded writes
  switch the shared open file to nonblocking mode only for the write turn.
- Impossible state: quiet PTYs consume one shared file worker each until a later live PTY has no read
  path.
- Verification: create more idle terminals than Bun's default file-worker count, require each new
  prompt, and require terminal 6 to return output that was not present in its typed input.

The wording “A live PTY retains one master read path” is too weak. The broken implementation did
retain one scheduled path per PTY, but those paths queued behind four blocked workers.

## Bycatch

- Contract-layer gap: the report for
  [#452 (pane identity collides by name)](../../completed/452-pane-identity-collides-by-name/report-452-pane-identity-collides-by-name.md)
  proposed “A live PTY retains one master read path,” and this task called it “still proposed.” The
  current [`terminal.invariants.md`](../../../../src/modules/terminal/terminal.invariants.md) contains
  no such record. I did not add a contract without user confirmation. The refined proposal is above.
- No separate runtime bycatch reproduced twice.

## Instrument feedback

- EASY: the warm drive server, visible text clicks, graph conditions, and scale fixtures made the
  ten-terminal reproduction and the 10 versus 100,000 comparison direct.
- CONFUSING: chaining `type()` with `waitForRepaint()` can miss the repaint that `type()` already
  caused. A visible-text condition such as `$ xy` was reliable.
- MISSING: none for this diagnosis.
