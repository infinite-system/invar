# READY — #196 (make a 500,000-line file usable)

Status: complete on `fleet/196-scale`.

Final commit: `ce45773` (`fix(editor): make large-file editing
observation-bounded`)

Preserved WIP commits: `24bc81c`, `a7460c0`.

The tree is clean. Nothing was pushed, merged, tagged, or deleted.

## Result

Large-file editing is now proportional to the changed/observed region, not to
the number of lines that exist. A same-line keystroke at both 2,000 and
1,000,000 lines performs:

```json
{
  "rowArrayAllocations": 0,
  "blockArrayAllocations": 0,
  "rowWrites": 1,
  "blockWrites": 0
}
```

The zero block write is because the measured ASCII insertion did not change
the line's visual-row count. A wrap-changing edit performs one row write and
one block write, also independent of document size.

This makes the 1M prediction an impossibility check rather than a hope:
500,000 is not a special boundary. If an editing keystroke did document-sized
array work, the 1M counter would differ from the 2k counter. It is identical.
The end-to-end distributions are also not ordered by document size: the three
1M middle-edit medians were 8.949, 8.886, and 8.637 ms, while the three 2k
medians were 10.358, 10.221, and 7.880 ms. What exists still affects launch
and resident memory; it no longer affects per-keystroke index work.

Every measured edit at every size, including the champion line, appeared in
the first completed frame after its input write.

## What shipped

All five required wrap-index steps ship:

1. An unchanged fold structure reuses its projection. Non-structural edits do
   not rescan folds or the document; the renderer consumes the local fold
   marker.
2. Fixed-length indices mutate in place when line count is unchanged. An
   explicit `TextDocument.lastLineChange` fact identifies the changed range.
3. The flat prefix array is gone. 4096-line block sums plus an exact running
   total bound lookup and update work independently of document size. There
   is no Fenwick tree.
4. Row counts and block sums are `Uint32Array`, preserving counts above 255
   while avoiding boxed-number arrays.
5. The duplicate `index.lineTexts` ground truth is deleted.

The same change fact generated downstream simplifications:

- `EditorFrameAttribution` now forwards the fact rather than silently forcing
  the fallback path.
- Undo/redo stores localized line deltas rather than whole-document snapshots.
- Folding reuses structural state and handles non-structural edits locally.
- Git's unavailable state is `null`, not an empty tracked file that paints the
  whole document as added.
- Exact maximum width remains exact; no stale upper bound was introduced.

The load path now uses the first newline for EOL detection, `split('\n')`,
one fused metadata traversal, a bounded 8 KiB binary sniff, and a
known-clean-at-this-revision baseline. It does not hash the whole document at
load or defer that hash into first paint. A later clean check performs an
exact comparison only when needed.

## Predictions and outcomes

- Prediction: explicit localized change facts would delete more machinery
  than optimizing head/tail comparison. Outcome: `lineTexts`, flat prefixes,
  document snapshots, unconditional fold rebuilding, and unavailable-file
  full diffs all disappeared.
- Prediction: in-place typed arrays would remain reactive only if document
  revision publication was the observation boundary. Outcome: the reactive
  effect contract observes `[3, 4]` across the in-place mutation; the skipped
  forwarding positive control goes red.
- Prediction: one row plus one block is the complete same-line mutation
  surface. Outcome: counts are identical at 2k and 1M; the forced rebuild
  produces 20,000 row writes, 20,000 block writes, and one allocation of each
  array at the 20k control size.
- Prediction: the invariant should reduce the contract record. Outcome:
  [src/modules/editor/editor.invariants.md](../../../../src/modules/editor/editor.invariants.md) is shorter than merge base
  `a93b7e8`: 629 to 621 lines and 4,664 to 4,558 words (8 lines and 106 words
  removed).

## Ordered component ladder

These are cumulative 500k measurements in milliseconds. Each pair is
`wordWrap off` / `wordWrap on`, with three ordered samples. This boundary is
only `TextDocument.setLine` through `EditorWrap.totalVisualRows`; it excludes
the app, PTY, undo capture, reactive paint, terminal output, and frame
observation. These numbers locate component work; they are not the felt
keypress cost.

| cumulative state | off samples | on samples |
|---|---|---|
| baseline | `[7.145125,7.251291,8.645417]` | `[7.723791,6.866333,6.923291]` |
| 1. reuse fold projection | `[5.919667,8.097792,4.883833]` | `[5.811458,5.628791,8.377833]` |
| 2. in-place arrays | `[4.360667,4.547750,4.348875]` | `[4.248250,4.312125,3.984333]` |
| 3. block sums and total | `[4.463583,4.231833,4.111750]` | `[4.375083,3.983792,3.876667]` |
| 4. `Uint32Array` | `[3.493167,3.590208,3.544625]` | `[3.442083,3.677959,3.408958]` |
| 5. delete `lineTexts`; consume change fact | `[0.003958,0.007959,0.002333]` | `[0.004042,0.004000,0.003291]` |

Final 2k component samples were
`[0.007875,0.005125,0.004125]` off and
`[0.005459,0.006042,0.004875]` on.

## Ordered load-path reductions

These are the internal 500k load component samples in milliseconds, acquired
under the quiet lock:

| cumulative state | ordered samples |
|---|---|
| baseline | `[901.969292,832.309208,836.346750]` |
| first-newline EOL | `[858.885375,867.213959,825.528084]` |
| literal newline split | `[844.041125,812.922000,802.021251]` |
| fused metadata traversal | `[856.784833,802.607418,804.286626]` |
| bounded binary sniff | `[838.621334,790.643542,796.568417]` |
| skip load signature | `[801.438125,750.976001,759.692917]` |
| BMP geometry fast path | `[138.873125,116.695917,99.976208]` |

The final end-to-end launch samples are in the scale ladder below; those are
the user-visible figures and include the real app and first painted content.

## New end-to-end instrument

I extended `measure-input-byte-flush.ts` instead of creating a competing
instrument. Its editing mode now owns the missing size axis and reuses the
existing real-PTY frame observation.

Boundary:

- starts immediately before each input byte write;
- ends at the first complete DEC-2026 frame whose painted editor content
  contains that cumulative edit;
- includes input routing, undo capture, document mutation, reactive
  invalidation, editor/gutter/scrollbar/diff paint, terminal output, and frame
  parsing;
- excludes fixture generation, launch navigation, save, post-master display,
  and LSP work;
- isolates LSP with `lspFileSizeLimitKb=1` and asserts no `tsgo` before or
  during samples.

Each session types a sustained 30-keystroke burst in the middle. The 500k and
1M sessions also type a 30-keystroke burst at the widest-line champion.
There were 630 normal end-to-end edit samples in total.

Positive control: forcing the real legacy wrap rebuild moved the 500k middle
median from 7.497708 ms to 3358.943335 ms, a **447.996x** move. The instrument
requires at least 10x. Forced-control ordered middle samples were:

- session 1: `[3338.203043,3337.429293,3358.943335]`
- session 2: `[3332.371668,3379.703335,3351.596501]`
- session 3: `[3463.784168,3449.759876,3455.457085]`

Raw exact JSON: `/tmp/196-scale-final.json`.

## End-to-end ordered samples

Times are milliseconds and rounded to three decimals here; exact values are
in the JSON named above. RSS values are bytes.

### 1000000 lines

- launchToFirstPaintMs: `[621.453,625.203,625.545]`
- peakResidentBytes: `[698970112,673087488,679129088]`
- session 1 middleInputToPaintMs: `[6.745,8.949,9.853,9.586,9.697,10.36,11.036,12.083,14.197,12.285,14.166,4.312,6.401,7.945,9.929,11.625,12.653,13.156,9.498,6.672,7.284,7.198,7.44,7.936,8.017,7.912,8.034,7.33,7.735,8.007]`
- session 1 championInputToPaintMs: `[6.896,9.164,10.906,11.349,13.23,14.322,6.317,8.09,10.104,11.038,10.607,12.537,9.402,10.508,11.167,11.027,11.413,13.136,4.516,5.907,6.919,7.418,6.734,6.089,6.361,6.399,11.264,11.779,16.177,3.903]`
- session 2 middleInputToPaintMs: `[6.026,7.622,8.606,13.545,15.832,4.292,4.707,6.367,8.912,9.265,8.886,9.979,9.402,10.962,10.701,10.212,9.953,11.178,10.8,8.239,7.929,9.918,13.044,8.191,7.686,7.235,7.328,7.883,7.125,7.087]`
- session 2 championInputToPaintMs: `[6.291,6.383,6.285,6.478,5.111,6.071,6.207,5.894,5.949,6.953,7.103,7.977,8.132,8.776,9.797,9.879,9.961,9.796,10.073,9.296,10.104,9.776,9.281,9.713,9.923,8.831,10.022,9.901,9.11,9.48]`
- session 3 middleInputToPaintMs: `[7.664,12.111,14.613,3.335,5.658,6.404,8.292,8.231,10.943,8.456,9.197,10.43,11.143,12.343,11.214,10.53,12.339,17.844,7.966,6.852,7.068,7.792,7.029,8.819,8.57,7.077,9.317,8.215,8.637,11.368]`
- session 3 championInputToPaintMs: `[6.7,6.748,6.542,6.885,7.871,9.185,9.179,11.565,11.272,11.623,11.659,11.879,11.912,11.237,10.414,10.812,11.131,15.033,4.073,5.621,7.922,13.329,15.146,3.734,6.2,7.498,9.159,11.158,10.94,11.07]`

### 500000 lines

- launchToFirstPaintMs: `[480.003,465.329,462.202]`
- peakResidentBytes: `[434946048,474693632,473423872]`
- session 1 middleInputToPaintMs: `[9.316,13.859,4.167,6.634,8.336,10.266,12.424,13.411,3.874,6.052,5.764,5.29,5.283,6.506,6.819,7.037,6.379,6.031,6.972,7.726,6.859,6.631,5.689,6.733,6.778,8.589,8.76,8.287,8.645,8.387]`
- session 1 championInputToPaintMs: `[7.533,8.385,10.323,12.074,12.744,3.388,5.83,5.61,8.634,11.778,14.855,4.065,9.647,8.309,8.318,7.446,7.45,7.838,7.756,7.351,7.89,10.841,9.36,13.069,13.899,13.943,3.511,5.863,9.352,10.648]`
- session 2 middleInputToPaintMs: `[7.009,7.369,12.551,15.571,3.871,5.562,10.546,12.817,14.162,13.095,16.336,3.947,5.507,11.489,13.063,16.658,4.258,5.65,10.722,8.83,7.081,6.851,6.444,6.963,6.662,9.175,10.605,8.638,9.638,4.729]`
- session 2 championInputToPaintMs: `[3.518,3.746,6.077,6.059,9.423,12.111,16.08,3.726,8.497,9.96,11.283,11.461,15.28,13.264,3.669,6.098,7.716,9.291,11.498,13.114,13.574,14.047,5.873,7.11,8.091,9.838,11.598,12.959,13.752,3.547]`
- session 3 middleInputToPaintMs: `[6.47,7.362,7.925,7.605,8.349,8.676,10.494,12.285,12.639,13.374,13.46,13.443,5.826,6.584,6.479,6.624,7.332,12.038,16.381,5.808,6.613,7.935,7.498,7.364,6.391,7.884,8.057,10.293,5.613,10.597]`
- session 3 championInputToPaintMs: `[6.599,5.782,5.713,5.578,5.711,6.103,6.76,8.968,9.538,10.715,11.921,12.891,12.948,13.449,12.583,12.776,13.552,5.756,6.851,7.123,7.956,8.918,9.894,9.98,9.603,9.947,9.947,10.373,10.865,10.028]`

### 100000 lines

- launchToFirstPaintMs: `[346.781,349.81,325.181]`
- peakResidentBytes: `[303726592,298639360,295948288]`
- session 1 middleInputToPaintMs: `[3.587,3.827,3.795,3.658,4.43,4.393,3.91,4.402,4.21,4.446,5.693,8.692,13.085,4.177,10.188,10.684,11.362,11.297,13.177,5.011,4.923,5.088,4.917,7.944,3.971,4.993,4.883,7.979,4.921,8.071]`
- session 2 middleInputToPaintMs: `[4.722,5.637,5.695,6.511,6.334,7.421,9.428,9.669,9.267,9.519,10.74,11.437,15.362,3.862,4.2,4.385,5.449,9.358,14.418,4.825,6.998,6.81,5.932,6.619,7.229,7.01,6.718,6.805,4.947,6.855]`
- session 3 middleInputToPaintMs: `[4.467,5.974,9.479,11.534,15.312,3.893,4.321,3.74,5.772,6.466,7.425,9.924,11.608,16.565,4.395,4.574,5.42,6.383,8.106,5.902,6.079,6.006,6.173,6.213,6.176,6.044,6.168,8.121,7.583,9.102]`

### 20000 lines

- launchToFirstPaintMs: `[340.952,292.17,324.414]`
- peakResidentBytes: `[269946880,267141120,276520960]`
- session 1 middleInputToPaintMs: `[7.223,11.543,13.944,5.076,6.65,8.558,11.422,10.319,10.353,10.307,10.415,10.384,10.498,13.931,4.92,6.324,6.361,6.824,7.052,7.698,6.531,6.173,7.282,6.132,6.839,6.769,6.069,9.58,7.31,6.051]`
- session 2 middleInputToPaintMs: `[4.551,5.592,7.594,8.505,10.937,11.295,14.011,13.176,14.268,12.936,3.86,7.171,10.588,14.295,3.831,4.491,5.208,6.454,6.824,8.19,5.897,5.874,6.765,6.088,11.354,14.892,4.156,5.827,6.941,6.8]`
- session 3 middleInputToPaintMs: `[3.601,4.255,6.417,9.598,12.315,15.66,3.922,4.491,5.301,6.304,6.486,8.117,8.298,9.046,10.048,9.423,10.291,9.214,9.353,9.986,6.172,7.345,8.078,5.951,6.862,5.791,7.665,6.657,6.132,4.469]`

### 2000 lines

- launchToFirstPaintMs: `[283.295,303.907,306.56]`
- peakResidentBytes: `[266539008,266022912,267444224]`
- session 1 middleInputToPaintMs: `[7.731,9.074,10.542,12.01,12.56,11.393,11.505,13.555,12.351,10.279,10.358,10.249,12.132,13.56,16.272,4.623,13.49,12.647,14.423,13.63,4.904,6.089,6.985,7.967,5.899,5.795,6.769,7.698,7.836,7.984]`
- session 2 middleInputToPaintMs: `[10.53,11.775,12.561,12.794,12.539,12.589,12.359,13.439,13.487,14.377,4.436,4.266,7.396,10.84,12.542,14.546,3.812,5.386,7.631,10.221,12.2,4.879,5.971,6.808,5.969,7.135,6.809,6.675,6.754,7.862]`
- session 3 middleInputToPaintMs: `[10.814,12.536,14.362,3.611,4.086,3.752,4.602,7.88,7.872,7.703,10.06,9.864,11.589,13.414,13.733,13.423,13.673,13.299,13.299,14.485,5.301,7.041,5.866,5.81,5.796,5.717,4.804,6.711,8.152,7.013]`

## Structural proof and positive controls

Post-commit AST censuses:

- `document-change-fact-boundary-census`: 0. There is no other
  `TextDocument`/`EditorWrap` wrapper that forwards most of the surface while
  dropping the change fact.
- `wrap-index-array-escape-census`: 0. The typed index arrays do not escape
  `EditorWrap`.
- `wrap-index-edit-loop-census`: 0. No per-edit path contains a loop bounded
  by `lineCount`.
- member census for `lineTexts`: 0.
- member census for `prefix`: 0 under the editor.
- all `rowCounts` and `blockRowCounts` member accesses are internal to
  `EditorWrap`.
- editor calls to whole-document `snapshot`: 0.

Positive controls observed red before their plants were removed:

1. Removing `lastLineChange` forwarding made
   `EditorFrameAttribution.test.ts` receive `undefined` instead of the
   expected change.
2. The same plant made `document-change-fact-boundary-census` report the
   forwarding object literal.
3. A planted `lineCount` loop made `wrap-index-edit-loop-census` report the
   `ForStatement`.
4. A planted external `rowCounts` read made
   `wrap-index-array-escape-census` report the escape.
5. A forced rebuild moved the operation counter from one row write to
   20,000 row writes plus 20,000 block writes and two allocations.
6. The real-PTY legacy control moved end-to-end latency 447.996x.

All plants were removed.

## Verification

- `bunx tsc --noEmit`: exit 0.
- `bun test`: exit 0; 1,707 pass, 0 fail, 67,642 expects, 258 files.
- `bash scripts/conventions-gate.sh`: exit 0.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`:
  exit 0; 930 annotations, 67 lattice links, 0 problems.
- `bun scripts/check-coverage-ratchet.ts`: exit 0.
- `bash scripts/behavioral-contracts.sh`: exit 0, ALL-PASS.
- `bun run drive`: exit 0.
- `bun run drive --size 100000`: exit 0.
- final end-to-end scale measurement: exit 0.
- final component/count measurement: exit 0.
- quiet-lock journal: every timing acquisition has a matching release; no
  `degraded` entry.
- `INVAR_GATE_WORKERS=2 bash scripts/merge-gate.sh`: exit 0,
  `merge-gate: ALL-PASS`; all 60 PTY jobs passed on the first attempt, retry
  tally clean, total 4m07s.
- post-commit AST censuses: exit 0, all required counts zero.
- `git diff --check`: exit 0.

Verification note: an earlier six-worker gate exposed pre-existing
contention in markdown/fold-density smokes. A single-worker diagnostic run
then saw isolated terminal-stage and panel-chrome frame flakes; both passed
standalone. The final supported two-worker full run was clean with no retries.
No timeouts or tolerances were changed.

## Bycatch

- **Find reveal can paint the active target line blank at the bottom of the
  viewport.** Reproduction: open the generated 500k scale file, send
  `Ctrl+Shift+J`, `Ctrl+F`, paste `200004`, press Enter, then Escape. The
  status reports cursor `lineIndex=200004` and gutter row 200005, but the
  content row is blank until Down then Up repaints it. Reproduced 3/3 on the
  task head. Verified 1/1 at merge base
  `a93b7e8d48ef269347dd71646d46daee7f03fa7f`. The implicated
  `src/modules/search/FindBar.ts`,
  `src/modules/search/FindInBuffer.ts`, and
  `src/modules/app/Bootstrap.ts` have no diff from that base. Not fixed; it is
  outside #196 (make a 500,000-line file usable).
