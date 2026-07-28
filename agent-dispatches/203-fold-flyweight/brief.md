# TASK — the flyweight does not survive folding: one collapsed region reverts the editor to O(n)

USER-CONFIRMED BY DRIVING, 2026-07-28. Not a hypothesis. The user folded the outermost region in
both new nested fixtures and reported: "when i fold the level 0 it's slow to load and then slow to
edit, in both nested and the nested-1m". They also named the direction: "Uint32Array is prolly the
way." They are right on both counts, and the reduction below says exactly why.

This is the immediate follow-on to the landed flyweight work, which made per-keystroke cost
independent of document size — measured as identical array-write counts at 2k and 1M. That result
holds ONLY while nothing is collapsed. This task restores it for the folded case.

## Your base — you are branching off the flyweight work, not off main

This task branches from the tree that CARRIES the flyweight port, not from `main`. Branching from
main would give you an editor without the block tier and the task would be meaningless.

Consequence to know but not act on: this work cannot land on main before the flyweight work does,
and that is currently blocked on an unrelated gate red in the reserved-chord harness. Do not try to
resolve that, do not run the merge gate, and do not treat main's state as your problem. Build on the
base you are given.

## The prior work is a COMMITTED RECORD — read it, do not re-derive it

The builder that did the flyweight port is not in this session, and you do not need it to be. Its
full brief and its full report are committed in this repo:

- `agent-dispatches/196-scale/brief.md` — the structural frame it was given, including where the
  editor legitimately differs from a cell grid (a scroll extent depends on every line, so per-line
  row counts cannot be evicted to O(viewport)).
- `agent-dispatches/196-scale/report.md` — what it actually did and measured: the block tier instead
  of a Fenwick tree, the identical per-keystroke counts at 2k and 1M, the load-path fast path, the
  downstream deletions, and the limits it explicitly left standing.

Read both before writing code. In particular, establish from the report whether leaving
`visibleLineByLine` as a plain array was DELIBERATE — if it was, there is a reason recorded and your
fix must respect it or argue explicitly against it. An omission with a stated reason is different
from an omission that was missed, and the two call for different repairs.

## Read these first

- `.claude/skills/ivue/` — the reactive substrate. The governing invariant is
  "everything costs proportional to what is observed; nothing costs proportional to what exists,"
  and its impossibility boundary forbids an INTERACTION whose cost is O(total) and forbids a full
  document recalculation. A keystroke is an interaction. Read
  `../ivue/docs_v2/guide/flyweight.md` and `../ivue/docs_v2/examples/flyweight-grid.md` — the
  20,000,000-cell grid at 4.69 bytes per cell is the shape being replicated here, and the reason
  typed arrays are the mechanism rather than a micro-optimisation.
- `.claude/skills/invariants/` — record format, annotation discipline, the checker.
- IBR: reduce to the load-bearing generator before writing code. Two of the three defects below are
  the SAME defect (a full-length allocation on an interaction path); do not fix them as three.
- `src/modules/editor/editor.invariants.md` and `scroll.invariants.md` — the existing records this
  work must extend rather than contradict.

## The chain, already traced — verify each link, then reduce

1. `Editor.collapsedFoldRanges` (`src/modules/editor/Editor.ts:114-140`) caches on
   `documentRevision + foldRevision`. EVERY KEYSTROKE bumps `document.revision`, so the cache misses
   and line 134 recomputes `this.foldRanges().filter(...)`, producing a **new array instance** per
   keystroke.
2. `Editor.foldRanges()` (`Editor.ts:106-112`) calls
   `CodeFolding.Class.ranges(document, language)` — a whole-document bracket/indent scan.
   **Establish whether it memoises, and on what key.** If its cache is also revision-keyed, that is
   a SECOND independent O(n) scan per keystroke and it must be reported as its own number, not
   folded into the wrap cost.
3. `EditorWrap.indexFor` (`src/modules/editor/EditorWrap.ts:428-432`) rebuilds the whole index
   whenever `index.foldedRanges !== normalizedFoldRanges` — an **identity** comparison. The fresh
   array from step 1 fails it on every keystroke.
4. `buildDocumentWrapIndex` (`EditorWrap.ts:358-373`) then re-wraps EVERY line via
   `segmentsForLine(document.line(lineIndex), width)`, rebuilds the block sums, and rebuilds the
   fold projection.

Why the landed work still measured O(1): `EditorWrap.ts:422-423` normalises any EMPTY fold array to
the shared `$emptyFoldRanges` singleton, and `Editor.ts:128-132` returns early when
`collapsedLineStarts.size === 0`. With nothing collapsed the identity holds across revisions and the
fast path is reached. One collapsed region removes both escapes at once. The previous fixture was
flat with nothing collapsed, so it never left the singleton path — this is partial coverage that
presented as total, and the class matters more than the instance.

## The missed conversion — this is the load-bearing find

`EditorWrap.buildFoldProjection` (`EditorWrap.ts:711-742`) line 715:

```ts
const visibleLineByLine = Array.from(
  { length: lineCount }, (_unusedValue, lineIndex) => lineIndex,
);
```

A **plain JS array of `lineCount` numbers** — at 970,356 lines that is roughly 8 MB of boxed
storage, allocated and identity-filled on every projection rebuild. `rowCounts` and `blockRowCounts`
were converted to `Uint32Array` (`allocateRowCounts`, `allocateBlockRowCounts`,
`EditorWrap.ts:307-312`); `visibleLineByLine` was left behind, and it is the ONLY one of the three
that folding reaches. Both symptoms the user felt — slow to load AND slow to edit — are consistent
with this single allocation.

Two reductions available here, and the second is the better one:

- Convert to `Uint32Array`. Correct, and what the user proposed.
- Better: **eliminate the O(n) identity fill entirely.** The array currently means "visible if
  `visibleLineByLine[i] === i`", which forces an initialising pass over every line just to say
  "nothing is folded yet". Re-encode so that the ZERO value means "visible, maps to self" — for
  example store `startLine + 1` for a folded line and `0` otherwise. A fresh `Uint32Array` is
  already zero-filled by the allocator, so the unfolded case costs no initialisation at all and the
  folded case costs only the collapsed spans. That turns an O(lineCount) fill into O(folded lines).
  Every read site must move with the encoding — `EditorWrap.ts:365, 504, 590, 726, 733, 740` and
  any others; find them, do not trust this list as complete.

Note the ordering: converting the array type alone leaves an O(n) fill on the keystroke path. The
encoding change is what removes it. Do both, and report their effects separately so it is visible
which one carried the win.

## The identity comparison — fix the PRODUCER, not the check

Do NOT loosen `EditorWrap.ts:431` into a deep array compare: comparing a large range list is itself
per-keystroke cost proportional to the fold count, and it would trade one scaling defect for a
smaller one. The identity check is correct; its input is not.

Make `Editor.collapsedFoldRanges` return the SAME array instance when the collapsed set and the
fold structure have not changed, even though the document revision moved. Collapsed state is keyed
on start lines, and an ordinary edit that touches no fold boundary leaves the range list equal — the
common case, and it should be identity-stable. Then a keystroke inside a folded document reaches the
existing incremental patch path instead of a rebuild.

Be careful about the edits that legitimately DO change the list — inserting or deleting lines shifts
start lines, and typing a bracket can create or destroy a region. Those must still invalidate. A
stale fold projection would mis-map visual rows to document lines, which renders wrong text at the
wrong row: strictly worse than being slow. State how you established the invalidation is complete.

## What must be proven, and how

Assert on COUNTS, not milliseconds — a faster machine beats a threshold, nothing beats a count.
This repo already asserts scale-invariance on load-invariant counts; extend that, do not re-roll it.

Required results:

1. Per-keystroke array-write and allocation counts **identical with 0 regions collapsed and with 1
   level-0 region collapsed** (138,622 lines, spanning ~34 blocks).
2. The same counts **identical at 554,490 and 970,356 lines** — the fold axis and the size axis are
   independent and both must be flat.
3. Counts for collapsing/expanding a level-0 region that do NOT scale with document size. The first
   build after load is legitimately O(n) — you cannot know the total row count without wrapping every
   line once — so state that boundary explicitly rather than pretending the toggle is free.
4. End-to-end editing latency distributions at both fixture sizes, folded and unfolded, reported as
   distributions with load average beside every number. Not ordered by size is the pass condition.
5. If `CodeFolding.Class.ranges` turns out to rescan per revision, its own before/after count.

POSITIVE CONTROLS ARE MANDATORY. Every check here can only fail toward "pass": a write counter that
is never incremented reads as a perfect result, and an instrument that observes an unfolded document
reads as a flat fold axis. For each new assertion, break it deliberately, show it RED, then restore
it and show it green. An instrument with no demonstrated red is not evidence.

## Fixtures — already generated and verified

```
tmp/invar-scale-test/nested.json      554,490 lines · 30,518,207 bytes · 4 top-level groups
tmp/invar-scale-test/nested-1m.json   970,356 lines · 53,406,860 bytes · 7 top-level groups
tmp/invar-scale-test/huge.ts          500,000 lines · 39,048,738 bytes (flat, for comparison)
tmp/invar-scale-test/huge-1m.ts     1,000,000 lines · 78,111,238 bytes (flat)
```

Generator: `scripts/make-nested-fold-fixture.ts --lines N --output PATH`. Both JSON fixtures were
verified as valid JSON with object depth 8. Fold region sizes straddle both the viewport and the
4096-line block (`EditorWrap.BLOCK_SHIFT`) on purpose:

```
level 0: 138,622 lines — 33.8 blocks    level 4:   138 lines
level 1:  13,862 lines —  3.4 blocks    level 5:    34 lines
level 2:   2,772 lines — sub-block      level 6:     8 lines
level 3:     554 lines — sub-block
```

A single level-0 collapse hides ~34 whole blocks, which is the case a per-block row-count tier must
handle by invalidating a RUN of block sums rather than one. The flat fixtures cannot produce it —
every region there is a few lines and none crosses a block boundary. If you add a fixture, add it to
the generator; do not hand-roll a second one.

`tsconfig.json` carries `"exclude": ["tmp"]` for these fixtures. Without it `tsc` walks the
filesystem, ingests the 500k-line file and emits ~125,000 errors. Do not remove it, and if you move
the fixtures, move the exclude with them.

## Verify by driving, not by measuring in isolation

Drive the REAL app at both fixture sizes before and after: open the file, collapse a level-0 region,
type, scroll deep, expand it, type again. A component measurement that improves while the real path
does not is not a fix. The known hazard in this area is a guard keyed on an aggregate the operation
does not move — a converge check on total width will silently no-op on a fold change.

## Repo law

`export let Class = $Class`; the `Static()` wrapper lives at the `$Class` anchor; `Reactive()` is
exempt. Invariant records live at `src/modules/<domain>/<domain>.invariants.md` and are cited by
ROOT-RELATIVE path. Full descriptive identifier names — `lineIndex` not `i`, `increment` not `inc`.
80 columns. This list is a FRAGMENT, not a substitute for reading the conventions and the skills.

Update the invariant records. If the reduction is real the records should get SHORTER or stay level
while covering more — a record that grows to describe a fix is a signal the fix added structure
instead of removing it.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (zero problems; do not
chase an annotation count, read the number off this tree), `bun scripts/check-coverage-ratchet.ts`,
`bash scripts/behavioral-contracts.sh`, plus every count table and distribution above.

Do NOT run `scripts/merge-gate.sh`, do not push, merge, tag, or delete branches. Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>` and leave the tree clean.

Write the report to `/tmp/203-fold-READY.md`: what was reduced, the count tables, each positive
control shown red then green, the exact exit codes, and anything you could NOT establish. An honest
negative or partial result is a valid deliverable; a confident claim that measurement does not
support is not. If the level-0 slowness turns out to have a cause other than the chain above, say so
plainly and report the cause you found instead — the traced chain is a strong lead, not a verdict.
