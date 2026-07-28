# switchlag — READY

Tip: `c38563cd00b01e9ecdc8a9b6b8066ac79cd36f4e`

Commit: `Measure switch latency and stabilize scrollbar extent`

Branch: `fix-scrollbar-thumb-oscillation`

## Verdict

The application is **not universally innocent** at the byte boundary. Small-file, generated-file,
cache-warm, and workspace switches emit promptly, but switches between tracked real TypeScript files
take about 106 ms p50, and opening a tracked 5k-line file after a different tracked file takes
346–360 ms p50 with roughly 743 ms p95.

The slow synchronous stage is the workspace gutter-diff projection. On a file switch,
`Workspace.gutterDiffByLine` can compare the newly active document with the previous file's stale
`activeHeadText` before the asynchronous head refresh lands. That sends unrelated files through
`DiffAlignment` before the first frame can flush. LSP suppression did not remove the delay. Renderer
work remains a credible explanation for additional Terminal.app-only delay after byte arrival:
large switch frames are 13–33 KB, with 69–75% of their bytes consumed by SGR sequences.

The scrollbar symptom was not a `SolidThumbScrollBar` post-write race. During a driven vertical
scroll, `slider.viewPortSize` remained 16 while `slider.max` changed from 26 to 102 because the
editor's horizontal `scrollSize` was derived from only the currently visible lines. The unchanged
document therefore appeared to change width as vertically different width bands entered the
viewport. The fix makes full-document display width stable and incrementally maintained, and shares
that generator between scrollbar geometry and horizontal scrolling.

## Measurement protocol

- Boundary: input write to the byte-arrival timestamp of the DEC 2026 synchronized-output end
  marker for the first completed frame whose emulated grid contains the intended file/workspace.
  The marker timestamp is captured in the PTY callback before terminal-emulator work.
- Each reported scenario number is the median of five session p50/p95 values.
- Each session contains 20 measured switches; therefore each row represents 100 switches.
- Every target switch completed in the first synchronized frame (`completedFramesUntilCondition=1`).
- Corrected quiet criterion was observed: no merge-gate and no other FLEET Codex whose cwd was under
  `/tmp/wt-*`. Ambient A in the table means the user's interactive Codex plus unrelated user/Claude
  processes were left running and untouched, as required.
- Load is `/proc/loadavg` 1/5/15-minute load at scenario start → end. A high one-minute value can be
  residual from an earlier ambient burst; it is reported rather than used to discard a run.

## Switch latency

| Scenario/pass | Median session p50 | Median session p95 | Load start → end; ambient |
|---|---:|---:|---|
| Keypress baseline | 11.915 ms | 14.665 ms | `0.21 1.56 1.43` → `0.19 1.54 1.42`; A |
| Small plain ↔ small plain | 10.326 ms | 12.263 ms | `34.82 14.85 6.26` → `32.19 14.63 6.24`; A |
| Real large TS ↔ real large TS, pass 1 | 107.389 ms | 137.138 ms | `0.57 1.31 1.35` → `0.68 1.29 1.35`; A |
| Real large TS ↔ real large TS, retry | 105.839 ms | 136.579 ms | `1.01 15.44 16.14` → `1.19 14.56 15.83`; A |
| Synthetic realistic 5k ↔ 20k TS | 11.384 ms | 18.900 ms | `20.32 35.44 20.23` → `18.77 34.87 20.13`; A |
| Large ↔ small asymmetric, pass 1 | 46.194 ms | 376.602 ms | `12.19 26.91 19.28` → `7.15 24.03 18.60`; A |
| Large ↔ small asymmetric, retry | 64.134 ms | 408.932 ms | `0.92 13.63 15.50` → `0.87 12.21 14.95`; A |
| Large cold first-open | 14.749 ms | 17.333 ms | `6.58 23.63 18.50` → `5.94 22.93 18.33`; A |
| Large warm re-focus | 10.546 ms | 12.381 ms | `6.58 23.63 18.50` → `5.94 22.93 18.33`; A |
| Workspace/worktree tab switch | 25.429 ms | 30.644 ms | `1.30 16.24 16.40` → `1.10 15.70 16.22`; A |

The two slow-looking scenarios were each remeasured once. The real-TS result repeated almost exactly,
and the asymmetric directionality repeated, so these are application signals rather than ambient
spikes.

Direction detail, also calculated as the median of five per-session direction summaries:

| Scenario/pass and direction | p50 | p95 |
|---|---:|---:|
| Asymmetric pass 1: opening large | 346.124 ms | 745.505 ms |
| Asymmetric pass 1: leaving large | 41.236 ms | 46.194 ms |
| Asymmetric retry: opening large | 360.062 ms | 742.663 ms |
| Asymmetric retry: leaving large | 43.201 ms | 64.134 ms |
| Workspace: opening second worktree (`/tmp/wt-tabs2`) | 16.917 ms | 25.429 ms |
| Workspace: opening primary worktree | 28.776 ms | 33.114 ms |

Cache result: cold opening 20 distinct generated 5k-line files is 14.749/17.333 ms; re-focusing
already-open buffers is 10.546/12.381 ms. Cache warmth is visible but is not the cause of the tracked
real-file delay.

### Slow-stage isolation

| Probe | p50 | p95 | Finding |
|---|---:|---:|---|
| Direct `TextDocument.loadFromFile`, 20 samples | 1.009 ms | 1.917 ms | Filesystem read/split is fast |
| Direct `Editor.openFile`, 20 samples | 0.888 ms | 1.350 ms | Core editor open is fast |
| `DiffAlignment`, empty head → synthetic 5k | 0.628 ms | 0.927 ms | Empty/untracked-head fast path |
| `DiffAlignment`, stale LICENSE head → synthetic 5k | 747.068 ms | 1300.364 ms | Reproduces asymmetric slow path |
| `DiffAlignment`, stale Bootstrap → RootView | 156.518 ms | 271.427 ms | Reproduces real-file switch cost |
| `DiffAlignment`, stale RootView → Bootstrap | 172.262 ms | 286.728 ms | Reproduces reverse direction |
| Asymmetric, LSP size limit forced to 1 KB | opening-large p50 408.453 ms | 448.874 ms | Delay remains with LSP suppressed |

All slow switches still reached the target in synchronized frame 1. The time is synchronous work
before first-frame byte arrival, not a deferred repaint or a wait for a later target frame.

The generated fixtures are untracked, so their head text is empty and they take the linear added-line
diff path. That explains why a realistic 20k-line synthetic buffer can switch faster than the
smaller tracked-source pair.

## Switch-frame byte/cell audit

Values below are medians of the five session p50/p95 values. The real and asymmetric rows use their
retry passes.

| Scenario | Frame bytes p50 / p95 | Changed cells p50 / p95 | SGR bytes p50 | SGR sequences / resets p50 |
|---|---:|---:|---:|---:|
| Keypress baseline | 3,100 / 3,100 | 442 / 442 | 2,071 | 160 / 54 |
| Small plain pair | 6,161 / 8,125 | 1,819 / 1,819 | 3,475 | 268 / 90 |
| Real large TS pair | 13,215 / 16,982 | 1,673 / 1,676 | 9,176 | 715 / 239 |
| Synthetic 5k/20k pair | 32,058 / 32,949 | 2,102 / 2,102 | 23,947 | 1,852 / 618 |
| Asymmetric retry | 9,455 / 35,044 | 2,498 / 2,498 | 5,386 | 415 / 139 |
| Cold first-open | 2,685 / 2,827 | 292 / 303 | 1,867 | 145 / 49 |
| Warm re-focus | 369 / 750 | 7 / 61 | 275 | 22 / 8 |
| Workspace tab | 4,272 / 4,753 | 640 / 640 | 3,007 | 232 / 78 |

Raw synchronized-frame inspection:

| Target frame | Bytes | SGR bytes | SGR sequences | Resets | Cursor moves | Erases |
|---|---:|---:|---:|---:|---:|---:|
| RootView.ts | 13,215 | 9,176 | 715 | 239 | 239 | 0 |
| Bootstrap.ts | 16,982 | 12,395 | 961 | 321 | 321 | 0 |
| Synthetic 20k | 32,058 | 23,947 | 1,852 | 618 | 618 | 0 |
| Synthetic 5k | 32,949 | 24,681 | 1,909 | 637 | 637 | 0 |

Findings:

- There is no full-screen clear, line erase, or REP sequence in these captures. OpenTUI is emitting
  changed runs, not blindly clearing the viewport.
- There is only one adjacent identical SGR sequence per audited frame, so adjacent duplicate style
  tokens/theme identity churn is not the inflation source.
- The dominant overhead is repeated run framing: cursor move → foreground → background → printable
  run → reset. The same editor background is reasserted 226–628 times per frame, and 69–75% of real
  and synthetic frame bytes are SGR bytes.
- The synthetic pair changes 2,102 cells even though its visible code is structurally similar; the
  4-digit/5-digit line-number gutter width shifts the viewport between the 5k and 20k buffers.
- The style-run/reset protocol is renderer-owned. The application supplies legitimate syntax runs;
  the audit found no adjacent identical app styles to coalesce. Terminal.app still has substantially
  more control-stream work than a GPU terminal on a near-viewport repaint.

The four unpacked raw `.bin` captures were packaged as
`artifacts/switch-latency-results/switch-frame-captures.tar.gz` and the unpacked copies were removed
so the invariant reference scanner would not parse rendered source comments as repository
annotations. The generated synthetic fixture directory was also removed after measurement; it is
reproducible from the committed measurement script.

## Scrollbar oscillation

### Reproduction and diagnosis

The smoke fixture contains vertical bands whose lines are 42, 118, and 68 display cells wide while
the document itself remains unchanged. The emulator snapshots the horizontal thumb background run
after every synchronized scroll frame.

Pre-fix, the observed run changed from 6 cells to 2 cells during one vertical wheel burst. The
diagnostic bar log correlated it exactly:

| State | `slider.viewPortSize` | `slider.max` | Visible-window width source | Thumb |
|---|---:|---:|---:|---:|
| Narrow band | 16 | 26 | 42 | 6 cells |
| Wide band | 16 | 102 | 118 | 2 cells |

`SolidThumbScrollBar` already reasserted the viewport synchronously after the base setter and was
settled before each emitted frame. Its suspected stale-max race was falsified. The changing input was
`ScrollbarSync` scanning only `document.slice(firstVisibleLine, viewportHeight)`.

### Fix

- `TextDocument.maximumLineWidth` now represents the entire document and is maintained with a
  parallel width array plus a width-frequency table.
- Local edits update only affected lines. A distinct-width scan occurs only when the sole widest line
  shrinks or disappears.
- `ScrollbarSync` and `EditorPane` both consume this one full-document extent, so bar geometry and
  horizontal wheel/drag clamping cannot disagree.
- `EditorCoordinates.lineWidth` adds a bounded, memoized printable-ASCII/tab fast path at the existing
  coordinate seam. Unicode and complex graphemes continue through the exact `Intl.Segmenter` path.
- A post-fix synthetic spot check measured the 20k direction at 19.267–21.348 ms and the 5k direction
  at 11.147–13.535 ms. This avoided the initial eager-segmentation prototype's 140 ms regression.

No `SolidThumbScrollBar` code was changed because the drive proved that seam was already internally
consistent; changing it would not have fixed the changing `scrollSize` generator.

### Stability proof

Five consecutive final-code smoke sessions:

| Run | Captured scroll frames | Thumb-length sequence | Result |
|---:|---:|---|---|
| 1 | 22 | all `2` | PASS |
| 2 | 21 | all `2` | PASS |
| 3 | 22 | all `2` | PASS |
| 4 | 22 | all `2` | PASS |
| 5 | 22 | all `2` | PASS |

Every captured frame also asserted that the horizontal thumb remained present. Existing scrollbar
proofs for solid background painting, proportional vertical geometry, movement, independent
horizontal panes, and hidden-when-fitting behavior remained green.

## Verification

| Check | Result |
|---|---|
| `bunx tsc --noEmit` | PASS |
| `bun test` | PASS — 1,008 tests, 0 failures, 14,445 expectations, 111 files |
| Focused coordinate/document/driver tests | PASS — 30 tests, 0 failures |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all` | PASS |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | PASS — 538 annotations, 39 lattice links, 0 problems |
| `bash scripts/conventions-gate.sh` | PASS |
| Required 14 real-PTY harness consumers | PASS — all once on final code |
| `smoke-scrollbars-harness.ts` final stability repetitions | PASS — 5/5 |
| `git diff --check` | PASS |

Invariant review: the change preserves the editor's compact non-reactive line-array ground truth,
keeps mutation revision behavior covered by the full suite, uses the existing
`EditorCoordinates` generator for display-cell semantics, and makes scrollbar geometry and
horizontal interaction consume the same extent. No invariant contract text needed modification.

Per instruction, no merge-gate was run, no push/deletion/branch cleanup was performed, and the user's
interactive Codex process was not signaled. The commit used `SKIP_GATE=1`.

The worktree is clean for committed implementation files. `TASK.md`, `TASK2.md`, and
`artifacts/switch-latency-results/` remain untracked as task/evidence material.
