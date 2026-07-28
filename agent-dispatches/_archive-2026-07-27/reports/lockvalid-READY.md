# READY — #147 quiet-lock measurement validity

Commit: `7a9a7f0 Make contended latency measurements invalid`

## Result

- Quiet-lock degradation now carries its cause, configured and actual wait,
  and holder names into the child environment.
- `input-byte-flush-gate.ts` checks that evidence before starting any session.
  A degraded lock exits 2 with `MEASUREMENT INVALID`, prints no latency datum,
  and cannot reach the NDJSON append.
- Failure output now distinguishes `MEASUREMENT INVALID`,
  `MEASUREMENT TOO SLOW`, and `DRIVEN BEHAVIOUR WRONG`.
- The merge-gate step is now neutrally named
  `input byte flush measurement (5-session median)`.
- The harness contract records result-local lock validity and the timing
  asymmetry exception described below.
- Contended data is dropped rather than tagged because abandoning before the
  first session guarantees that no existing or future history consumer can
  accidentally treat it as comparable.

## Reproduction

Before the fix, a real second process held a custom quiet-exclusive lock while
the step exhausted a 0.1-second bounded acquisition:

```text
STEP_EXIT=0
HISTORY_BEFORE=0
HISTORY_AFTER=1
QUIET-LOCK WARNING: 'input-byte-flush reproduction' waited 104 ms for quiet-exclusive; holders: reproduction holder (pid 2070685, quiet-exclusive). Proceeding unlocked so scheduling cannot wedge the machine.
  session 1/5: p50 2.463 ms, p95 2.827 ms
...
input-byte-flush-gate: p50 2.359 ms, p95 2.827 ms, boundary input-write→DEC-2026-end-marker-byte-arrival
  history appended: .perf-history/input-byte-flush.ndjson (f9118a9c3ffb85f35d8070266d22b2bd2790cd25)
input-byte-flush-gate: PASS
```

The separate baseline functional plant also reproduced the fused verdict:

```text
FUNCTIONAL_BASELINE_EXIT=1
error: Input-byte-flush session 1 failed with exit 1
error: Measured Right press 1 did not move the terminal cursor
```

## Required positive controls

Contended lock after the fix:

```text
HELD_LOCK_EXIT=2
HOLDER_EXIT=0
HISTORY_BEFORE=2
HISTORY_AFTER=2
QUIET-LOCK WARNING: 'input-byte-flush final held control' waited 109 ms for quiet-exclusive; holders: final positive-control holder (pid 2106762, quiet-exclusive). Proceeding unlocked so scheduling cannot wedge the machine.
input-byte-flush-gate: MEASUREMENT INVALID — measurement abandoned — quiet lock unavailable after 0.1 s (waited 109 ms), holders: final positive-control holder (pid 2106762, quiet-exclusive)
```

No `session`, p50, p95, boundary, PASS, or history-append line followed.

Functional assertion plant after the fix, under a genuinely acquired lock:

```text
FUNCTIONAL_CONTROL_EXIT=1
error: input-byte-flush-gate: DRIVEN BEHAVIOUR WRONG — session 1: Measured Right press 1 did not move the terminal cursor
```

The lock journal for that run recorded:

```text
acquired ... quiet-exclusive ... input-byte-flush-gate ... 4
released ... quiet-exclusive ... input-byte-flush-gate ... 4
```

The plant was removed before verification and commit.

Lock free:

```text
FREE_LOCK_EXIT=0
HISTORY_BEFORE=1
HISTORY_AFTER=2
  session 1/5: p50 5.562 ms, p95 10.849 ms
  session 2/5: p50 4.923 ms, p95 7.171 ms
  session 3/5: p50 4.707 ms, p95 7.228 ms
  session 4/5: p50 5.955 ms, p95 6.920 ms
  session 5/5: p50 5.111 ms, p95 7.433 ms
input-byte-flush-gate: p50 5.111 ms, p95 7.228 ms, boundary input-write→DEC-2026-end-marker-byte-arrival
input-byte-flush-gate: PASS
```

The ignored history file was absent on entry and was removed after the
controls, so the worktree retains no reproduction samples.

## Timing asymmetry

Contention does bias latency ceilings and minimum-progress checks toward false
failures. One existing contract breaks the proposed universal asymmetry:
`idle-quiescence` requires a completed-frame delta `<= 1` over a fixed
interval. Contention can suppress a defective busy loop and create a false
pass. The harness contract now names this exception, so degraded green results
are not treated as universally trustworthy.

## Final verification on committed bytes

```text
bunx tsc --noEmit
TSC_EXIT=0

bun test
BUN_TEST_EXIT=0
1663 pass
0 fail

bash scripts/conventions-gate.sh
CONVENTIONS_EXIT=0

node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs
INVARIANTS_EXIT=0
876 annotations resolved, 67 lattice links resolved, 0 problems

bun scripts/check-coverage-ratchet.ts
COVERAGE_EXIT=0
coverage ratchet: inspected 309 files; no undeclared decrease against f9118a9
```

Scale parity is not applicable: this change is in process scheduling and
measurement verdict plumbing, not a per-row, per-item, or per-frame app path.

## Bycatch

None.

---

# READY — ROUND 2 scroll-instrument investigation

Current HEAD: `b4eba5dd1ccb948def77d9cd455133b8edfa82a6`

## Result

No round-2 code change or empty commit was made.

The preserved red artifacts are real, but the checkout changed after they
were produced. `artifacts/scroll-smoothness.log` is timestamped 10:08 and
records the reported `3->2` continuation boundary. At 10:21 this branch
merged `origin/main`, including `8a98e7d Fix the glide minimum dead zone`.
That commit changes `Momentum.addImpulse`, so the current checkout no longer
has the task's stated property that it does not touch scroll.

On the current integrated bytes:

- The exact glide instrument passed over editor and diff at 2,000, 26,635,
  and 100,000 lines. Continuation fingerprints were `2->3`, `2->2`, and
  `1->2`; the 2,000/100,000 frame-work ratios were exactly 1.
- The exact fold-dense instrument passed at 100,000 lines with the measured
  top reference. The depth checkpoint travelled 1,001 rows at 30.0 FPS,
  ratio 1.021.
- An environment probe through `scripts/quiet-lock.sh` on this branch and
  `/home/parallels/dev/tui-editor` at `origin/main` produced an empty diff.
  Both instrument environments contained the supplied
  `SMOOTHNESS_DEPTH_REFERENCE_FPS=29.625` and the same acquired-lock state.

This falsifies the missing-environment hypothesis. The fold-dense error was
downstream: the failed glide never assigned
`smooth_100k_top_reference_fps`, so the deliberate `0` fallback reached the
second instrument and was correctly rejected.

The existing glide contract already detects the reported `3->2` symptom, so
adding another assertion would duplicate the same generator. Three
end-to-end repetitions now pass. Manufacturing a second fix or an empty
commit would erase the evidence that the task state was superseded.

## Direct instruments

```text
GLIDE_EXIT=0
editor continuation requested=200ms actual=209.3ms frames=14->15 rows=2->3
editor continuation requested=250ms actual=276.4ms frames=24->25 rows=2->2
editor continuation requested=300ms actual=309.3ms frames=35->36 rows=1->2
2k/100k ratios: reads=1, fold=1, wrap=1, layout=1

REFERENCE_FPS=29.413051
FOLD_DENSE_EXIT=0
depth 75000: rows=1001, FPS=30.0, ratio=1.021, PASS
```

## Required behavioral repetitions

```text
BEHAVIORAL_1_EXIT=0
live-glide delays=210.0..309.7ms, minimum row-count margin=0
fold-dense rows=1000, slowest=30.0fps
behavioral-contracts: ALL-PASS

BEHAVIORAL_2_EXIT=0
live-glide delays=209.3..321.2ms, minimum row-count margin=0
fold-dense rows=1000, slowest=30.0fps
behavioral-contracts: ALL-PASS

BEHAVIORAL_3_EXIT=0
live-glide delays=214.0..312.4ms, minimum row-count margin=0
fold-dense rows=1000, slowest=30.0fps
behavioral-contracts: ALL-PASS
```

## Round-1 positive controls

Contended lock, using a second process and a 0.1-second bounded acquisition:

```text
HELD_CONTROL_EXIT=2
HOLDER_EXIT=0
input-byte-flush-gate: MEASUREMENT INVALID — measurement abandoned —
quiet lock unavailable after 0.1 s (waited 116 ms), holders:
round-2 held-lock control holder
UNEXPECTED_MEASUREMENT_OUTPUT=0
```

Functional cursor-movement plant:

```text
FUNCTIONAL_CONTROL_EXIT=1
input-byte-flush-gate: DRIVEN BEHAVIOUR WRONG — session 1:
Measured Right press 1 did not move the terminal cursor
```

The plant was removed immediately. `git diff --check` exited 0 and the
worktree was clean before final verification.

## Final verification

```text
bunx tsc --noEmit
TSC_EXIT=0

bun test
BUN_TEST_EXIT=0
1665 pass
0 fail

bash scripts/conventions-gate.sh
CONVENTIONS_EXIT=0

node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs
INVARIANTS_EXIT=0
877 annotations resolved, 67 lattice links resolved, 0 problems

bun scripts/check-coverage-ratchet.ts
COVERAGE_EXIT=0
coverage ratchet: inspected 309 files; no undeclared decrease against 3f365c3
```

## Bycatch

None.
