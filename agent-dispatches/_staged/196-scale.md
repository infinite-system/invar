# TASK — #196: make a 500,000-line file usable. USER-DIRECTED, TOP PRIORITY.

Work ONLY in this worktree. Branch `fleet/196-scale`. Do NOT push, merge, tag or delete. Report to
`/tmp/196-scale-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`, then `bun install` FIRST.

**YOU ARE THE ONLY BUILDER.** You may run `scripts/merge-gate.sh`. Take the machine-wide quiet lock for
every timing run and **check `/tmp/invar-quiet-lock.journal` for a `degraded` entry afterwards** — the
lock gives up after 120 s and runs anyway (#183).

## The user's report, verbatim

Editing a real 500,000-line / 37.2 MB TypeScript file is "super slow even not on the widest line", and
loading it is slow. `small.ts` in the same workspace is fine. Their file is
`/home/parallels/dev/invar-scale/huge.ts` — regenerate with `bun scripts/make-scale-workspace.ts` if
absent. It carries a SOLE widest line at 250,000 marked `WIDEST-LINE-CHAMPION`.

Open it with `bun src/main.ts /home/parallels/dev/invar-scale`. **NOT** `bun run start <path>` — that
script pins `argv[2]` to `.` and silently drops the path (#195).

## READ FIRST — the frame, then the reference, then STOP

**1. `agent-dispatches/_staged/196-flyweight-frame.md`** — the structural frame, written from reading
the source. Start here.

**2. `../ivue/examples/playground/src/examples/flyweight-grid/Flyweight.invariants.md`** — the
load-bearing document. Its impossibility boundary already forbids what the editor does: *"an interaction
whose cost is O(total cells)"* and *"a full-document recalculation, ever."* A keystroke is the first;
`buildPrefix` is the second. Also read `../ivue/docs_v2/guide/flyweight.md` for the measured numbers
(20,000,000 cells at 4.69 bytes each).

**3. `.../model/FlyweightCell.ts`** (61 lines) — the disposable facade, whole and short.

**4. `.../model/FlyweightSheet.ts`** — read ONLY these parts:
- the `Column` interface (~:62) — `Uint8Array` kind + lazily-allocated `Float64Array`;
- `blockKey` / `trackBlock` / `bumpBlock` (~:138-174) — the coarse tier, the move that makes
  `=SUM(A1:A1000000)` cost 245 edges instead of a million;
- `write()` (~:475) — the ONE write path: update storage, bump fine, bump block, **peek-only**.

**5. `.../DESIGN.md` and `.../RESULTS.md`** — the mechanism notes and the measurement protocol
(gc-forced, 3 runs, medians). Copy that protocol's discipline for the memory numbers below.

**DO NOT read or port the rest of `FlyweightSheet.ts`** — `formulaValue`, `evaluateCell`, the parser,
`onCell`/`onRange`, the derived-write bridge, the cycle guard, `adHocCache`, and eviction-with-locality-
margin are all there because CELLS REFERENCE EACH OTHER. Lines do not. That is roughly 466 of its 616
lines and it is the complexity we are deliberately not adopting.

**The one refinement to keep straight:** the editor is not dependency-free. Line *i*'s visual offset
depends on every line before it. But that dependence has a FIXED SHAPE — always "everything before me",
never discovered, never conditional, never cyclic. That is exactly why the machinery above disappears
and why a Fenwick tree is unnecessary.

## PROBLEM A — the per-keystroke cost. Measure each step separately.

`EditorWrap.syncWrapIndex` already has a head/tail identity trim by string REFERENCE (~:371-385), so
unchanged lines are never re-WRAPPED. What still happens on every keystroke regardless:

    :387  new Array(lineCount)                          // 500k slots
    :388  new Array(lineCount)                          // 500k slots
    :389  buildFoldProjection(lineCount, ...)            // a third 500k array, filled
    :392  for (0 .. head)                                // copies the ENTIRE head
    :408  for (1 .. tail)                                // copies the entire tail
    :422  index.prefix = buildPrefix(rowCounts)          // a fourth 500k array + full sum loop

Four length-n arrays and ~2M loop iterations for one character. The arrays do NOT escape — they are
assigned into `index.*` inside the private `$wrapIndexByDocument` map and every consumer reads through
the index. **Verify that yourself before relying on it.**

THE LADDER, do-less first. Report a measurement per step so we learn which one the user feels:

1. **Skip `buildFoldProjection` when the fold set is unchanged.** #169 verified it runs unconditionally
   even when the fold set is the IDENTICAL reference. Note the unlisted `[...foldedRanges].sort()` copy
   inside it.
2. **Mutate `lineTexts`/`rowCounts` in place when `lineCount` is unchanged** — precisely the typing
   case. Only `[head, lineCount - tail)` needs writing; both allocations and both copy loops disappear.
   Splice when the line count changes.
3. **Replace the flat 500,001-entry `prefix` with per-block sums plus a running total.** ivue uses
   `BLOCK_SHIFT = 12` (4096 rows); 500k lines is **122 blocks**. `firstVisualRowOfLine(i)` becomes one
   cumulative-block lookup plus a walk of ≤4096 — bounded by BLOCK SIZE, therefore constant in document
   size, which is what `totalVisualRows`'s own comment already demands ("called per frame, so it must
   never walk the document"). An edit updates one line, one block sum, one total.
4. **`rowCounts` and the block sums become `Uint32Array`.** NOT `Uint8Array` — row counts are not
   bounded (a 20,000-char line at width 80 wraps to 250 rows; minified bundles go far past 255) and a
   typed array wraps SILENTLY into a wrong scrollbar. 500k × 4 B = 2 MB.
5. **`index.lineTexts` should probably not exist.** It is a 500k shadow copy of the document's own
   `_lines`, kept only so the trim has something to diff against — and the invariants record forbids
   duplicated ground truth by name ("Values in refs would duplicate ground truth and desynchronize").
   `replaceLineRange` already knows the changed range. Deleting a data structure beats optimizing one;
   if it cannot go, say precisely why.

Order matters: steps 1-3 are "stop doing the work", steps 4-5 are "make what remains cheaper/smaller".
Measuring in that order tells us whether the later ones are even needed.

## PROBLEM B — the load path, which the user asked about directly

They asked: *"loading the huge.ts is slow can we not do 4 scans of it?"* `TextDocument.loadFromFile`
(:82-101) does, after the read: `text.includes('\r\n')` (a full 37 MB scan just to choose the EOL),
`text.split(/\r?\n/)` (a REGEX split), `rebuildMaximumLineWidth()`, `rebuildContentLength()` (a SECOND
per-line loop, via `captureSavedBaseline`), and `contentSignature()` (FNV-1a over everything).

Each reduction measured on its own:
- EOL from the FIRST newline: `indexOf('\n')` and inspect the preceding char. O(first line).
- `split('\n')` instead of the regex once uniformity is known.
- Fuse the width loop and the length loop into ONE pass.
- **Skip the baseline signature at load entirely.** It exists only to tell "same length by coincidence"
  from "actually identical", and at load the content IS the baseline by construction. TRAP: a naive
  "compute it lazily" just moves the 37 MB hash into the first paint. The fix is a
  known-clean-at-this-revision fact, not deferral.

Target: read + ONE traversal.

## THE ACCEPTANCE TEST — a count, not a millisecond

This is the deliverable that outlives the fix. Per #133's existing idiom ("scale-invariance as the
contract, asserted on load-invariant counts"), and per the impossibility boundary above:

**Count the array writes and allocations performed per keystroke, and require the count to be IDENTICAL
at 2k and 500k lines.** A faster machine beats a millisecond threshold every year; nothing beats a
count. Add it as a real contract, with a positive control that a reintroduced full rebuild turns it red.

Also assert structurally that no per-edit path contains an O(lineCount) loop, in the spirit of #168's
AST census reporting zero identifiers.

## MEASUREMENT ENVIRONMENT — one contamination source you must exclude

The LSP request guard (#197) is fixed on an UNMERGED branch `fix/197-lsp-request-guard`. On main, a
single hover over `huge.ts` starts a `tsgo` subprocess and queries it, because `transportFor` calls
`ensureStarted` before any size check. **Before each timing run, assert no `tsgo` process exists**
(`pgrep -x tsgo`), and do not hover while measuring. If one appears, that sample is contaminated —
discard and note it. Do NOT build on that branch and do not include its change in your diff.

## Report, ordered samples never rates, at 500k / 100k / 20k / 2k

- launch to first painted editor content;
- per-keystroke cost typing a burst in the MIDDLE of the file, away from the widest line — the user's
  exact complaint;
- the same at the end of line 250,000, to confirm #186's constant-time champion promotion still holds;
- peak resident memory — 500,000 JS strings is a real cost and the user raised it directly.

## CONSTRAINTS

The exact maximum-width aggregate stays EXACT. Four consumers require it —
`Workspace.tickScrollAnimations`, `EditorPane.scrollColumns`, `ScrollbarSync`, `DiffView` — and a stale
upper bound leaves scrollable blank columns and a lying thumb. Never trade correctness for the number.

The user's standing acceptance test: *"it has to prove it's truly an invariant unlock, if a true
invariant is found for this, it will generate solutions downstream rather than block further
development... if that does not happen, we do not adopt the complexity."* Name your predictions BEFORE
implementing, and report whether the invariant record got SHORTER or longer.

Do not widen a timeout or tolerance. For any in-place-mutation change the load-bearing positive control
is proving a STALE index is impossible: plant a skipped invalidation and require a red.

## BYCATCH

Every defect you SEE, under `## Bycatch`, with exact reproduction, repetition count, and **whether you
verified it at the merge base** — name the commit and show the implicated files had no diff.

## Repo law

`export let Class = $Class`; the `Static()` wrapper lives at the `$Class` anchor, never
`Class = Static($Class)`; `Reactive()` is exempt. Invariant records at
`src/modules/<domain>/<domain>.invariants.md`, cited by ROOT-RELATIVE path. Full descriptive identifier
names — no abbreviations. 80 columns.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (>= 928 annotations / 67
lattice links / 0 problems), `bun scripts/check-coverage-ratchet.ts`,
`bash scripts/behavioral-contracts.sh`, `bun run drive`, `bun run drive --size 100000`, the measurement
tables, the new scale-invariant contract, and a full merge-gate ALL-PASS.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.

---

# ADDENDUM (arrived after dispatch — read this before trusting any existing instrument)

The user's criticism, verbatim: *"it should have better test if the whole thing is slow, because you
previously reported everything is fast, but your tests were garbage, not complete."* They are right, and
the audit below is why. **Do not reuse the existing instruments to answer this task's question.**

## The instrument matrix, and the hole in it

| instrument | what it measures | scale axis | does it EDIT? |
|---|---|---|---|
| `scripts/harness/measure-input-byte-flush.ts` | keystroke -> frame boundary through the REAL PTY — genuinely end-to-end | **one line, `'abcdefghijklmnopqrstuvwxyz\n'`** | **no** — it drives `Right` arrows |
| `scripts/harness/measure-editor-edit-path.ts` | `setLine` -> `totalVisualRows` — a component, with NO app, NO PTY, NO paint | 2k / 20k / 100k / 500k | yes |

So the only end-to-end latency the gate has ever reported comes from a 27-character file moving a
cursor, and the only large-scale number excludes input routing, the render pass, scrollbar/gutter/diff
sync, and frame emission. **Nothing measures an EDITING keystroke on a LARGE file end-to-end.** That is
precisely the cell the user occupies.

`measure-editor-edit-path.ts` is not dishonest — its own header says *"The boundary is internal and
deliberately narrower than keypress-to-frame latency."* The conductor read that line, quoted the file,
and reported its number as though it answered the user's complaint. Do not repeat that. **Its numbers
are a component baseline and must never be presented as the felt cost.**

## What this task must additionally deliver

Build the missing instrument, and make it permanent rather than a one-off measurement in your report:

1. **Keystroke-to-painted-frame, while EDITING, across the size axis.** Real PTY, real app, the same
   2k / 20k / 100k / 500k ladder the component instrument already uses. The measured span starts at the
   input write and ends when the frame containing the edit's visible result has been observed — not when
   an internal function returns. `measure-input-byte-flush.ts` already knows how to observe a frame
   boundary through the real PTY; the shared fixture generator work in #136 is the natural home for the
   large fixtures. Reuse rather than re-roll.
2. **Type a BURST, not a single character.** The user's complaint is sustained typing, and the defect
   queues: one keystroke fitting in a frame is not the same claim as thirty consecutive ones. Report the
   per-keystroke distribution across a burst, not a single sample.
3. **A positive control, in the direction that matters.** Force the old full-rebuild path and require the
   new instrument's 500k number to move by an order of magnitude. An instrument that cannot see the
   defect it was built for is the thing we are replacing.
4. **State what the new instrument still EXCLUDES.** Every instrument has a boundary; the failure was an
   undeclared one being over-read. Write the boundary in the file header, as
   `measure-editor-edit-path.ts` correctly did.

If the existing `measure-input-byte-flush.ts` can simply gain a size axis and an editing mode, that is
the better answer than a new file — one instrument with two knobs beats two instruments with a gap
between them. Say which you chose and why.

The count-based acceptance test in the main brief still stands and is independent of all of this: a count
is scale-invariant, a millisecond is not.

---

# CORRECTION (user, after the addendum) — ALL FIVE STEPS ARE REQUIRED

The main brief said "steps 1-3 are stop-doing-the-work, steps 4-5 make what remains cheaper" and
"measuring in that order tells us whether the later ones are even needed." **That framing is withdrawn.
Do all five.** The user was explicit: all steps are needed.

They are right, and not merely by instruction — the steps are not independent options, they are one
coherent change that the earlier wording wrongly split into tiers:

- **Step 2 (mutate in place) and step 4 (`Uint32Array`) are the same change.** A fixed-length typed
  array is what makes in-place reuse across edits natural; reusing a `number[]` the same way is fighting
  the representation. Doing 2 without 4 leaves 500,000 boxed JS numbers where 2 MB of `Uint32Array`
  belongs.
- **Step 5 (delete `index.lineTexts`) is what makes step 2 clean.** The shadow copy exists ONLY to give
  the head/tail trim something to diff against. Keep it and the in-place path still maintains a 500k
  duplicate of ground truth — which `Flyweight.invariants.md` forbids by name under "Ground Truth Lives
  in Plain Storage."
- **Steps 1 and 3 without 4 and 5** leave the interaction O(1) in time but still O(document) in
  allocation and duplication. The master invariant is about cost proportional to observation, and memory
  is a cost.

So the ORDER stands — do-less before make-cheaper, and report a measurement per step so we learn each
one's contribution. **The completion condition does not.** Partial completion is not an outcome here; a
report that lands steps 1-3 and argues 4-5 were unnecessary is not accepted.

The one thing that genuinely IS out of scope remains out: **a Fenwick tree.** That was the user's own
reduction — per-block sums plus a running total give document-size-independent cost with a structure
whose correctness is visible, and Fenwick buys a smaller constant for a subtler invariant. Blocks, not
Fenwick. Everything else on the list ships.
