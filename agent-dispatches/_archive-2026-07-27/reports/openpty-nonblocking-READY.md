# OpenPty non-blocking write READY

## Outcome

`OpenPty.write` now copies the supplied bytes into an ordered internal queue and returns with its
synchronous `void` signature unchanged. The shared seam therefore covers both
`OpenPtyBackend` (integrated terminal input) and `PtyTestDriver` (harness input).

Committed as `62ba630` (`fix(terminal): make OpenPty writes non-blocking`).

The pre-fix raw-child reproduction used a child running `stty raw -echo; cat`, wrote 64 MB without
reading the returned output, and timed out with exit 124 before either `WRITE_RETURNED` or
`EVENT_LOOP_ALIVE` could print. The same reproduction after the fix exited 0 and printed both
markers.

## Descriptor state and errno handling

`OpenPty` reads the existing file status flags with `fcntl(F_GETFL)` and preserves them. It applies
`O_NONBLOCK` with `fcntl(F_SETFL)` before every libc `write(2)` drain, so no write call can block the
JavaScript thread.

Bun's `node:fs` PTY read path reports `EAGAIN` if the descriptor remains non-blocking while it starts
an async read. Therefore `OpenPty` restores the preserved blocking flags after each write drain so
the existing event-driven read stream can wait without polling. If a read races the short
non-blocking write window, only that observed `EAGAIN`/`EWOULDBLOCK` schedules a one-shot read-stream
restart. There is no recurring read poll.

For writes:

- `EAGAIN` and `EWOULDBLOCK` schedule a retry one millisecond later.
- Any other negative `write(2)` result throws with the numeric errno and the current queued-byte
  offset.
- `fcntl` failures also throw with their numeric errno.
- An induced `EBADF` regression test observes `PTY write failed with errno 9`; the asynchronous
  failure is not swallowed.

## Queue drain and idle behavior

Each event-loop drain attempts at most 16 KB, advancing partial writes and preserving FIFO order
across queued calls. A successful partial drain schedules another event-loop turn. A would-block
result schedules a delayed retry. `close()` clears the queue and cancels both pending write and
one-shot read-restart timers.

No write-drain timer exists unless the queue is non-empty. Final `idle-quiescence` evidence:
frame `2 -> 2` over the three-second untouched window. `bash scripts/behavioral-contracts.sh`
exited 0 and reported `behavioral-contracts: ALL-PASS`.

## Six-worker pool runs

The pool runner loaded all 53 current `parallel_safe_smoke` registrations from
`scripts/merge-gate.sh`, used six workers, and imposed a 120-second per-job ceiling. The merge gate
itself was not run, per task instruction.

| Run | Pool phase | `smoke-paste-harness` | Product backpressure smoke | Target result |
| --- | ---: | ---: | ---: | --- |
| 1 | 42 s | exit 0, 2 s | exit 0, <1 s | no paste stall |
| 2 | 41 s | exit 0, 2 s | exit 0, 1 s | no paste stall |
| 3 | 38 s | exit 0, 2 s | exit 0, <1 s | no paste stall |

The unchanged 65,536-byte paste completed in two seconds in every pool run. It has been returned
from the quiet-serial tail to the parallel pool. The new product drive is also registered in that
pool.

The complete pool was not wholly green for reasons outside this change: run 1 and run 2 each had
the existing `smoke-mode-coherence-harness` time out under contention (it passed solo in four
seconds), and run 3 had an unrelated Quick Open dismissal assertion fail in
`smoke-overlay-dialog-harness`. Neither target smoke retried or stalled, and both target logs ended
in `ALL-PASS` on all three runs.

Pool evidence directories:

- `/tmp/openpty-pool-1.xtRzsv`
- `/tmp/openpty-clean-pool-1.yAZYeX`
- `/tmp/openpty-measured-pool-1.ZxaFkl`

## Integrated-terminal responsiveness drive

`scripts/harness/smoke-terminal-backpressure-harness.ts` drives the real nested integrated terminal:

1. Opens and focuses the integrated terminal and proves a shell round trip.
2. Starts a foreground Bash child which records its PID, switches the PTY to raw/no-echo mode, and
   stops itself with `SIGSTOP`.
3. Polls `/proc/<pid>/status` until the child state is `T`, proving the recipient is not reading.
4. Pastes 65,536 bytes toward that child.
5. Sends F8 after the paste and observes `terminalVisible === false`.
6. Observes a fresh frame in which the terminal heading has disappeared.
7. Sends the reserved quit key and observes a clean application exit.

This proves both requested product outcomes: a subsequent keystroke registers and the frame loop
continues painting while the child-side PTY is backpressured.

## Required verification exit codes

- `bunx tsc --noEmit`: 0
- `bun test`: 0 — 1,343 passed, 0 failed
- `bun scripts/check-file-grammar.ts`: 0
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all`: 0
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs`: 0 — 693 annotations,
  42 lattice links, 0 problems
- `bash scripts/conventions-gate.sh`: 0
- `bun scripts/check-coverage-ratchet.ts`: 0
- `bash scripts/behavioral-contracts.sh`: 0
- `bash -n scripts/merge-gate.sh`: 0
- `bun test src/modules/terminal/OpenPty.test.ts`: 0 — 3 passed, 0 failed

Post-commit verification also returned 0 for `bunx tsc --noEmit` and the focused OpenPty test.
`git status --short` is empty, and `git ls-files | grep '^TASK'` produced no output (grep exit 1).

The added chosen invariant is `Shared PTY writes never block the event loop`, with Invariant,
Scope, Mechanism, Generates, Evidence, Impossible-if-true, Verification, Status, and Last-refined
fields plus code annotations at the shared seam and product drive.

## Not proved or deliberately not performed

- The full merge gate was deliberately not run.
- No push, merge, tag, branch deletion, or worktree deletion was performed.
- The three target pool runs prove the requested backpressure regression, but not an all-green
  full parallel suite because of the unrelated failures listed above.
- `origin/main` advanced by one docs-only commit (`a19819c`, `project.conductor.md`) after this
  worktree had started from `1c57cd2`; no integration was performed.
