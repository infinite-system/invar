# Scroll feel READY

Branch: `fix-scroll-feel`

Base: `4d98ee8ea8bef8c61e313009406b820306f0f205`

Commit: `3d45b5694bb45218eae3610611425f44cf0ea2d6`

## Outcome

- Progressive fling gain now comes from a cadence-bounded,
  rest-equivalent gesture accumulator. It never reads decayed physical
  velocity. The newly gained velocity still adds to residual physical
  momentum.
- Animation physics and one-shot render requests now run from one
  absolute-deadline cadence. Timer overshoot and frame work shorten the
  following wait instead of accumulating as relative-delay drift.
- The behavioral contract now gates follow-on travel within 10% and
  sustained-fast cadence at 28 FPS. It observes the published momentum
  at-rest condition instead of guessing rest from a sleep.
- The scrollbar smoke now observes its eventual deep-line state while
  sustaining wheel input. It no longer assumes that every cell-quantized
  impulse must emit a changed terminal frame.

## Diagnosis

Temporary per-frame attribution measured the pre-fix renderer:

- mean frame-event gap: 37.806 ms;
- application frame-tick work: 0.472 ms;
- previous status-settle work: 0.294 ms;
- renderer JavaScript frame work: 0.751 ms.

Paint and application work were far below the missing frame budget. The
relative recursive live-loop timer scheduled its next delay only after
frame work returned, so overshoot and work accumulated. The replacement
advances an absolute deadline by `1000 / targetFps` on every active tick.

At the slow tail, sub-two-row motion naturally has unchanged cell-grid
ticks that produce no terminal diff. `sustainedFastFramesPerSecond`
therefore measures through the final frame advancing at least two rows,
where every animation tick must be externally visible. Whole-glide output
FPS is also reported below for transparency.

## Before/after PTY measurement

Command:

`bun scripts/harness/measure-scroll-smoothness.ts`

One PTY write per 12-notch gesture, quiet-exclusive:

| Gesture | State | Travel | Moving frames | Max step | Peak | Whole-glide FPS | Sustained-fast FPS | Mean bytes/frame |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | before | 48 rows | 19 | 7 | 185 rows/s | 21.6 | not yet reported | 3,108 |
| 1 | after | 48 rows | 20 | 7 | 208 rows/s | 22.3 | 30.2 | 3,107 |
| 2 | before | 36 rows | 17 | 5 | 139 rows/s | 20.4 | not yet reported | 3,105 |
| 2 | after | 48 rows | 20 | 7 | 214 rows/s | 22.1 | 30.1 | 3,107 |
| 3 | before | 36 rows | 17 | 5 | 128 rows/s | 19.7 | not yet reported | 3,105 |
| 3 | after | 48 rows | 20 | 6 | 176 rows/s | 22.2 | 29.8 | 3,107 |

The pre-fix follow-on deficit was 12/48 rows, or 25%. The final result is
48/48/48 rows, a 0% difference. Mean frame bytes remain flat (within two
bytes, under 0.1%).

## Constants

No feel constants changed:

- default: impulse 22, ceiling 80, decay 0.015/s, stop velocity 3;
- vertical: impulse 34, ceiling 220, decay 0.015/s, stop velocity 3.

The faults were mechanical state derivation and pacing, so retuning was
neither necessary nor appropriate.

## Verification and exact exit codes

- `bun install --frozen-lockfile`: exit 0.
- `bunx prettier --check ...`: exit 0.
- `git diff --check`: exit 0.
- `bash -n scripts/behavioral-contracts.sh`: exit 0.
- `bash scripts/conventions-gate.sh`: exit 0.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`:
  exit 0; 832 annotations and 45 lattice links resolved, 0 problems.
- `bun scripts/check-coverage-ratchet.ts`: exit 0.
- `bun scripts/check-reactive-observation.ts`: exit 0.
- `bun scripts/check-harness-wait-observation.ts`: exit 0.
- `bun test`: exit 0; 1,558 pass, 0 fail, 16,983 expectations across
  239 files.
- Focused momentum/scroll tests: exit 0; 20 pass, 0 fail.
- Final smoothness instrument: exit 0; 48/48/48 rows,
  29.8-30.2 sustained-fast FPS, 3,107 mean bytes/frame.
- `bash scripts/behavioral-contracts.sh`, final form:
  runs 1/2/3 each exit 0.
- Loaded behavioral-contract run with a concurrent SHA-256 CPU workload:
  exit 0; 48/48 rows, 29.8 FPS minimum, idle frame delta 0.
- `bun scripts/harness/smoke-scrollbars-harness.ts`, quiet-exclusive,
  final form: runs 1/2/3 each exit 0. Vertical, horizontal, diff, and
  agent thumb extents remained stable across every observed frame.
- `bun scripts/harness/input-byte-flush-gate.ts`: exit 0. Five-session
  p50 5.022 ms versus the reviewed 4.928 ms baseline (+0.094 ms, +1.9%);
  p95 7.115 ms; trend detector PASS.

Glide monotonicity and decay, wrapped scrolling, scrollbar stability, and
idle quiescence are all green.

## Coverage declarations

Counted grammar increased:

- `Momentum.test.ts`: 21 assertions / 11 waits to
  24 assertions / 13 waits;
- `smoke-scrollbars-harness.ts`: 40 assertions / 34 waits to
  40 assertions / 35 waits.

There is no decrease, so the APPEND-only
`project.coverage-deltas.md` policy requires no declaration row. The
ratchet confirms no undeclared loss against `4d98ee8`.

## Invariants

- Added `Fling gain comes from the current gesture`.
- Refined `A fast glide crosses rows in many small steps` with the
  absolute-deadline mechanism, 28 FPS floor, parity evidence, and idle
  timer impossibility.
- Added resolving code annotations at the gesture-gain and cadence seams.

## Audit notes

During repetition, one behavioral run exposed a sleep-based wrap-rest
sampling race; it was replaced by the published at-rest condition before
the three final clean runs. Two early scrollbar runs passed every thumb
assertion but later timed out on the invalid one-input/one-frame
assumption; that wait was converted to eventual-state observation before
the three final clean runs.

`scripts/merge-gate.sh` was not run. Nothing was pushed, merged, tagged,
deleted, or retuned.

The worktree is clean after commit. No TASK file was added or modified.

---

# Continuation — landing-gate repair and task #123

Branch: `fix-scroll-feel`

Merged main: `15634569c220163ea05570129446728bec553419`

Merge commit: `fed4fdf`

Continuation commit: `1f745b1d679c837f20bbd45cdc60fa814c744eea`

## Part 1 — landing-gate failures

### Reproduction on the merged tree

After merging `origin/main` at `1563456`, the four preserved failures were
reproduced through their real PTY paths:

- `smoke-editor-harness`: exit 1, deterministic timeout waiting for
  `status.focus === 'files'`.
- `smoke-scrollbars-harness`: exit 0 on the first isolated reproduction,
  confirming the preserved deep-widest-line failure was load/timing
  plausible; it was subsequently reproduced on the final merged tree.
- `smoke-clipboard-frame-boundary-harness`: exit 1, timeout waiting for
  `agentStuckToBottom === true`.
- `smoke-panel-chrome-harness`: exit 1, timeout waiting for the expand
  heading hover highlight/tooltip.

The editor failure also reproduced twice in isolation, matching the landing
gate's deterministic classification. The preserved gate logs remain in
`/tmp/merge-gate-failures.3943087`; local reproduction logs were retained
under `/tmp/part1-*-postfix.log`.

### Diagnosis and repair

The editor and panel failures were real projection-order defects. The
absolute-deadline callback advanced reactive animation state and requested a
synchronized frame immediately. On the final settling tick, that frame could
serialize the old projection before the coarse reactive paint ran, then the
cadence stopped with no later tick to repair focus, hover, tooltip, or scroll
state. The callback now queues its render request in a microtask, after the
reactive projection.

The other two failures were drive defects, not weakened product assertions:

- Clipboard used one fixed 12-notch distance as a proxy for reaching the
  transcript bottom. The helper now continues real wheel trains until the
  original top/bottom semantic predicates are observed.
- Scrollbars stopped horizontal motion when an arbitrary clipped tail became
  visible, then waited for the complete deep end marker at an insufficient
  horizontal offset. The drive now halts its coarse fling through the real
  pointer path and uses settled wheel steps on both axes until the unchanged
  full `DEEP-WIDEST-END-MARKER` visual assertion is satisfied. Under the
  loaded run, its initial wait was also tightened to require both the vertical
  thumb and converged tree horizontal bar before inspecting the frame.

No assertion was weakened or removed.

## Part 2 — task #123, document-scale scrolling

### Instrument and gate

`measure-scroll-smoothness.ts` now creates 2,000-, 26,635-, and 100,000-line
fixtures at run time and commits none of them. It drives both the bare editor
and side-by-side diff through the real PTY, returning a `cases` matrix with
the existing per-gesture frame, travel, cadence, velocity, and byte metrics.
The diff fixture contains regularly separated changes, reaching 1,000 change
blocks at 100k lines.

The behavioral contract preserves the existing maximum-step, moving-frame,
travel, 10% follow-on parity, and 28 FPS assertions across the matrix, and
adds an explicit requirement that both 100k surfaces sustain at least 28 FPS.

Final behavioral result:

- slowest sustained-fast result across all six cases and both gestures:
  29.5 FPS;
- 100k editor + diff slowest result: 30.2 FPS;
- largest completed-frame step: 7 rows;
- fewest moving frames: 19;
- best 12-notch travel: 48 rows;
- follow-on travel: 41 rows versus 42 from rest, within 10%.

### Per-frame attribution

Temporary instrumentation was enabled only for diagnosis and removed before
commit. It timed `paint.view`, `paint.status`, workspace animation, and the
contributed diff surface, while CPU profiles attributed functions inside
those regions.

On fold-heavy JSON fixtures before the repair:

- editor `paint.view` p95 grew from 5.185 ms at 2k to 11.412 ms at 100k;
- editor `paint.status` p95 grew from 0.533 ms to 2.270 ms;
- the CPU profile attributed 4.2% / 366.6 ms total to
  `collapsedFoldRanges`, with document-wide `Map`, `map`, and renderer fold
  map construction also hot;
- the status path joined the whole document to display the large-file size
  notice (`join` alone accounted for 1.7% / 152.8 ms).

After the repair, the same JSON attribution was effectively viewport-flat
after one-time discovery:

- editor `paint.view` p95: 4.622 ms at 2k and 5.434 ms at 100k;
- editor `paint.status` p95: 0.436 ms and 0.530 ms;
- diff contributed-surface p95: 4.169 ms at 2k and 3.400 ms at 100k.

Measurement ruled out the named alternatives as the dominant sustained-frame
cost: `TextDocument.maximumLineWidth` was already an incremental O(1)
consumer; wrap/fold row indexing was revision-cached; viewport syntax
tokenization and sparse overview projection stayed small. The actual editor
O(document) consumers were the per-frame fold map/filter rebuilds and the
whole-document length join. Diff was already flat for a sparse comparison,
but still contained O(change-block-count) overview and active-block scans,
which were removed so a dense comparison cannot recreate the regression.

### Bounded hot paths

- `CodeFolding` stores a revision-keyed start-line index.
- `Editor.collapsedFoldRanges` is memoized by document and fold revisions.
- `EditorPaneRenderer` performs only viewport-many O(1) fold lookups.
- `TextDocument.contentLength` is incrementally maintained and supplies both
  LSP size suppression and the status notice without a document join.
- Diff overview projection is computed once per immutable alignment/track
  height with a monotonic pass and reused by subsequent frames.
- Diff active-change lookup is binary rather than a whole-block scan.
- Unit cost ratchets perform 10,000 unchanged fold reads and a
  100k-row/1,000-block diff projection, proving no unchanged-frame rescan.

## Final verification and exact exit codes

- Requested commit command
  `SKIP_GATE=1 git -c commit.gpgsign=false commit -F /tmp/scroll-feel-continuation-commit-message`:
  exit 0.
- `bun test`: exit 0; 1,594 pass, 0 fail, 27,071 expectations across
  243 files. Repeated after the commit hook formatted staged TypeScript:
  exit 0 with the same totals.
- `bunx tsc --noEmit`: exit 0; post-commit exit 0.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`:
  exit 0; 855 annotations and 45 lattice links resolved, 0 problems;
  post-commit exit 0.
- `bash scripts/conventions-gate.sh`: exit 0.
- `bun scripts/check-coverage-ratchet.ts`: exit 0; no undeclared decrease
  against `1563456`.
- `bun scripts/check-harness-wait-observation.ts`: exit 0; its 47 existing
  candidates remain report-only.
- `bash scripts/behavioral-contracts.sh`: exit 0, ALL-PASS, including the new
  six-case scale matrix and explicit 100k editor+diff floor.
- `bash -n scripts/behavioral-contracts.sh`: exit 0.
- `git diff --check`: exit 0.

Final-form isolated smoke repetitions:

| Smoke | Run 1 | Run 2 | Run 3 |
| --- | ---: | ---: | ---: |
| `smoke-editor-harness` | 0 | 0 | 0 |
| `smoke-scrollbars-harness` | 0 | 0 | 0 |
| `smoke-clipboard-frame-boundary-harness` | 0 | 0 | 0 |
| `smoke-panel-chrome-harness` | 0 | 0 | 0 |

After the final scrollbar wait refinement, that smoke was run three
additional times: exits 0 / 0 / 0.

One deliberately loaded run executed all four smokes concurrently:

- editor: exit 0;
- scrollbars: exit 0;
- clipboard frame boundary: exit 0;
- panel chrome: exit 0.

## Coverage declaration

`project.coverage-deltas.md` declares the only static census decrease:

- `smoke-clipboard-frame-boundary-harness.ts`: assertions 5 → 5, waits
  12 → 11. The two call sites were consolidated behind one semantic-anchor
  driver invoked for both anchors; both runtime predicates and all clipboard
  assertions remain.

All other touched counted files increased or held their assertion/wait
counts. The coverage ratchet confirms the declaration and reports no
undeclared decrease.

## Handoff

The worktree is clean at `1f745b1`. `scripts/merge-gate.sh` was not run.
Nothing was pushed, tagged, deleted, or retuned. The temporary per-frame
instrumentation and CPU-profiler wiring were removed before commit; only the
durable scale instrument, contract, fixes, tests, and documentation remain.

## Merge of origin/main at 3694b23

Fetched `origin` and merged `origin/main` commit
`3694b23239b64cbe8ece768ed2216f905fa87db8` into `fix-scroll-feel`.
The sole textual conflict was the append-only coverage ledger. It was
resolved by hand as a union: retain this branch's clipboard semantic-anchor
wait declaration and main's exhaustive ThemeIcons width-census plus
bounded-list-popup alignment declarations. Main's one-cell ⚿/▞ icon
vocabulary, empty width-exception list, full-vocabulary test, and
`BoundedListPopup` alignment work are present alongside the scroll-cadence,
large-file caching, 100k fixture, and 28 FPS floor from this branch.

Merge commit:

- `0d49d339cd23f2a4ff5a6717026f74ffc1d0fc9a`
- parent 1: `1f745b1d679c837f20bbd45cdc60fa814c744eea`
- parent 2: `3694b23239b64cbe8ece768ed2216f905fa87db8`
- committed with
  `SKIP_GATE=1 git -c commit.gpgsign=false commit -F /tmp/scroll-feel-merge-message.txt`;
  exit 0.

The commit hook ran Prettier on staged files, so the complete requested
verification set was repeated on the exact committed tip. Exact-tip results:

- `bun install --frozen-lockfile`: exit 0; 152 installs across 170 packages,
  no changes.
- `bunx tsc --noEmit`: exit 0.
- `bun test`: exit 0; 1,594 pass, 0 fail, 26,992 expectations across
  243 files.
- `bash scripts/conventions-gate.sh`: exit 0; 460 TypeScript files checked,
  0 file-grammar violations, text-input census 0.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`:
  exit 0; 855 annotations and 45 lattice links resolved, 0 problems.
- `bun scripts/check-coverage-ratchet.ts`: exit 0; 303 files inspected, no
  undeclared decrease against `3694b23`.
- `bash scripts/behavioral-contracts.sh`, run 1: exit 0; ALL-PASS; 100k
  editor+diff slowest sustained-fast cadence 29.8 FPS.
- `bash scripts/behavioral-contracts.sh`, run 2: exit 0; ALL-PASS; 100k
  editor+diff slowest sustained-fast cadence 30.0 FPS. This run waited the
  bounded 120 seconds for unrelated machine-wide quiet-lock holders, then
  followed the lock's documented proceed-unlocked policy.
- `bash scripts/behavioral-contracts.sh`, run 3: exit 0; ALL-PASS; 100k
  editor+diff slowest sustained-fast cadence 29.9 FPS.
- `bun scripts/harness/measure-scroll-smoothness.ts`: exit 0; output identifies
  commit `0d49d33`; 100k editor sustained-fast cadence 29.8–29.9 FPS and
  100k diff 30.3–30.7 FPS across three gestures.

The worktree is clean at `0d49d33`. `scripts/merge-gate.sh` was not run.
Nothing was pushed.

## Fold rehydration repair after landing-gate RED

Reproduced the backed-out merged-tree failure at `0d49d33` with
`origin/main` and the merge-base both at
`3694b23239b64cbe8ece768ed2216f905fa87db8`:

- the first environment-only attempt could not find Bun and exited 127;
- the real drive with `/home/parallels/.bun/bin` reached every preceding
  assertion, then timed out at “the rehydrated TypeScript document repaints
  its collapsed form” and exited 1.

Measured mechanism: `OpenBufferSet` attaches the persistent
`DocumentHandle.foldState` before `Editor.openFile`. `openFile` places the
cursor before setting `hasDocument`; that placement calls
`unfoldToRevealLine`, whose `collapsedFoldRanges` read memoized an empty
document-less projection under the freshly loaded document revision and fold
revision. Activation changed neither cache key, so the persistent collapsed
set remained present while visual-row projection reused the poisoned empty
snapshot. `foldRangeAtLine` still found the indexed range, explaining the
closed gutter marker alongside an expanded body.

Fix: `Editor.collapsedFoldRanges` now returns an inactive empty projection
without memoizing it. The existing stable-handle unit test now drives the
production order: attach fold state, load, place the cursor while inactive,
activate, then require the collapsed range to rebuild.

Commit:

- `4ad3287886e3704a1e24bd5ecbd1e0dd3c06e055`
- `Rebuild collapsed folds after document rehydration`
- first requested commit invocation before staging: exit 1, no commit
  created;
- staged exactly `Editor.ts` and `Editor.test.ts`;
- `SKIP_GATE=1 git -c commit.gpgsign=false commit -F
  /tmp/scroll-feel-rehydration-commit-message.txt`: exit 0.

Exact verification exits:

- focused `bun test src/modules/editor/Editor.test.ts`: 0; 22 pass, 0 fail;
- `smoke-code-folding-harness.ts` runs 1/2/3: 0 / 0 / 0, each including the
  switch-back collapsed repaint;
- `behavioral-contracts.sh` runs 1/2/3: 0 / 0 / 0, ALL-PASS;
- 100k editor+diff slowest sustained-fast cadence in those contract runs:
  29.8 / 29.9 / 29.8 FPS against the unchanged 28 FPS floor;
- `measure-scroll-smoothness.ts`: 0; 100k editor sustained-fast
  29.8–30.4 FPS and 100k diff 30.5–31.9 FPS;
- `scripts/conventions-gate.sh`: 0;
- invariant checker `--all`: 0;
- invariant checker `--all --refs`: 0; 855 annotations and 45 lattice links
  resolved, 0 problems;
- `check-coverage-ratchet.ts`: 0; 303 files, no undeclared decrease against
  `3694b23`;
- `check-reactive-observation.ts`: 0; positive control passed, 0 candidates;
- `check-harness-wait-observation.ts`: 0; 47 existing report-only
  candidates;
- `bunx tsc --noEmit`: 0;
- full `bun test`: 0; 1,594 pass, 0 fail, 26,992 expectations across 243
  files;
- pre-edit invariant checker `--all --refs`: 0;
- `git diff --check` / staged diff check: 0.

The worktree is clean at `4ad3287`. `scripts/merge-gate.sh` was not run.
The unrelated terminal-follow smoke was not run or modified. Nothing was
pushed.
