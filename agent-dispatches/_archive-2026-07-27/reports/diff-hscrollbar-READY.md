# READY — Diff horizontal scrollbar stability

## Result

READY on `fix-diff-horizontal-scrollbar`.

Commit: `49c6a5ebab886d9d99a22f58d1db690613b52338`
(`Stabilize diff horizontal scrollbar geometry`)

The diff view now captures its full content width once when the comparison
revision is constructed. Vertical scrolling only changes the visible aligned
row window; it cannot remeasure or repaint the horizontal scrollbar row.
Opening a refreshed comparison after a real width-changing edit constructs a
new width value.

The shared scrollbar geometry and painter were not forked or changed.

## Reduction and implementation

The reproduced cause was `DiffView.widestVisibleLineWidth()`: both horizontal
scrollbar geometry and horizontal-offset clamping rescanned the currently
visible aligned rows. Different vertical windows therefore produced different
bar cells.

`DiffView.contentWidth` now takes the maximum of the two documents'
`maximumLineWidth` values once in the constructor. `TextDocument` owns that
exact display-width aggregate per document revision, including terminal-width
measurement for tabs and wide graphemes. Diff refresh constructs a new
`DiffView`, so revision invalidation remains at the content-owning seam.

Changed files:

- `src/modules/diff/DiffView.ts`
- `src/modules/diff/diff.invariants.md`
- `scripts/harness/smoke-scrollbars-harness.ts`
- `project.coverage-deltas.md`

## Before/after frame-region evidence

Before the production fix, the new real-PTY drive failed after 167 complete
vertical-scroll frames. The complete horizontal scrollbar row changed among
three SHA-256 hashes:

- `4ef20360b74a77e563eb2210e287113827e7a3818e13f31cf245111569cf82e6`
- `e7cbfd91aaf8916b8e3fddb016e70bf9f17cc203202a1ee3b04708dba22ac5ad`
- `1b42aa768829c4588fde6524f103f6c769512f8371e3e5479831ec7380ba44fc`

After the fix, every captured row is byte-identical. The post-commit run
captured 168 complete scroll frames with the single hash
`1b42aa768829c4588fde6524f103f6c769512f8371e3e5479831ec7380ba44fc`.

The positive control edits the widest line through the real editor, saves it,
reopens the diff, and observes the horizontal thumb shrink from 28 to 16 cells.

## Verification

Every listed command exited 0:

| Check | Result |
| --- | --- |
| `bun install --frozen-lockfile` | exit 0 |
| `bunx tsc --noEmit` | exit 0 |
| `bun test` | exit 0; 1553 pass, 0 fail, 16975 expectations |
| `bun scripts/check-file-grammar.ts` | exit 0; 452 files, 0 violations |
| invariant checker `--all --refs` | exit 0; 828 annotations, 45 links, 0 problems |
| `bun scripts/check-coverage-ratchet.ts` | exit 0 |
| `bash scripts/conventions-gate.sh` | exit 0; PASS |
| `bash scripts/behavioral-contracts.sh` | exit 0; ALL-PASS |
| relevant diff/TextDocument tests, post-commit | exit 0; 29 pass, 0 fail |
| scrollbar PTY smoke, post-commit | exit 0; ALL-PASS |

`idle-quiescence` remained green: frame 2 to frame 2 across three untouched
seconds.

Repeated quiet smoke matrix:

| Smoke | Run 1 | Run 2 | Run 3 |
| --- | --- | --- | --- |
| `smoke-diff-overview-harness.ts` | exit 0 | exit 0 | exit 0 |
| `smoke-scrollbars-harness.ts` | exit 0 | exit 0 | exit 0 |

Loaded run: the full `bun test` suite and both PTY smoke harnesses ran
concurrently. All three exited 0; both smokes reported `ALL-PASS`.

An additional legacy `bash scripts/smoke-scrollbars.sh` probe exits 1 on the
unchanged base commit `d61124d` as well as this branch:
`git painted 0 horizontal bar rows, expected at least 2`. Its older detector
rejects the full-width track-colored row that is visibly present. This branch
does not touch that legacy detector or path; the task's cell-level PTY harness
is green in every quiet and loaded run.

## Contract and coverage

The existing “Diff rendering stays viewport bounded” invariant now records
that horizontal scrollbar geometry is a function of the comparison revision's
full-content width and the live viewport, never the vertical scroll position.
Its evidence and impossible states include both byte-stable vertical scrolling
and refresh after a widest-line edit.

The counted coverage declaration was appended:
`smoke-scrollbars-harness.ts` moved from 36 assertions / 30 waits to
40 assertions / 34 waits.

## Handoff state

`git status --short` is empty. No merge gate, push, merge, tag, branch deletion,
or worktree deletion was performed.
