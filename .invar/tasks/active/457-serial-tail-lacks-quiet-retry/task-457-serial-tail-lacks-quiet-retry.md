# #457 — the gate's serial tail has no quiet retry, so load-induced timeouts block landings

Priority: verification-integrity
State: ACTIVE
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high

## In plain words

The gate gives a smoke that times out under load one quiet second
chance. Jobs in the final serial stage do not get that chance. So a
timeout caused by the machine being busy reads as a real failure and
blocks the merge, and the only way past it is to run the whole gate
again.

## The evidence

Gate 3 on the #452 stack (`/tmp/gate-stack3.log`, commit `4d540c01`)
returned `GATE_EXIT=1` with exactly one red:

```text
FAIL  behavioral-contracts (felt invariants)
error: Timed out waiting for grid condition:
       the structure scrollbar publishes its settled dock-height geometry
```

Run alone on the SAME commit, quiet, it is `ALL-PASS`. Its inner smoke
`smoke-plugin-manifest-harness` also passes alone on the stack AND on
main. So the failure is starvation-class, not a defect in the product.

The parallel pool already knows how to handle this. From the same log:

```text
RETRY smoke: editor harness — timeout-class failure; one quiet retry
OK    smoke: editor harness (clean on retry; first attempt was
      starvation-class)
```

`serial_smoke` (scripts/merge-gate.sh, the `behavioral-contracts` line
near 1067) has no equivalent path.

## Why this matters more than one lost gate run

A red that a re-run clears trains the reader to re-run reds. That is
the habit the whole gate exists to prevent, and doctrine names it
explicitly as never acceptable. The instrument should not be the thing
teaching it. Right now the only honest options for a starvation-class
serial red are a full re-gate (about ten minutes) or a written
override, and the override wording is reserved for PRE-EXISTING reds,
which this is not. So the gate has a failure mode with no honest cheap
answer.

## What to build

Give the serial tail the same one-quiet-retry the parallel pool has,
with the same discipline:

- Retry ONLY timeout-class failures. An assertion failure must never
  be retried — it is a verdict, not a stall.
- Preserve the first attempt's log, exactly as the pool does.
- Say in the output that a retry happened and that the first attempt
  was starvation-class, so a reader can never mistake a retried pass
  for a clean one.

## Both arms

- Positive: force a timeout-class failure in a serial job and prove
  the retry fires and reports itself.
- Negative: force an ASSERTION failure in a serial job and prove the
  retry does NOT fire and the gate stays red.

A retry that also rescues real failures is worse than no retry.

## Invariants in scope

- [The harness contract](../../../../scripts/harness/harness.invariants.md)
  — `Harness waits observe conditions not frame ordinals`. Do not
  widen any wait to fix this. The wait is correct; the machine was
  busy.
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. Write the
`## Bycatch` section even if it reads `None observed`.

## Second data point, same evening — this is wider than the serial tail

Gate 4, same commit `4d540c01`, again exactly one red — a DIFFERENT
one, and this time from the parallel pool, with no RETRY line:

```text
FAIL  smoke: terminal harness
error: FAIL real tasks:watch produced no blank or partial
       completed frame (16 outer frames)
```

Run alone on the same commit, twice: PASS both times.

So across two consecutive gates on one unchanged tree:

| gate | single red | quiet re-run, same commit |
|---|---|---|
| 3 | behavioral-contracts (serial tail) | ALL-PASS |
| 4 | terminal harness (parallel pool) | PASS twice |

The machine was NOT loaded: load average 1.77 on 16 cores. So the
contention is INSIDE the gate — six concurrent PTY app instances — not
from other work on the box.

Two consequences the original task did not capture:

1. **The parallel pool's retry did not fire here.** It is scoped to
   timeout-class failures, and this red is an ASSERTION failure whose
   assertion happens to be load-bound. So the retry cannot help, and
   should not be widened to help — retrying assertion failures is the
   thing that must never happen.

2. **The real defect is the load-bound assertion itself.**
   `no blank or partial completed frame (16 outer frames)` is a verdict
   about frames observed in a window, so a busy gate changes the
   answer. Doctrine is explicit: replace load-bound verdicts, block on
   ordering or work counts, keep durations report-only. Widening the
   frame budget converts the defect into a slower version of itself.

So the work splits in two: give the serial tail the same
timeout-class-only retry (the original task), AND census the blocking
smokes for assertions whose verdict can change with machine load,
converting them to count- or ordering-based claims. The gate already
has a `smoke timing classification` step that inspects sources for
duration and frame-silence assertions and passed 69 sources — it did
not catch this one, so that matcher has a blind spot worth naming.

**Standing evidence for the next conductor:** a gate that returns a
different single red each run, each quiet-green on the same commit, is
reporting its own contention, not the product. Do not re-run for a
green — diagnose, then change the causal condition (worker count) so
the next run is an experiment rather than a lottery.
