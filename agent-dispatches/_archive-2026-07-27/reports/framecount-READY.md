# READY — #155 (convert the gate to frame-count mode)

## Pre-edit census and classification

Recorded before changing source. The ten clock-shaped references in
`scripts/behavioral-contracts.sh` are not one population:

| Source line at task base | Reference | Class | Property and action |
| ---: | --- | :---: | --- |
| 171 | `maximumGlideDurationMilliseconds` | (a) configured input | Confirms the three selected settings reached the instrument. Keep: the verdict is one impulse and at least one row at each configured value. |
| 294 | `actualDelayMilliseconds` | (b) measured duration | Stood in for “the follow-on input is placed late in a still-live glide.” Replace the `> 150` threshold with ordering/count evidence: minimum observed moving-frame count, a one-row pre-boundary crossing, and a non-decreasing boundary crossing. |
| 305 | `actualDelayMilliseconds` | (b) measured duration | Reported the same continuation placement. Report moving-frame and frame-boundary counts instead; no duration participates in the verdict. |
| 505 | `actualPauseBeforeMilliseconds` | (b) measured duration | Stood in for “flicks two and three each follow an earlier flick.” Replace with strictly increasing completed-frame boundaries and keep the rising four-frame peak sequence as the behavioral verdict. |
| 507 | `actualPauseBeforeMilliseconds` | (b) measured duration | Filtered the same predecessor population. Replace with count/order over preceding completed frames; no measured pause participates in the verdict. |
| 551 | `maximumGlideDurationMilliseconds` | (a) configured input | Declared cap used to derive the rapid-ceiling whole-row travel floor. Keep: this is an input to a count bound, not an elapsed-time assertion. |
| 552 | `glideCapEasingDurationMilliseconds` | (a) configured input | Declared easing window used to derive the same whole-row travel floor. Keep for the same reason. |
| 841 | `completedFrameGapSequenceMilliseconds` | (b) measured duration | Reported starvation as the largest elapsed gap. Replace with completed-frame counts per input window and consecutive zero-frame-window count; the blocking predicate already requires every window’s count to be nonzero. |
| 924 | `actualInputDurationMilliseconds` | (b) measured duration | Reported whether the real-rate burst was delivered. Replace with input-window, event, impulse, and projection counts; these state whether all scheduled input joined the one animation owner without using elapsed delivery time. |
| 934 | `maximumAnimationDeltaTimeSeconds` | (a) configured input | Declared integrator cap used to derive the maximum allowed row-count difference across document scales. Keep: it derives a count bound and does not assert measured elapsed time. |

No class-(c) reference survives: none of the ten is inherently a duration that
must remain in the blocking verdict. Diagnostic millisecond series may remain
report-only.

## Baseline drive

- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  exited 0: 884 annotations resolved, 67 lattice links resolved, 0 problems.
- Initial `bun run drive` and `bun run drive --size 100000` both exited 1
  before the application was ready while the fresh worktree was still resolving
  SDK packages. This is setup failure, not behavioral evidence; `bun install
  --frozen-lockfile` then completed successfully.
- After the frozen install, `bun run drive` and
  `bun run drive --size 100000` both exited 0 with `ready=true` and
  `renderQuiescent=true`.

## Outcome

Committed on `fix-gate-frame-count` as `2104b3f` (`Convert blocking gate
checks to frame ordering and counts`).

Blocking authority is now ordering and count based:

- Input-byte flush requires every inserted glyph to be present in the first
  completed DEC 2026 frame after its input byte.
- Glide continuation uses observed moving-frame counts and the row-crossing
  order across the input boundary.
- Accumulation requires strictly increasing completed-frame boundaries across
  the three flicks.
- Render progress requires a nonzero completed-frame count in every input
  window.
- Real-rate input uses window, event, impulse, projection, and row counts.
- Terminal reduced motion requires a complete command in its first typing
  frame; slow typing must span more completed frames than fast typing.
- The diff and fold-dense FPS canaries still report, but call `warn` and never
  control the behavioral exit.
- Inline Rewrite's old duration windows now check explicit
  `renderQuiescent` ownership and request counts.

The task premise was narrower than the code. Input-byte flush was the remaining
quiet-lock threshold, but it was not literally the only blocking clock
predicate: terminal-stage still compared `<1000 ms` and `fast + 400 ms`, the
behavioral gate had two blocking FPS floors, and Inline Rewrite used fixed
absence windows. Those blockers were converted as part of making concurrent
gate verdicts honest.

`perf-baselines` remains a soft step. Its soft/hard status was not changed.

## Byte-flush authority and retained sensitivity

The millisecond measurement was not deleted. A five-session run exited 0 and
reported:

> `p50 4.389 ms, p95 14.893 ms`
>
> `WARN > 6.406 ms (report-only)`
>
> `history appended: .perf-history/input-byte-flush.ndjson`
>
> `trend history collecting 1/5 comparable samples`

The contended run also appended history and trend-compared it:

> `p50 5.228 ms, p95 15.283 ms`
>
> `trend history collecting 2/5 comparable samples`
>
> `input-byte-flush-gate: PASS`

The deliberate sensitivity loss is accepted and recorded in both
`scripts/harness/harness.invariants.md` and
`project.performance-baselines.md`: at 30 FPS, a regression from 4.928 ms to
25 ms can remain inside one approximately 33 ms frame and pass. Blocking moves
to visible frame ordering; sub-frame sensitivity remains in the non-blocking
individual warning and trailing trend.

## Positive controls

### Input byte

I temporarily added one to the observed completed-frame count. The real PTY
instrument exited 1:

> `input-byte-flush: DRIVEN BEHAVIOUR WRONG — the edited glyph appeared in completed frame 2 after input; expected the first`

After removing the plant, it exited 0:

> `glyph-first-frame=2/2`
>
> `boundary=input-write→DEC-2026-end-marker-byte-arrival`

### Measured-duration replacements

- Continuation plant: frame 15 changed from a three-row predecessor to a
  two-row boundary. Red:

  > `live-glide continuation boundary failed: frame 15 3->2 rows ... invalid placement: pre-boundary crossed 3 rows`

  Green:

  > `movingFrames=7,10,14, frameBoundaries=16->17,29->30,47->48`

- Accumulation plant: repeated boundaries `[0,12,12]` were rejected. Green:

  > `positive control rejects a repeated frame boundary`
  >
  > `frameBoundaries=0,14,21/0,14,21`

- Render-progress plant: `[2,0,3]` supplied a zero-frame input window. Red was
  observed as the planted predicate's exit 1; the enclosing contract reported:

  > `render-progress positive control rejects a zero-frame input window`

  Green at both scales:

  > `editor | 2000 | 5,6,6,6,6,7,5,7,6,6,6,6,6,6,6 | 0`
  >
  > `editor | 100000 | 5,6,6,6,6,6,7,6,5,6,6,7,6,6,6 | 0`

- Real-rate plant made projection passes equal all 150 input events. Red:

  > `editor 2000-line rapid input ran 150 projection passes for 150 wheel events`

  Green:

  > `150 real-rate events all join momentum; projection and scale counts hold`

The terminal and Inline Rewrite conversions also carry positive controls:

> `reducedMotion first-frame ordering failed: observed=true, complete=false`
>
> `agentTypingSpeed frame ordering failed: slow=3, fast=3; expected slow > fast`
>
> `inline rewrite idle ownership failed: renderQuiescent=false, requests=1, expectedRequests=0`

All three corresponding real drives ended `ALL-PASS`.

## Grep proof and lock scope

The following proof was run against the final source:

- Search for
  `actualPauseBeforeMilliseconds|actualDelayMilliseconds|actualInputDurationMilliseconds|completedFrameGapSequenceMilliseconds`
  in `scripts/behavioral-contracts.sh`: exit 1, no matches.
- Search for configured inputs: exit 0, retaining
  `maximumGlideDurationMilliseconds`,
  `glideCapEasingDurationMilliseconds`, and
  `maximumAnimationDeltaTimeSeconds` only as inputs to count bounds.
- Search for `quiet_lock_run|quiet_lock_rerun_script` in
  `scripts/merge-gate.sh`: exit 1, no matches.
- The same quiet-lock search in `scripts/perf-baselines.sh`: exit 0; the soft
  report still takes `quiet-exclusive`.
- Search for `MEASUREMENT INVALID` or `MEASUREMENT TOO SLOW` in the blocking
  gate sources: exit 1, no matches.
- The only input p50 threshold branch now calls `console.warn` with
  `(non-blocking)` and has no failure exit.

Clocks remain where allowed: condition-wait deadlines, configured input
scheduling, and report-only measurements. None determines a blocking verdict.

## Contention and concurrency proof

Six tracked `sha256sum /dev/zero` workers supplied deliberate contention.
Exact PIDs were recorded and all were stopped by the cleanup trap. Under that
load:

| Converted blocking population | Solo exit | Contended exit | Contended verdict |
| --- | ---: | ---: | --- |
| Input first-frame ordering + timing report | 0 | 0 | `PASS`; p50 changed to 5.228 ms without changing blocking authority |
| Full behavioral contracts, including all four class-(b) families | 0 | 0 | `behavioral-contracts: ALL-PASS` |
| Terminal first-frame and relative-frame checks | 0 | 0 | `smoke-terminal-stage-harness: ALL-PASS` |
| Inline Rewrite render ownership | 0 | 0 | `smoke-inline-rewrite-harness: ALL-PASS` |

The contended full behavioral fingerprints included:

> `frameBoundaries=0,14,21/0,14,20`
>
> all four 2k/100k render-progress cases had zero consecutive zero-frame windows
>
> `150 real-rate events all join momentum; projection and scale counts hold`

I did not run two `scripts/merge-gate.sh` processes because the task explicitly
forbids running that script. The two-full-gate overlap is therefore left to the
conductor. The dependency it needs—identical blocking verdicts under deliberate
machine load—is demonstrated above.

The whole-gate loud/shared and quiet/exclusive wrappers are gone. Only the
soft `perf-baselines` report coordinates through the quiet lock, so lock
degradation and `MEASUREMENT INVALID` are unreachable from blocking work.
`.claude/skills/conductor/SKILL.md` now permits concurrent gates within the
machine resource ceiling while retaining builders as the blocker.

## Final verification

Final pass against committed `2104b3f`, after the pre-commit formatter:

| Command | Exit |
| --- | ---: |
| `bunx tsc --noEmit` | 0 |
| `bun test` | 0 |
| `bash scripts/conventions-gate.sh` | 0 |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | 0 |
| `bun scripts/check-coverage-ratchet.ts` | 0 |
| `bash scripts/behavioral-contracts.sh` | 0 |

Details:

- 1,673 tests passed, 0 failed, across 252 files.
- 884 annotations resolved, 67 lattice links resolved, 0 problems.
- Coverage ratchet inspected 312 files with no undeclared decrease against
  `2e6c207`.
- Behavioral contracts ended `ALL-PASS`; the diff and fold-dense wall-clock
  canaries printed report-only `WARN` lines.
- `bash -n scripts/merge-gate.sh scripts/behavioral-contracts.sh` exited 0.
- `git diff --check` exited 0.
- `git status --short` is empty after commit and committed-state verification.

## Bycatch

- `LATENCY_SAMPLE_COUNT=1 bun scripts/harness/measure-input-byte-flush.ts`
  reaches `percentile(frameByteCounts, 0.5)` with no inter-frame byte-count
  sample and exits with `Cannot calculate a percentile without samples`.
  Observed once after the first-frame plant was removed; not retested. It does
  not affect the five-session gate's default 20-sample path and was left
  unchanged as out of scope.
