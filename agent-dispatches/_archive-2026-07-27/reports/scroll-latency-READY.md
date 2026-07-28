# Scroll latency and residual input latency — READY

## Outcome

Commit: `30f3445` (`fix(harness): ratchet reviewed input latency trends`)

The user's common-cost hypothesis is **not confirmed**.

- The original input-latency step is attributable to `3835318`
  (`fix(terminal): make OpenPty writes non-blocking`). Its first implementation
  copied every write into a queue and deferred the drain through
  `setTimeout(0)`. The timer clamp, not the small queue bookkeeping, was the
  material per-input cost.
- `3d3dcc0` moved the accepted-byte drain back into the calling tick.
  `b0ff3ea` is the final landed form. The production-cadence paired delta fell
  from a median **+1.970 ms** at `3835318` to about **+0.479 ms** at the inline
  drain.
- The alleged remaining ~1.7 ms was produced by comparing sequential,
  absolute sessions from different machine states. Sample-interleaved
  reference/candidate measurement puts task-base `d61124d` at a median
  **+0.552 ms**. Replacing the complete current queued-write seam with the
  pre-queue reference implementation still measured **+0.477 ms**. There is
  no residual queued-write mechanism to remove.
- Scroll input-to-first-frame latency and frame cadence are effectively flat
  between the reference and HEAD even though the historical absolute
  input-byte p50 rose. Scroll remains a separate, pre-existing finding:
  roughly **20 FPS** against the declared 30 FPS, with the second and later
  fling traveling 36 rows rather than the from-rest 48 because progressive
  impulse gain starts from decaying velocity.
- No `ScrollPhysics` constant or default changed.

## Paired bisect

Fixed reference: `0005fa0`, the 2026-07-25 00:24 sample's 2.3–2.9 ms era.
Each row launched reference and candidate together, alternated which process
received the next sample first, used the same one-byte input and byte-arrival
boundary, and held quiet-exclusive. Delta is the median of paired differences,
so it need not equal the difference between the two marginal medians.

The binary attribution ladder used 20 ms sample cadence uniformly on both
sides:

| Candidate | Reference p50 | Candidate p50 | Paired delta p50 | Load 1/5/15 |
|---|---:|---:|---:|---:|
| `7b21261` | 1.884 ms | 1.944 ms | +0.077 ms | 0.25/0.36/0.44 |
| `70a438b` | 1.831 ms | 1.985 ms | +0.174 ms | 0.25/0.36/0.44 |
| `4c31bee` | 1.721 ms | 2.043 ms | +0.317 ms | 0.56/0.42/0.46 |
| `a41e92b` | 1.749 ms | 2.068 ms | +0.289 ms | 0.51/0.41/0.46 |
| `a19819c` | 1.740 ms | 2.075 ms | +0.309 ms | 0.47/0.41/0.46 |
| `3835318` | 1.754 ms | 3.494 ms | **+1.623 ms** | 0.47/0.41/0.46 |

Production-cadence confirmation at the guilty boundary used 100 ms between
samples:

| Run | Reference p50 | `3835318` p50 | Paired delta p50 | Load 1/5/15 |
|---|---:|---:|---:|---:|
| 1 | 3.842 ms | 5.897 ms | +2.289 ms | 0.89/0.52/0.48 |
| 2 | 3.615 ms | 5.474 ms | +1.970 ms | 0.82/0.51/0.48 |
| 3 | 2.053 ms | 4.347 ms | +1.697 ms | 0.82/0.51/0.48 |
| Median | **3.615 ms** | **5.474 ms** | **+1.970 ms** | 0.82/0.51/0.48 |

Mechanism confirmation:

| Candidate/control | Reference p50 | Candidate p50 | Paired delta p50 | Load |
|---|---:|---:|---:|---:|
| `3835318`, deferred drain, 3 runs | 2.053–3.842 ms | 4.347–5.897 ms | **+1.970 ms median** | 0.82–0.89 / 0.51–0.52 / 0.48 |
| `3d3dcc0`, inline drain, 5 runs | 1.754–1.923 ms | 2.256–2.409 ms | **+0.479 ms median** | 0.92–1.33 first load |
| Task base `d61124d`, 5 runs | paired reference | paired candidate | **+0.552 ms median** | 0.74–0.87 / 0.46–0.50 |
| Task base with whole queued `OpenPty` seam deleted, 5 runs | paired reference | paired candidate | **+0.477 ms median** | 1.02–1.50 first load |
| Task base without write-status readback, 5 runs | paired reference | paired candidate | **+0.662 ms median** | quiet-exclusive |
| Task base without per-write flag switch, 5 runs | paired reference | paired candidate | **+0.660 ms median** | quiet-exclusive |

The five task-base paired deltas were +0.524, +0.480, +0.618, +0.552,
+0.587 ms. The complete queued-seam deletion deltas were +0.477, +0.470,
+0.526, +0.440, +0.585 ms.

The fresh direct task-base calibration further exposed the absolute-session
bimodality: 5.165, 4.794, 5.463, 2.733, and 3.313 ms at similar
0.23–0.53 first-load values. Its median was 4.794 ms, but two sessions occupied
the lower mode. Paired, sample-interleaved differences are therefore the
attribution evidence; absolute sessions remain gate calibration evidence.

Structural tracing found no new call-path cost from the other suspects:
quiescence observation and frame-expectation marking predate the reference,
and `ce49e02`'s duplicated read descriptor is construction-only. The
whole-write-seam deletion also removes those write-side queue operations as a
class and leaves the paired result unchanged.

## Scroll correlation

Both builds received the same twelve-notch gesture as **one PTY write**.
Each instrument run held quiet-exclusive. The first gesture is from rest; the
next two are follow-on flings.

| Build | Input-byte p50 | Notch-to-first-frame | FPS | Distance | Peak |
|---|---:|---:|---:|---:|---:|
| Reference `0005fa0`, first | historical 3.766 ms | 70.079 ms | 21.75 | 48 rows | 194 rows/s |
| Reference `0005fa0`, follow-on median | historical 3.766 ms | 65.711 ms | 19.80 | 36 rows | 140 rows/s |
| Task base/HEAD, first | gate 5.160 ms | 72.529 ms | 20.95 | 48 rows | 177 rows/s |
| Task base/HEAD, follow-on median | gate 5.160 ms | 55.010 ms | 19.63 | 36 rows | 144 rows/s |

Reference gesture first-frame values were 70.079, 67.964, and 63.458 ms.
HEAD values were 72.529, 54.301, and 55.719 ms. Reference FPS values were
21.75, 19.52, and 20.08; HEAD values were 20.95, 19.63, and 19.64.

The scroll boundary did not get slower with the input-byte absolute p50, and
both builds show the same 48/36-row first/follow-on split. The input regression
does not explain the user's remaining scroll feel. The residual is the known
separate cadence/progressive-gain behavior, not a hidden per-notch queue cost.

## Ratchet implemented

- Re-reviewed the baseline to **4.928 ms**, the median of ten history samples
  from the inline-drain fix through the task base. A fresh five-session
  quiet-lock calibration was 4.794 ms.
- Added a report-only trend detector. It compares the same-boundary median of
  five trailing samples with the reviewed era and emits
  `TREND WARN sustained shift across 5 samples` above 1.15 times baseline
  (5.667 ms). It does not block and cannot rewrite the baseline.
- Added a synthetic shifted-history positive control that requires the
  warning to name both the sustained shift and its exact timestamp span.
- The existing individual thresholds remain 1.3 times WARN and 2 times FAIL.
- Extended the scroll instrument to self-acquire quiet-exclusive and report
  input-write-to-first-frame latency.

## Verification and exact exits

| Command | Exit |
|---|---:|
| `bun install --frozen-lockfile` | 0 |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (entry) | 0 |
| `bun test scripts/harness/InputByteFlushTrend.test.ts` (run 1) | 0 |
| same positive-control suite (run 2) | 0 |
| same positive-control suite (run 3) | 0 |
| `bunx tsc --noEmit` | 0 |
| `bun scripts/check-file-grammar.ts` | 0 |
| `bun scripts/check-coverage-ratchet.ts` | 0 |
| `bash scripts/conventions-gate.sh` | 0 |
| `bun test` | 0 — 1,556 pass, 0 fail, 16,980 expectations |
| `bash scripts/behavioral-contracts.sh` | 0 — ALL-PASS |
| `bun scripts/harness/input-byte-flush-gate.ts` | 0 — PASS |
| zero-baseline failure control | 1 — expected FAIL after both passes |
| reference scroll instrument | 0 |
| HEAD scroll instrument | 0 |
| final invariant checker | 0 — 830 annotations, 0 problems |
| `git diff --check` | 0 |

No smoke file was changed, so the three-run touched-smoke requirement is not
applicable. The changed positive-control test was run three times, and the
real scroll path was driven on both builds. Coverage grew by five assertions
in the new test; the ratchet inspected 296 files and reported no undeclared
decrease against `d61124d`, so no decrease declaration was required.

Quiet-lock journal evidence includes:

- paired bisect acquired at 16:27:17;
- five paired HEAD sessions acquired at 16:30:18;
- inline-drain endpoint acquired at 16:36:28;
- pre-queue deletion control acquired at 16:37:07;
- HEAD scroll acquired at 16:45:44 after waiting 87,934 ms;
- reference scroll acquired at 16:49:15 after waiting 55,364 ms;
- input-byte gate acquired at 16:53:42.

All are recorded as `quiet-exclusive` with matching release entries in
`/tmp/invar-quiet-lock.journal`.

## Handoff state

- Branch: `fix-scroll-latency-residual`
- Commit: `30f3445`
- Repository worktree: clean
- Disposable detached measurement worktrees: removed
- No merge gate was run; no push, merge, tag, branch deletion, or
  `ScrollPhysics` tuning was performed.
