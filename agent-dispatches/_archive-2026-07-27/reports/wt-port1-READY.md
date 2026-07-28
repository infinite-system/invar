# Wave 1 editor/UI smoke-port handoff

Tip SHA: `9faf405b415143fe303568e4473b663b4122c68b`

Branch: `port-smokes-wave1-editor-ui`

## PTY harness stability

Each port ran alone for five consecutive runs after its final behavior-affecting edit.

| Smoke | Consecutive solo result |
|---|---:|
| editor | 5/5 ALL-PASS |
| find | 5/5 ALL-PASS |
| comment-styling | 5/5 ALL-PASS |
| bracket-match | 5/5 ALL-PASS |
| indent-guides | 5/5 ALL-PASS |
| move-line | 5/5 ALL-PASS |
| word-delete | 5/5 ALL-PASS |
| paste | 5/5 ALL-PASS |
| tabs | 5/5 ALL-PASS |
| workspace-tabs | 5/5 ALL-PASS |
| mode-coherence | 5/5 ALL-PASS |

Skips: none.

All 11 untouched tmux originals also ran once and exited 0 with their ALL-PASS verdicts. A diff
against the original scripts is empty, and all originals remain registered beside their additive
harness ports in `scripts/merge-gate.sh`.

## Latency gate

Design:

- `scripts/harness/input-byte-flush-gate.ts` launches
  `scripts/harness/measure-input-byte-flush.ts` in five independent sessions.
- It takes the median of the five session p50 values and the median of the five session p95 values.
- It rejects a measurement/baseline boundary mismatch.
- The reviewed machine-readable baseline is p50 `2.97 ms` at
  `input-write→DEC-2026-end-marker-byte-arrival`.
- WARN is non-blocking above `3.861 ms` (`baseline×1.3`); FAIL exits non-zero above `5.940 ms`
  (`baseline×2`).
- Each run appends `{sha, timestamp, p50Milliseconds, p95Milliseconds, boundary}` to the ignored
  `.perf-history/input-byte-flush.ndjson`.
- The merge-gate reporting step is outside both `FAST` and `SKIP_PERF`, so neither skips it, and
  successful p50/p95/boundary output remains visible in the gate log.
- Measurement history never edits the baseline. Baseline changes require an explicit landing diff
  to the JSON block in `project.performance-baselines.md`.

Standalone normal run:

```text
session p50s: 2.402, 2.296, 2.204, 2.299, 2.262 ms
session p95s: 3.329, 14.506, 18.293, 2.932, 8.304 ms
input-byte-flush-gate: p50 2.296 ms, p95 8.304 ms
boundary input-write→DEC-2026-end-marker-byte-arrival
baseline p50 2.970 ms; WARN > 3.861 ms; FAIL > 5.940 ms
input-byte-flush-gate: PASS
```

Simulated-failure run using the test-only
`INPUT_BYTE_FLUSH_BASELINE_P50_MILLISECONDS=0` override:

```text
input-byte-flush-gate: p50 2.351 ms, p95 3.223 ms
reviewed comparison value 0.000 ms; WARN > 0.000 ms; FAIL > 0.000 ms
input-byte-flush-gate: FAIL p50 2.351 ms exceeds baseline×2
SIMULATED_EXIT=1
```

The checked-in baseline remained `2.97 ms`.

## CPU comparison

Measured with `/usr/bin/time -v` on the four requested commands.

| Smoke | Variant | Wall | User (s) | System (s) | User+system (s) | Max RSS (kB) |
|---|---|---:|---:|---:|---:|---:|
| editor | PTY harness | 0:10.61 | 2.04 | 0.71 | 2.75 | 250,376 |
| editor | tmux | 0:33.49 | 1.73 | 1.48 | 3.21 | 44,160 |
| tabs | PTY harness | 0:00.92 | 0.71 | 0.25 | 0.96 | 256,640 |
| tabs | tmux | 0:12.36 | 0.73 | 0.59 | 1.32 | 43,264 |

Scope note: `/usr/bin/time` reports the directly launched process. The harness figure includes its
in-process terminal emulator, while the tmux shell figure does not aggregate RSS from the tmux
server/application child process. Wall and CPU figures are directly useful; RSS is command-scope,
not a whole-process-tree comparison.

## Verification

- `bunx tsc --noEmit`: PASS
- `bun test`: 819 pass, 0 fail, 12,820 expectations across 108 files
- `bash scripts/conventions-gate.sh`: PASS
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all`: PASS
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs`: 0 problems
- 11 harness ports: 5/5 consecutive solo ALL-PASS each
- 11 tmux originals: ALL-PASS once each
- Latency standalone normal path: PASS
- Latency simulated failure path: exit 1
- Full merge gate: intentionally not run, per task instruction

## Files changed

- `.gitignore`
- `project.performance-baselines.md`
- `scripts/merge-gate.sh`
- `scripts/harness/HarnessInput.ts`
- `scripts/harness/HarnessSmokeSupport.ts`
- `scripts/harness/PtyTestDriver.test.ts`
- `scripts/harness/PtyTestDriver.ts`
- `scripts/harness/harness.invariants.md`
- `scripts/harness/input-byte-flush-gate.ts`
- `scripts/harness/measure-input-byte-flush.ts`
- `scripts/harness/smoke-editor-harness.ts`
- `scripts/harness/smoke-find-harness.ts`
- `scripts/harness/smoke-comment-styling-harness.ts`
- `scripts/harness/smoke-bracket-match-harness.ts`
- `scripts/harness/smoke-indent-guides-harness.ts`
- `scripts/harness/smoke-move-line-harness.ts`
- `scripts/harness/smoke-word-delete-harness.ts`
- `scripts/harness/smoke-paste-harness.ts`
- `scripts/harness/smoke-tabs-harness.ts`
- `scripts/harness/smoke-workspace-tabs-harness.ts`
- `scripts/harness/smoke-mode-coherence-harness.ts`

`TASK.md` remains the original untracked task handoff and was not included in the commit.
