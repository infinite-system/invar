# Task 2 READY — measurement boundaries, tab gaps, and corrected baselines

## Tip

`98a84a71f1b5844beb22d7b91a9f1c4b22d6a618`

Branch: `fix-tabbar-gap-and-latency-proxy`

Commits:

- `870568d` — `perf(ui): collapse tab bar gap chunks`
- `98a84a7` — `fix(harness): separate frame timing boundaries`

No push, merge, branch deletion, or merge-gate run was performed.

## Boundary-split design

`SynchronizedOutputQuiescence` now creates a `CompletedSynchronizedFrame` at the exact DEC private
mode 2026 end-marker observation. The record carries:

- completed frame count;
- `performance.now()` byte-arrival timestamp;
- raw observed-byte count at the marker.

The timestamp is captured inside `observeByte`, before the `OpenPty.onData` callback proceeds to
`TerminalEmulator.write`. `PtyTestDriver.sendKeysAndAwaitFrameByteArrival` registers its target
frame waiter before writing input and computes input-write-start → marker-byte-arrival from the
recorded timestamp. `PtyTestDriver.awaitQuiescence` retains its existing smoke semantics: wait for
the complete synchronized frame, then flush `TerminalEmulator` so the screen oracle is consistent.

`PtyTestDriver.assertNoCompleteFrameEmittedFor` is the new marker-silence idle helper. It fails if a
complete paired frame arrives during the requested interval, propagates child/scanner failure, and
does not treat ordinary non-frame bytes as a frame.

`scripts/harness/measure-input-byte-flush.ts` drives the real isolated one-file user path through
`PtyTestDriver` and reports three explicitly named values:

1. input write start → DEC 2026 end-marker byte arrival;
2. input write start → settled `TerminalEmulator` snapshot;
3. marker byte arrival → settled `TerminalEmulator` snapshot.

The recorded-stream unit test fixes the split with an injected clock: marker arrival remains 7 ms
even after simulated downstream oracle work advances the clock to 21 ms.

## Measurement results

Investigation taxonomy recorded in `project.performance-baselines.md`:

| Boundary | Earlier endpoint | 2026-07-24 endpoint |
|---|---:|---:|
| Input send → status publication observed, 1 ms poll | 6 ms p50 | 8 ms p50 |
| Input write → raw DEC end-marker byte arrival | 1.769 ms p50 | 2.973 ms p50 |
| Input write → settled harness oracle | not retained | 16–17 ms p50 |

The true feature-era raw-byte residual is +1.204 ms. The 28 ms status-proxy/frame-quantization
narrative and the 16 ms real-byte-regression narrative are explicitly retired.

Controlled same-tool tab-gap comparison, five serial sessions of 20 valid alternating cursor
presses:

| Source form | Session p50s | Median |
|---|---|---:|
| Pre-gap per-cell chunks | 2.541, 2.562, 3.041, 2.709, 2.373 ms | **2.562 ms** |
| One gap chunk on final tip | 2.359, 2.283, 2.670, 2.422, 2.455 ms | **2.422 ms** |

The 0.140 ms difference is within session variance. The tab change removes O(terminal-width)
styled allocations; it is not presented as a regression fix. Every final-tip measurement reported
an 87-byte median differential frame.

## Files changed

- `src/modules/ui/TabBarRenderer.ts`
  - Collapses each horizontal unused-width run into one styled chunk.
  - Preserves the same column advance and returned hit segments.
  - Adds the UI contract reverse pointer.
- `src/modules/ui/ui.invariants.md`
  - Adds `Tab bars share paint and hit geometry`.
- `scripts/harness/SynchronizedOutputQuiescence.ts`
  - Records marker byte-arrival timestamps and byte counts.
  - Returns completed-frame records.
  - Adds complete-frame silence assertions.
- `scripts/harness/SynchronizedOutputQuiescence.test.ts`
  - Adds recorded-stream boundary-split and marker-silence tests.
- `scripts/harness/PtyTestDriver.ts`
  - Exposes input-to-frame-byte-arrival measurement.
  - Exposes the marker-silence idle helper.
  - Keeps `awaitQuiescence` as the settled-screen oracle.
- `scripts/harness/measure-input-byte-flush.ts`
  - First-class real-PTY byte-flush measurement tool.
- `scripts/harness/harness.invariants.md`
  - Refines the synchronized-frame guarantee.
  - Adds `Latency measurements name their observation boundary`.
- `scripts/perf-baselines.sh`
  - Relabels the coarse metric as status publication and removes the false input-to-screen claim.
- `project.performance-baselines.md`
  - Records the three-boundary taxonomy, measured endpoint values, retired narratives, residual,
    and new-tool follow-up.

`TASK.md` and `TASK2.md` remain untracked task inputs and were not included in either commit.

## Verification transcript

- `bash scripts/smoke-tabs.sh`
  - ALL-PASS before the gap commit and again on final source.
  - FrameProbe located the right count badge; the badge click opened the dropdown.
  - The adjacent right-arrow click panned without changing the active tab.
- `bash scripts/smoke-workspace-tabs.sh`
  - ALL-PASS before the gap commit and again on final source.
  - Horizontal tabs painted/clicked correctly; top ↔ left ↔ top geometry remained correct.
- `bun test scripts/harness/SynchronizedOutputQuiescence.test.ts scripts/harness/PtyTestDriver.test.ts`
  - 8 pass, 0 fail.
- `bunx tsc --noEmit`
  - PASS.
- `bun test`
  - 819 pass, 0 fail, 12,819 expectations across 108 files.
- Harness smokes, five serial runs each:
  - `smoke-wrap-harness.ts`: 5/5 ALL-PASS.
  - `smoke-selection-harness.ts`: 5/5 ALL-PASS.
  - `smoke-scrollbars-harness.ts`: 5/5 ALL-PASS.
- `bun scripts/harness/measure-input-byte-flush.ts`, five serial final-tip runs:
  - byte-arrival session p50s 2.359, 2.283, 2.670, 2.422, 2.455 ms;
  - median session p50 2.422 ms;
  - median differential frame 87 bytes in every run.
- `bash -n scripts/perf-baselines.sh`
  - PASS.
- `bash scripts/conventions-gate.sh`
  - PASS.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  - 0 problems; 432 annotations and 39 lattice links resolved.

Conventions loaded from `project.conventions.md` at
`f5df4e0483d1a85f20a789e5bffe15a196c90448`.
