# TASK — `OpenPty F_SETFL` fails intermittently with impossible errnos (#109)

You are a builder on the Invar terminal IDE. Work ONLY in `/tmp/conductor-openpty`
(branch `fix-openpty-fcntl-variadic`, forked from `main`).

Do NOT run `scripts/merge-gate.sh`. Do NOT push, merge, tag, or delete branches — the conductor
does that. Commit to this branch and write your report.

## The observation

Three times tonight, in three different places, the same call site threw:

```
error: OpenPty F_SETFL failed with errno 9      <- unit test, PtyTestDriver.test.ts
error: OpenPty F_SETFL failed with errno 11     <- smoke-mode-coherence-harness.ts
error: OpenPty F_SETFL failed with errno 9      <- bun test, reported by another builder earlier
  at establishBlockingReadState (src/modules/terminal/OpenPty.ts:236)
  at onData (src/modules/terminal/OpenPty.ts:147)
  at new $PtyTestDriver (scripts/harness/PtyTestDriver.ts:108)
```

Each time it disappeared on an isolated re-run (mode-coherence: 3/3 clean; `bun test`: 1489/1489
clean). It correlates with machine load. It has been written off as an "infrastructure flake" twice.
**It is not a flake, and the errnos are the evidence.**

Runtime: `Bun v1.3.14 (Linux arm64)`.

## Why the errnos rule out the obvious explanations

`errno 9` is `EBADF`, `errno 11` is `EAGAIN`. Look at what `fcntl(fd, F_SETFL, flags)` can actually
return:

- It cannot return `EAGAIN` at all. `F_SETFL` does not block and has no reason to ask you to retry.
- `EBADF` means a bad descriptor — but the SAME descriptor succeeded through `F_GETFL` a few
  statements earlier in the constructor (`establishNonBlockingWrites` → `F_GETFL`, which throws its
  own distinct error and did not), and nothing between them is asynchronous. `PtyTestDriver`'s
  constructor calls `new OpenPty.Class(...)` and then `openPty.onData(...)` with only synchronous JS
  in between.

Two mutually-exclusive impossible errnos at one call site means **the reported errno does not belong
to the failing call, or the call is not being made the way the code thinks it is.** Everything
downstream of that has been diagnosed against a lie.

## The leading hypothesis — and it is falsifiable, so test it before believing it

**`fcntl` is a VARIADIC C function and it is being called through `bun:ffi` with a fixed signature.**

`int fcntl(int fd, int cmd, ... /* arg */);` — `fd` and `cmd` are named, the third argument is
variadic. Under AAPCS64 (Linux arm64, which is what this machine is), arguments **after the last
named parameter of a variadic function are passed on the stack**, not in registers. A fixed-signature
FFI declaration passes the third argument in `x2`. The callee then reads its flags from wherever the
stack happens to point.

This hypothesis predicts, specifically:

1. **`F_GETFL` is reliable and `F_SETFL` is not** — because `F_GETFL` ignores the third argument
   entirely, so garbage there is harmless, while `F_SETFL` consumes it. That asymmetry is exactly
   what all three failures show.
2. **The errno is arbitrary** — whatever the kernel makes of garbage flags — which explains two
   incompatible errnos.
3. **It is load-correlated but not load-caused** — stack contents differ with what ran before, and a
   loaded machine changes scheduling and therefore stack residue.
4. **It should also be able to SUCCEED WRONGLY** — setting flags nobody asked for, with no error at
   all. This is the dangerous prediction, and the reason this is not merely a test-flake ticket.

### The decisive test (do this first, before any fix)

Write a throwaway probe — not a committed test — that calls the FFI `fcntl` in a tight loop on a real
pty master fd: N iterations of `F_GETFL`, N of `F_SETFL` with a known flag value, and after each
`F_SETFL` read the flags back with `F_GETFL` and compare against what you asked for. Report:

- failure counts for each command;
- every distinct errno seen;
- **how often `F_SETFL` returned success but the read-back flags differ from the requested flags.**

That last number is the one that settles it. If it is non-zero, the variadic-ABI hypothesis is
confirmed and the bug is a silent corruption, not just an exception.

Run the probe under load too (start a `bun test` alongside) since the failures correlate with it.

### Rival hypotheses — reconstruct at least the strongest before concluding

Do not stop at the first hypothesis that fits; it is mine and I am not measuring.

- **Stale errno read.** `currentErrno()` reads `__errno_location()` in a separate FFI call. If
  anything between the `fcntl` and that read touches errno (the FFI trampoline, an allocation, GC),
  the reported number is unrelated noise — and the real failure reason is unknown. Test: capture
  errno with the tightest possible coupling and see whether the values become consistent. Note this
  hypothesis and the variadic one are NOT exclusive; both can be true, and the stale-errno one would
  have hidden the variadic one.
- **fd lifetime.** Something really is closing the descriptor. Test by asserting the fd is valid
  (`F_GETFL` succeeds) immediately before the failing `F_SETFL`, in the same function.
- **fd exhaustion under load.** `openpty` succeeding while the process is near its descriptor limit.
  Test by recording `ls /proc/self/fd | wc -l` at construction and correlating with failures.

Rank them by what your probe actually shows, and say which you eliminated and how.

## Why this is a product bug, not a harness bug

`OpenPty` is the integrated terminal's descriptor. The failing path is
`onData` → `establishBlockingReadState`, which runs when the app registers its terminal read
callback — the real startup path, not a test-only one. If flags can be set to garbage without an
error, the app's terminal can end up in the wrong blocking mode, and the recorded invariant
*Shared PTY writes never block the event loop* ([src/modules/terminal/terminal.invariants.md](../../../../src/modules/terminal/terminal.invariants.md))
depends on those exact flags being what was requested. Read that record; it was written after a real
freeze risk (#81) in this same shared-flag design.

Also note the design tension #81 already surfaced and did not remove: **one descriptor, one flag
set, two conflicting requirements** — non-blocking for writes, blocking for reads. Every
`establishNonBlockingWriteState` / `establishBlockingReadState` pair is toggling a shared flag. If
your investigation shows that toggling is itself the fragile part, say so; a fix that makes the
toggle correct is good, a reduction that removes the need to toggle is better.

## The fix

Only after the probe. Whatever you choose, it must satisfy:

- **The flags actually set must be verifiable.** Read back and check, at least in a test with a
  positive control (request a known-wrong value, require the check to catch it). A check that cannot
  fail is the class of defect this project keeps finding.
- **No silent tolerance.** Do not "handle" `EBADF`/`EAGAIN` by ignoring it — that converts a
  corruption into silence. If a genuinely-benign case exists (the pty is already closed), guard it by
  asking "are we still open?" using state we own, not by matching an errno.
- If the honest fix needs a capability `bun:ffi` does not offer, say so plainly and propose the
  alternatives with their costs, rather than shipping something that appears to work.

## Verification — exact exit codes, never a log tail

- `bunx tsc --noEmit`, `bun test`, `bun scripts/check-file-grammar.ts`, both invariant checker passes,
  `bash scripts/conventions-gate.sh`, `bun scripts/check-coverage-ratchet.ts`,
  `bash scripts/behavioral-contracts.sh`.
- The instrument that matters most: **run `bun test` and `smoke-mode-coherence-harness.ts` repeatedly
  under deliberate load** (two concurrent `bun test` runs alongside) and report the failure rate
  before and after your change, with iteration counts. A single clean run proves nothing here — the
  defect's whole signature is that it passes when you look at it.
- Declare any assertion/wait count movement in [project.coverage-deltas.md](../../../../project.coverage-deltas.md) with the counted grammar.

## Coordination

Two other builders are live: `src/modules/keybindings/`, `src/modules/app/Bootstrap.ts`,
`HandlerGuard.ts`, `src/modules/commands/CommandDefaults.ts` belong to the keyboard builder;
`/tmp/conductor-latency` is bisecting an input-latency regression and is measuring timings — **your
under-load runs will perturb its measurements, so note in your report roughly when you ran them** so
we can correlate if its numbers look odd. `src/modules/terminal/` is yours.

## Report to /tmp/openpty-fcntl-READY.md

The probe results (failure counts per command, distinct errnos, and the success-but-wrong-flags
count); which hypothesis survived and how you eliminated the others; the mechanism; the fix and why
it cannot silently tolerate corruption; the before/after failure rates under load with iteration
counts; and exact exit codes.
