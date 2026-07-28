# TASK — OpenPty.write must not block the event loop

Branch: create `fix-openpty-nonblocking-write` from `origin/main`.
Worktree: `/tmp/conductor-diffview`. Do not touch any other directory.

## The defect is already diagnosed. Verify it, then fix it at the seam.

`OpenPty.write` (`src/modules/terminal/OpenPty.ts`) performs a SYNCHRONOUS BLOCKING `write(2)` loop
through FFI on the PTY master file descriptor, and that descriptor is never set `O_NONBLOCK`. A write
larger than the kernel's PTY buffer therefore blocks the JavaScript thread until the reader drains.

THE OBSERVED HARNESS DEADLOCK (measured: 25 minutes with 0% CPU on BOTH processes):
1. the harness begins a blocking 64KB write to the master;
2. the application reads some of it and RENDERS, writing output back to the slave;
3. the slave's output buffer fills, because the harness is stuck inside `write()` and is not reading;
4. the application now blocks writing its output, so it STOPS READING INPUT;
5. the harness stays blocked in `write()` and never drains.

Neither side can proceed. `smoke-paste-harness` takes 2 SECONDS alone and has stalled 4.5 to 25 minutes
inside the gate's parallel pool; one straggler stretched a 0m52s pool phase to 5m53s.

## Why this is a PRODUCT fix, not only a test fix

`OpenPty` is a SHARED SEAM: the harness uses it, and so does `OpenPtyBackend` — the application's
integrated terminal. When a user pastes a large payload INTO the terminal pane, the app makes this same
blocking write toward the child shell. If that child is not draining promptly (a stopped process, a
paused pager, flow control), the app's render loop blocks and the whole UI freezes. Same defect, opposite
direction, and a user can hit this one. Fixing the seam covers both consumers at once; fixing either
caller alone would leave the other exposed.

## The fix

Set the master descriptor NON-BLOCKING (`fcntl` `F_SETFL` with `O_NONBLOCK`) and give `OpenPty` an
internal write queue drained on the event loop, treating `EAGAIN`/`EWOULDBLOCK` as "retry later" rather
than the error it currently raises.

CHUNKING ALONE IS NOT ENOUGH and this is the counterintuitive part: while the descriptor blocks, each
chunk still blocks once the buffer is full. Non-blocking mode is the load-bearing half; chunking is how
you make progress once you have it.

Constraints:
- KEEP `write()`'s synchronous signature — it has many call sites. Enqueue and return.
- A genuine write failure must still SURFACE, not be swallowed by the retry path. Distinguish
  `EAGAIN`/`EWOULDBLOCK` (retry) from every other errno (fail loudly, naming the errno).
- The drain must not spin when there is nothing to write: idle quiescence is a gated contract
  (`scripts/behavioral-contracts.sh`) and it MUST stay green. A drain scheduled only while the queue is
  non-empty satisfies this; a polling interval that runs at rest does not.
- Do not change the smoke's 64KB payload. It is deliberate coverage of chunked paste, and shrinking it
  would delete that coverage's precondition.

## Verification — drive the real paths, both directions

1. `smoke-paste-harness` completes inside the POOL under six workers, THREE runs, with no stall. That is
   the regression this fixes. Report the pool phase duration each time.
2. An integrated-terminal drive that pastes a large payload toward a child which is NOT reading (for
   example a stopped process, or one paused on input) must leave the UI RESPONSIVE: the frame loop keeps
   painting and a subsequent keystroke still registers. This is the product half and it needs a new
   driven case.
3. `bash scripts/behavioral-contracts.sh` green, `idle-quiescence` specifically.
4. Once green, consider whether `smoke-paste-harness` can return from the quiet-serial tail to the
   parallel pool (it was moved out purely as a mitigation for this defect) and say so in the report with
   the measured pool time either way.

## House rules (non-negotiable)

- Full descriptive identifier names, no abbreviations. Name the STATE a thing establishes, not the steps.
- Class-first ivue conventions; `protected` floor; `.prettierrc` (80 columns).
- Add/refine the invariant for this seam with ALL fields including **Scope**. Verify with EXIT CODES, not
  by reading a log tail. The invariant worth writing is about a write to a shared descriptor never
  blocking the loop that must also read it.
- Run and report exact exit codes: `bunx tsc --noEmit`, `bun test`, `bun scripts/check-file-grammar.ts`,
  both invariant checker passes, `bash scripts/conventions-gate.sh`,
  `bun scripts/check-coverage-ratchet.ts`, `bash scripts/behavioral-contracts.sh`, and every smoke you
  touch three times.
- Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>` (use `-F`: backticks in
  a `-m` string get executed by the shell). Do NOT run the merge gate, push, merge, tag, or delete a
  branch — the conductor does that.
- Leave the worktree CLEAN; `git ls-files | grep '^TASK'` must return nothing.
- Report to `/tmp/openpty-nonblocking-READY.md`: the errno handling, how the queue is drained and why it
  cannot spin at rest, the three pool runs, the integrated-terminal responsiveness drive, and anything
  you could not prove.
