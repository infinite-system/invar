# #196 — the flyweight frame for the editor wrap index

Written 2026-07-28 after the user pointed at ivue's flyweight guide and example. This is the
structural frame the #196 brief points at; the brief itself carries the measurement ladder.


=== THE IVUE FLYWEIGHT PATTERN IS THE FRAME, AND ITS IMPOSSIBILITY BOUNDARY IS THE ACCEPTANCE TEST ===

The user pointed at ivue's flyweight guide and example. Read all of it before starting:
  ../ivue/docs_v2/guide/flyweight.md
  ../ivue/examples/playground/src/examples/flyweight-grid/Flyweight.invariants.md   <- the load-bearing one
  ../ivue/examples/playground/src/examples/flyweight-grid/model/FlyweightSheet.ts   (616 lines)
  ../ivue/examples/playground/src/examples/flyweight-grid/model/FlyweightCell.ts    (61 lines)
  ../ivue/examples/playground/src/examples/flyweight-grid/DESIGN.md and RESULTS.md

Master invariant: "Everything costs proportional to what's observed; nothing costs proportional to
what exists." Measured there: 20,000,000 cells at 4.69 bytes each, +0.3 MB after 30 viewports.

ITS IMPOSSIBILITY BOUNDARY ALREADY FORBIDS WHAT THE EDITOR DOES. Two entries, verbatim:
  - "an interaction whose cost is O(total cells)"
  - "a full-document recalculation, ever"

A keystroke in a 500,000-line file costs O(total lines), and buildPrefix IS a full-document
recalculation. So this is not a pattern we might adopt — the editor is the one place in Invar still
priced by existence, and these are the terms to fix it in.

THE STRUCTURAL CORRESPONDENCE, checked against the source rather than assumed:

| FlyweightSheet | editor equivalent | status |
|---|---|---|
| `columns[col].kind: Uint8Array` — plain, non-reactive ground truth | `TextDocument._lines: string[]` | ALREADY RIGHT |
| `numbers: Float64Array`, lazily allocated | `index.rowCounts: number[]` | -> Uint32Array, 2 MB at 500k |
| `blockVersions`, 4096-row blocks, "245 edges not a million" | `index.prefix`, a FLAT 500,001-entry cumulative sum | -> per-block sums + running total: 122 numbers |
| `write()`: update storage, bump fine, bump block — PEEK-ONLY | `syncWrapIndex` rebuilds four length-n arrays | -> patch one line, one block, one total |
| facade = 3 fields, created per render, dropped on scroll | `segmentsForLine(...)` computes segments, keeps only `.length` | ALREADY RIGHT |
| `lineTexts: string[]` — a 500k shadow copy of `_lines` | | FORBIDDEN, see below |

`lineTexts` violates "Ground Truth Lives in Plain Storage; Refs Are Version Signals" — that entry's
reason is exactly ours: "Values in refs would duplicate ground truth and desynchronize." The shadow
copy exists ONLY so the head/tail trim has something to diff against, and `replaceLineRange` already
knows which lines changed. Pass the range; delete the duplicate.

ONE THING THE EDITOR ALREADY GETS RIGHT, do not break it: `index.revision` is a version guard over
plain derived storage, which is the record's shape. The block sums must be the same — plain
`Uint32Array` derived cache guarded by revision, NOT refs holding values. The defect is that the
revision guard triggers an O(n) REBUILD instead of an O(1) PATCH.

WHERE THE EDITOR LEGITIMATELY DIFFERS — state this in the report, do not claim parity. A cell's value
does not depend on other cells existing, so the grid can EVICT to O(viewport). A scroll EXTENT does
depend on every line, so `rowCounts` cannot be evicted; the honest target is O(document) with a
4-byte-per-line constant plus 122 block sums, not O(viewport). The block tier is how that floor is
paid cheaply, not how it is escaped. Eviction applies only to per-line SEGMENTS, which are already
disposable.

THE ACCEPTANCE TEST WRITES ITSELF, and it is better than a millisecond target. The repo already has
the idiom from #133 — "scale-invariance as the contract: ratio ~ 1 across the size axis, asserted on
LOAD-INVARIANT COUNTS." Apply it to the flyweight boundary:

  - count the array element writes and allocations performed per keystroke, and assert the count is
    bounded by (changed lines + blocks touched) INDEPENDENT of document size. 2k / 20k / 100k / 500k
    must give the same count. A millisecond threshold can be met by a faster machine; a count cannot.
  - assert no edit rebuilds the prefix: a structural post-check that the per-edit path contains no
    O(lineCount) loop, in the spirit of #168's AST census reporting zero identifiers.

That converts "typing feels slow" into a contract the gate can hold forever, which is the whole point
of the exercise and the reason it outranks shaving milliseconds.
