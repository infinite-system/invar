# Fold-scroll cost — READY

Branch: `fix-fold-scroll-cost`

Base: `4ad3287`

Commit: `3baba8a Fix fold-dense editor scroll cost`

Working tree: clean

## Outcome

- Added exact-size 26,635- and 100,000-line fold-dense JSON fixtures shaped
  like package metadata: nested objects, arrays, long keys, and valid JSON.
- Exact attribution named `BracketMatch.findInDocument`. With the cursor on
  the root `{`, it rescanned and syntax-classified up to 100,000 cells before
  every render. Temporary frame attribution measured the downstream fold
  projection at about 0.10 ms/frame, all visible fold-marker lookups together
  at about 0.02 ms/frame, and the complete editor renderer under 0.7 ms; the
  roughly 540 ms delay was before that boundary in bracket matching.
- `BracketMatch.findInDocument` now caches by document revision, cursor line,
  cursor column, and language. The 10,000-frame positive-control test proves
  unchanged frames perform zero additional document-line reads and a revision
  change invalidates the snapshot.
- `EditorWrap` now caches one collapsed-fold projection. Hidden-line,
  fold-header, visible-line, and past-end lookups are O(1); the visible window
  jumps across a collapsed body instead of walking it. The 100k/10,000-frame
  test proves one projection build and viewport-sized document reads.
- Added host schema contribution `editor.codeFolding`, default `true`.
  Disabling it live-expands content, removes gutter controls, supplies no fold
  ranges to visual projection, and returns before structural discovery.
- Fold toggles preserve the pre-toggle topmost document row through the new
  visual-row projection. The driven smoke verifies pointer and keyboard
  collapse/unfold around line 530 keep the top line at 508 and never reveal
  line zero.
- The permanent 100k behavioral ratchet drives folding, indent guides, syntax,
  and real version-control gutter marks together, with a 28 FPS floor.

## Sustained-fast FPS

Historical `4ad3287`:

| Lines | Fixture | Folding label | FPS |
| ---: | --- | --- | ---: |
| 26,635 | flat | on | 30.0 |
| 26,635 | flat | off | 29.6 |
| 26,635 | fold-dense JSON | on | 13.8 |
| 26,635 | fold-dense JSON | off | 13.3 |
| 100,000 | flat | on | 29.8 |
| 100,000 | flat | off | 29.8 |
| 100,000 | fold-dense JSON | on | 14.6 |
| 100,000 | fold-dense JSON | off | 13.4 |

The base revision did not yet recognize `editor.codeFolding`; its on/off rows
therefore intentionally measure the same old path and demonstrate that the
unknown setting could not remove the cost.

Committed result:

| Lines | Fixture | Folding | FPS |
| ---: | --- | --- | ---: |
| 26,635 | flat | on | 30.4 |
| 26,635 | flat | off | 30.2 |
| 26,635 | fold-dense JSON + marks | on | 29.7 |
| 26,635 | fold-dense JSON + marks | off | 30.4 |
| 100,000 | flat | on | 30.0 |
| 100,000 | flat | off | 30.2 |
| 100,000 | fold-dense JSON + marks | on | 30.0 |
| 100,000 | fold-dense JSON + marks | off | 30.5 |

The final two-gesture 100k full-stack ratchet measured a minimum of
`30.206 FPS` with folding on, indent guides on, and version-control marks
visibly confirmed from the terminal emulator grid.

## Verification

All commands exited 0:

- `bun install --frozen-lockfile`
- `bash scripts/conventions-gate.sh`
- invariant checker `--all`
- invariant checker `--all --refs`: 856 annotations, 45 lattice links,
  0 problems
- `bun scripts/check-reactive-observation.ts`: 0 candidates
- `bun scripts/check-coverage-ratchet.ts`: no undeclared decrease
- `bunx tsc --noEmit`
- `bun test`: 1,599 pass, 0 fail, 67,018 expectations
- `bun scripts/harness/smoke-code-folding-harness.ts`, three consecutive
  successful runs
- `bash scripts/behavioral-contracts.sh`: ALL-PASS
  - 100k full stack: 30.1 FPS minimum in that run
  - idle quiescence: frame 3 to frame 3 over three untouched seconds
- final standalone two-gesture 100k full-stack ratchet: 30.2 FPS minimum
- `git diff --check`

Coverage declarations were appended, using the counted grammar, for the five
changed test/smoke files. Counts all increased:

- folding smoke: assertions 8 → 15, waits 21 → 38
- bracket matching: assertions 12 → 17, waits 12 → 13
- editor: assertions 72 → 88, waits 22 → 24
- editor wrap: assertions 73 → 80, waits 31 → 32
- workspace set: assertions 15 → 17, waits 3 → 4

No merge gate, push, merge, tag, or branch deletion was performed.

---

# Fold-scroll cost round 2 — READY

Branch: `fix-fold-scroll-cost`

Merged main: `ac868f4`

## Outcome

- Merged `origin/main` by hand. The accepted folding, bracket-match cache,
  collapsed-fold projection, live `editor.codeFolding` setting, and deep
  viewport anchoring survive alongside main's extracted inline-rewrite plugin.
- The 100k editor contract now treats document size and scroll depth as
  separate axes. It direct-navigates to fixture lines 0, 50,000, and 75,000,
  observes the cursor/navigation condition, closes Find, and drains to actual
  frame quiescence before sampling.
- Setup frames are excluded. Each checkpoint then drives at least 1,000 rows
  with real wheel input and independently enforces the 28 FPS floor.
- The report contains target depth, actual visible start, rows travelled, FPS,
  and the ratio to depth 0 for every checkpoint.
- The same drive runs on valid fold-dense JSON with code folding, indent
  guides, and version-control gutter marks all enabled.
- The independent floor positive control produced the expected red:
  `positive-control depth-75000 checkpoint 27.0 FPS is below 28 FPS`.
- No falling depth ratio was found, so no new per-frame callee attribution was
  warranted. The final run stayed between 0.999 and 1.000 at depth.

## Final depth table

| Fixture | Target | Actual start | Rows | FPS | Ratio |
| --- | ---: | ---: | ---: | ---: | ---: |
| flat | 0 | 0 | 1,005 | 30.011 | 1.000 |
| flat | 50,000 | 49,969 | 1,006 | 29.984 | 0.999 |
| flat | 75,000 | 74,969 | 1,005 | 30.002 | 1.000 |
| fold-dense + guides + marks | 0 | 0 | 1,005 | 30.023 | 1.000 |
| fold-dense + guides + marks | 50,000 | 49,969 | 1,006 | 29.998 | 0.999 |
| fold-dense + guides + marks | 75,000 | 74,969 | 1,006 | 30.028 | 1.000 |

Find places the exact target line inside the viewport; the visible top is 31
rows above the target on the two deep checkpoints.

## Added wall clock

The final JSON reports 24.576 seconds of flat checkpoint work and 27.554
seconds of fold-dense checkpoint work: 52.130 seconds total. A clean full
behavioral run took 139 seconds, so the new work is 37.5% of that suite. This
is more than a modest fraction; the measured gesture was therefore cut to the
minimum allowed 1,000 rows while all six required checkpoints were retained.

## Final verification

Every required command exited 0 on the final tree:

- `bun install --frozen-lockfile`: 0
- `bunx tsc --noEmit`: 0
- `bun test`: 0 — 1,609 pass, 0 fail, 67,061 expectations
- `bash scripts/conventions-gate.sh`: 0
- invariant checker `--all --refs`: 0 — 857 annotations, 45 lattice
  references, 0 problems
- `bun scripts/check-coverage-ratchet.ts`: 0 — no undeclared decrease
- `bash scripts/behavioral-contracts.sh`: 0, 0, 0
  - durations: 146 seconds, 139 seconds, and 259 seconds
  - the third duration includes a 120-second wait for an unrelated
    machine-wide lock holder; the suite then passed every cadence floor
- `bun scripts/harness/smoke-code-folding-harness.ts`: 0, 0, 0
- `bun scripts/harness/smoke-inline-rewrite-harness.ts`: 0, 0, 0
- `git diff --check` and staged diff check: 0

The round-1 and main coverage declarations are preserved in the counted
grammar. No merge gate, push, tag, branch deletion, or branch integration was
performed. The only merge was the explicitly required merge of `origin/main`
into this work branch.

Commit: `674cfdd26df67e985472387aca85bf234022aa73`

Commit command exit: `0`

Working tree after commit: clean

---

# Fold-scroll cost round 3 — READY

Branch: `fix-fold-scroll-cost`

Commit: `8e00b7477e3ec3159a344081d666c69de7d5a344`

## Glide-smoothness repair

- The supplied failure was a real stale-condition wait. After typing the
  fixture name, the old grid predicate searched the whole terminal for that
  name. The Files pane already displayed it behind Quick Open, so the wait
  could pass before asynchronous Quick Open enumeration had produced an
  activatable match. Enter then activated no file and the editor stayed empty.
- Every measurement case starts a fresh app, ruling out Find-state leakage
  between cases. The contract also leaves `SMOOTHNESS_FIXTURES` unset, so this
  failure was on the flat fixture axis rather than a new shape/extension pair.
- Quick Open now waits on the authoritative status projection: the overlay is
  open, its query equals the fixture name, it has exactly one match, and index
  zero is selected. After Enter, a second status wait requires the exact
  fixture to become the active buffer before the grid wait checks its first
  line.
- The instrument now prints each case before starting it, so any future
  timeout records line count, surface, shape, and folding mode directly.
- Three pre-fix attempts on this machine did not reproduce the intermittent
  red: the exact instrument was exit 0 in 55.86 seconds, the full contract was
  exit 0 in 139.65 seconds, and the labeled exact instrument was exit 0 in
  55.65 seconds. The mechanism follows from the supplied two idle failures,
  captured empty-editor frame, and the proven already-true predicate.

## One depth checkpoint

- Flat 100k editor cases again run their ordinary top-of-file gestures and
  produce zero depth checkpoints.
- The only depth drive is the 100k fold-dense editor with folding, indent
  guides, and version-control gutter marks enabled. It jumps to line 75,000
  and drives at least 1,000 real wheel rows against the 28 FPS floor.
- The current run's slowest flat 100k editor top gesture supplies the ratio
  reference through `SMOOTHNESS_DEPTH_REFERENCE_FPS`; depth zero is not
  remeasured.
- Final checkpoint: target 75,000; actual visible start 74,969; 1,006 rows;
  29.997 FPS; ratio 0.999.
- Final added depth wall clock: 9.149 seconds. The complete fold-dense
  instrument, including fixture and app setup, took 10.453 seconds.
- The positive control still produced the required red:
  `positive-control depth-75000 checkpoint 27.0 FPS is below 28 FPS`.

## Contract runtime

- Before: 139.65 seconds on the pre-change tree.
- After: 101.38, 101.05, and 101.40 seconds.
- The post-change median was 101.38 seconds, 38.27 seconds below the measured
  pre-change run.

## Verification

Every required command exited 0:

- `bunx tsc --noEmit`: 0
- `bun test`: 0 — 1,632 pass, 0 fail, 67,113 expectations
- `bash scripts/conventions-gate.sh`: 0
- invariant checker `--all --refs`: 0 — 860 annotations, 45 lattice links,
  0 problems
- `bun scripts/check-coverage-ratchet.ts`: 0 — no undeclared decrease
- `bash scripts/behavioral-contracts.sh`: 0, 0, 0
- `bun scripts/harness/smoke-code-folding-harness.ts`: 0, 0, 0
- `bun scripts/harness/smoke-inline-rewrite-harness.ts`: 0, 0, 0
- `git diff --check`: 0
- commit command: 0

The generated untracked fold-dense JSON was removed to leave the tree clean;
its pre-task contents are recoverable at
`/tmp/foldperf-round3-preexisting-fold-dense.json`.

No merge gate, push, merge, tag, branch deletion, or branch integration was
performed.

Working tree after commit: clean

---

# Fold-scroll cost round 4 — READY

Branch: `fix-fold-scroll-cost`

Commit: `e50074842336ab6ea3a90001a12b08caba5d6fbd`

## Finding and repair

- `awaitStatusCondition` now retains the last successfully parsed status and
  includes the status path plus the complete pretty-printed object in its
  timeout error. The status object contains every key touched by each
  predicate. `PtyTestDriver.awaitGridCondition` already reports its final
  relevant grid region, so it did not have the same diagnostic hole.
- Diagnostic positive control: the selected-index requirement was temporarily
  forced to the impossible value `-999999`. The direct instrument exited `1`
  and reported the actual values:
  `quickOpenOpen=true`, `quickOpenQuery="flat-002000.txt"`,
  `quickOpenMatches=1`, and `quickOpenSelected=0`.
- Direct failure reproduction used the app's supported no-ripgrep path by
  removing `rg` from the child `PATH`. It exited `1` and the improved error
  reported:
  `quickOpenOpen=true`, `quickOpenQuery="flat-002000.txt"`,
  `quickOpenMatches=0`, and `quickOpenSelected=-1`.
- The mechanism was the flat editor fixture returning before Git
  initialization. Quick Open first runs `rg --files`, then falls back to
  `git ls-files`; without optional ripgrep, neither enumerator could return the
  untracked file in a non-repository fixture root.
- Every generated scroll fixture is now a one-file Git repository before any
  surface-specific early return. The direct no-ripgrep reproduction then
  exited `0`.
- The activatability predicate remains strict: the query must equal the exact
  fixture name, the one-file repository must produce exactly one match, and
  index zero must be selected. Because the repository has only that tracked
  candidate, the selected match can only be the intended fixture; Enter is
  then separately checked to make that exact file the active buffer. No
  timeout was raised.

## Depth checkpoint

The final behavioral run preserved the accepted one-checkpoint shape:

| Target | Actual start | Rows | FPS | Ratio to 100k top |
| ---: | ---: | ---: | ---: | ---: |
| 75,000 | 74,969 | 1,006 | 30.015 | 1.000 |

- Added depth wall clock: 9.102 seconds.
- Complete fold-dense instrument wall clock: 10.404 seconds.
- Positive control remained red:
  `positive-control depth-75000 checkpoint 27.0 FPS is below 28 FPS`.

## Verification

Every required command exited 0 on the committed tree:

- `bun install --frozen-lockfile`: 0
- `bunx tsc --noEmit`: 0
- `bun test`: 0 — 1,632 pass, 0 fail, 67,113 expectations
- `bash scripts/conventions-gate.sh`: 0
- invariant checker `--all --refs`: 0 — 862 annotations, 45 lattice links,
  0 problems
- `bun scripts/check-coverage-ratchet.ts`: 0 — no undeclared decrease
- direct no-ripgrep Quick Open fallback reproduction: 0
- `bash scripts/behavioral-contracts.sh`: 0, 0, 0
  - durations: 102, 101, and 101 seconds
  - every run printed `behavioral-contracts: ALL-PASS`
  - checkpoint rows: 1,006, 1,005, and 1,006; every run reported 30.0 FPS
- `bun scripts/harness/smoke-code-folding-harness.ts`: 0, 0, 0
- `bun scripts/harness/smoke-inline-rewrite-harness.ts`: 0, 0, 0
- `git diff --check` and staged diff check: 0
- commit command: 0

The generated untracked fold-dense JSON was moved out of the worktree and is
recoverable at
`/tmp/foldperf-round4-generated-fold-dense-scroll-smoothness.json`.

No merge gate, push, merge, tag, branch deletion, or branch integration was
performed.

Working tree after commit: clean
