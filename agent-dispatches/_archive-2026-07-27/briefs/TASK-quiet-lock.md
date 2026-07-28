# TASK — Machine-wide quiet lock for timing-sensitive smokes (#84)

You are a builder on the Invar terminal IDE. Work ONLY in `/tmp/conductor-quietlock`
(branch `feat-quiet-lock`, forked from main at `cefa8e5`). Do NOT run `scripts/merge-gate.sh`
end to end as a test; do NOT push/merge/tag/delete — the conductor lands it. Commit and report to
`/tmp/quiet-lock-READY.md`. Run `bun install --frozen-lockfile` first.

## The problem, with its measured history

Residual gate flakiness is DIFFUSE: ~15 different smokes, 1–2 retries each, different smoke each
time. Diffuse means a SHARED cause, not fifteen defects. The shared cause is timing overlap:
timing-sensitive work (the gate's quiet-serial tail, and ABSENCE assertions / timeout-bounded waits
anywhere) runs while OTHER work loads the machine — another gate's parallel pool, a builder's test
suite, a measurement script. Two retried-passes today (`agent-permissions`, `overlay-dialog`) and
one retried-fail were all this class.

## The reduction the conductor already did — the lock belongs to the SMOKE, not the gate

An earlier plan put the lock in `merge-gate.sh`. That is the wrong owner: builder agents run smokes
DIRECTLY (never through the gate), and they are the dominant load source. If the gate takes the lock
and builders do not, the lock protects against the rare case and misses the common one. So:

1. **One small acquisition primitive** (a shared helper, probably `scripts/harness/QuietLock.ts` +
   a shell equivalent or a tiny CLI wrapper so `.sh` smokes can use it): an OS-level lock (flock on
   a well-known path like `/tmp/invar-quiet.lock`) with two modes —
   - **quiet-exclusive**: timing-sensitive work; blocks until no loud holders, then excludes
     everyone.
   - **loud-shared**: ordinary load-generating work (parallel pool jobs, bun test); many may hold it
     concurrently; blocks only while a quiet-exclusive holder runs.
   This is a readers-writer lock with writers = quiet work. flock gives shared/exclusive natively.
2. **Who takes it**: the gate's quiet-serial tail takes quiet-exclusive ONCE around the tail (not
   per smoke — cheaper, and the tail is already serialized); the gate's parallel pool takes
   loud-shared; each timing-sensitive smoke ALSO takes quiet-exclusive itself when run standalone
   (so a builder running it directly gets the same protection — the helper must be re-entrant or
   no-op when the caller already holds it, or the tail would deadlock its own smokes).
3. **Liveness over correctness of exclusion**: a crashed holder must not wedge the machine — flock
   released on process death gives this for free; do NOT build a pid-file lock. A quiet-exclusive
   acquisition that waits too long (say > 120 s) should proceed with a LOUD warning naming the
   holders rather than fail — a stuck lock must degrade to today's behavior, not to a new failure
   mode. Log acquisition/release with holder names to a small journal so contention is diagnosable.
4. **Positive control**: a test that takes loud-shared in a child process, starts a quiet-exclusive
   acquisition, and proves it BLOCKS until release — plus the degrade path (holder that never
   releases → warning + proceed). A lock that silently no-ops looks exactly like a lock that works
   on a quiet machine.

## What NOT to do

- Do not serialize the parallel pool against itself (loud-shared holders must not block each other).
- Do not add the lock to unit tests (`bun test`) as a taker of quiet-exclusive — they are loud-shared
  at most.
- Do not make any smoke's ASSERTIONS weaker. The lock is scheduling, not tolerance.
- Do not build config/env knobs beyond one opt-out (`INVAR_QUIET_LOCK=0`) for debugging.

## Verification — exact exit codes

- Full checker suite as usual.
- The positive-control test above, in the suite.
- **The real proof**: run the gate's quiet-tail smokes (behavioral-contracts) while a deliberately
  loud process holds loud-shared, and show the tail WAITED (journal timestamps) and passed; then run
  two concurrent gate-shaped loads (a parallel pool via INVAR_GATE_WORKERS=3 subset if feasible, or
  two bun-test runs) against a quiet-exclusive smoke and show serialization in the journal. Report
  wall-clock cost added to a solo gate run (should be ~0 when nothing contends).
- Declare coverage movement (counted grammar, APPEND).
- Record the invariant: *Timing-sensitive smokes run on a machine-wide quiet lock* — Scope,
  Impossible-if-true (a quiet-tail smoke and a loud pool job holding the lock simultaneously; a
  crashed holder wedging acquisition forever), Rejected-alternatives (gate-level lock: builders
  bypass it; pid-file lock: dies dirty).

## Rules

Full descriptive names, 80 columns, ivue conventions where applicable, no `Class.prototype` reads.
Tab indents in the editor; host focus chord is Ctrl+Shift+J. Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>`; clean tree; no TASK files
tracked.
