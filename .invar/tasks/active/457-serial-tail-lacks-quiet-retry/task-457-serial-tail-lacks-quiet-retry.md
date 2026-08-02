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
