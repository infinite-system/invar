# Quiet lock READY

Commit: `9713814` (`feat-quiet-lock`)

## Result

Implemented one machine-wide readers-writer scheduling primitive on
`/tmp/invar-quiet.lock`:

- `loud-shared` permits concurrent load holders.
- `quiet-exclusive` waits for all load holders and excludes every other holder.
- The gate holds shared around `bun test` and its parallel smoke pool, then
  exclusive once around the complete quiet tail.
- Every registered timing-sensitive smoke and measurement also acquires
  exclusive when run directly. Inherited exclusive state is re-entrant.
- `INVAR_QUIET_LOCK=0` is the sole opt-out.
- Acquisition waits at most 120 seconds, then emits a loud warning naming
  journaled holders and proceeds unlocked.
- The OS owns liveness: file descriptors release `flock` on process death.
  `/tmp/invar-quiet-lock.journal` records waiting, acquisition, degradation,
  and release events and rotates from 400 to 200 lines.

## Positive controls

`bun test scripts/harness/QuietLock.test.ts`:

- exit `0`; 2 tests, 14 assertions.
- Two `loud-shared` holders overlapped.
- `quiet-exclusive` remained blocked until a child shared holder released.
- A 100 ms bounded wait against a holder that did not release emitted
  `QUIET-LOCK WARNING`, named `holder that never releases`, and proceeded.
- Killing that holder let the next exclusive acquisition succeed.

## Real contention proof

Behavioral quiet-tail smoke against a deliberate shared holder:

- Loud acquired: `2026-07-26T14:25:07.373-04:00`.
- Behavioral exclusive began waiting:
  `2026-07-26T14:25:07.423-04:00`.
- Loud released: `2026-07-26T14:25:11.382-04:00`.
- Behavioral acquired after `3964 ms`:
  `2026-07-26T14:25:11.390-04:00`.
- `scripts/behavioral-contracts.sh`: exit `0`, `ALL-PASS`.

Two concurrent gate-shaped loads against an exclusive smoke:

- Two complete `bun test` runs acquired shared at
  `14:27:45.774` and `14:27:45.776`; both passed 1,540 tests.
- Terminal-stage exclusive began waiting at `14:27:45.840`.
- Shared holders released at `14:27:56.751` and `14:27:56.839`.
- Terminal-stage acquired at `14:27:56.842` after `11003 ms`.
- `smoke-terminal-stage-harness.ts`: exit `0`, `ALL-PASS`.

The first attempt at this same load proof serialized correctly but the
terminal-stage smoke later timed out while reading the real readline buffer.
It passed immediately solo, and the complete contention proof above then
passed without changing or weakening an assertion.

Standalone input-byte measurement re-entry also passed with exit `0` and
journaled exclusive acquisition/release.

## Uncontended cost

Forty repetitions of the gate's three acquisition phases were compared with
the opt-out path:

- unlocked total: `6 ms`
- locked total: `1388 ms`
- added per solo gate shape: `34 ms` (effectively `0 s` at gate scale)

The prohibited end-to-end `scripts/merge-gate.sh` was not run.

## Contracts and coverage

Recorded the established chosen invariant:
`Timing-sensitive smokes run on a machine-wide quiet lock`.

- Scope covers the gate phases and every standalone timing-sensitive entry
  point.
- Impossible if true: a quiet and loud holder overlap, quiet holders overlap,
  shared holders serialize, or a crashed holder wedges acquisition forever.
- Rejected: gate-only ownership because direct builder smokes bypass it;
  PID-file locks because crashes leave dirty lock state.

Appended counted coverage movement:
`scripts/harness/QuietLock.test.ts` is new with 14 assertions and 2 waits.
The AST counter independently reported exactly `{ assertions: 14, waits: 2 }`.

## Final verification

All commands returned exact exit code `0`:

- frozen `bun install`
- Bash syntax checks for all touched shell entry points
- `bunx tsc --noEmit`
- full `bun test`: 1,540 passed, 0 failed, 16,912 assertions, 237 files
- `bun scripts/check-coverage-ratchet.ts`: 293 files, no undeclared decrease
- invariant checker `--all`
- invariant checker `--refs`: 819 annotations and 45 lattice links resolved,
  0 problems
- `bash scripts/conventions-gate.sh`
- `git diff --check`
- post-commit positive control, typecheck, and invariant checks

Working tree: clean. No TASK or READY file is tracked.
