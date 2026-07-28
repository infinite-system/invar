# TASK — #169: prove whether the editor edit path is worth changing at all

Work ONLY in this worktree. Branch is `experiment-editor-edit-path`. **This does NOT merge to main
in this task, and staying on the branch indefinitely is an acceptable outcome.** Do NOT run
`scripts/merge-gate.sh`; do NOT push, merge, tag or delete. Report to
`/tmp/169-editor-edit-path-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`, then `bun install` FIRST —
a fresh worktree has no `node_modules` and every preflight reds on unresolved imports until you do.

**ANOTHER BUILDER IS LIVE.** Take the machine-wide quiet lock (`/tmp/invar-quiet.lock`, built by #84,
its degrade-to-UNLOCKED defect fixed by #147) for EVERY timing measurement. The lock is what makes
your numbers valid while someone else works; skipping it produces numbers that look fine and mean
nothing.

## The user's directive, which governs everything below

> *"It has to prove it's truly an invariant unlock. If a true invariant is found for this, it will
> generate solutions downstream rather than block further development — true invariants reinforce
> each other. If that does not happen, we do not adopt the complexity."*

And earlier: *"we don't have a problem with the current implementation."*

**So the burden of proof is on the change, not on the status quo.** A well-measured "not worth it" is
a SUCCESSFUL outcome of this task, not a failure. Do not arrive at a fix because you were dispatched.

## Where this came from

An outside architectural review by ivue-repo Fable/Opus 5, at `tmp/TASK-wrapindex-edit-path.md`. Read
it — it is careful work and its structural claims are all TRUE. I verified each against the code.
But note what it does NOT establish: that any of this is felt by a user. Its stages are ordered by
implementation cost rather than by evidence, which quietly assumes the fix is wanted.

## Verified structural facts — do not re-derive these

- `EditorWrap.ts:387,388` — `new Array(lineCount)` for `lineTexts` and `rowCounts`
- `buildFoldProjection:580` — `Array.from({length: lineCount})`, **plus an unlisted
  `[...foldedRanges].sort()` copy** the review's inventory omits. That is a fifth allocation.
- `buildPrefix:302` — `new Array(rowCounts.length + 1)`
- **`buildFoldProjection` is invoked UNCONDITIONALLY at `:389`** in the incremental branch, even when
  `normalizedFoldRanges` is the identical reference — the guard above only chooses full-vs-incremental
  and never skips the projection. This is the one that looks like free money.
- `TextDocument` bumps `revision` at `:90,100,111` and has NO dirty-range field, so the head/tail
  scan stays O(n) in pointer comparisons.
- The read path is genuinely flat: the revision-unchanged fast path at `:361-367` returns the index
  untouched. That is what earns "100k scrolls like 2k" and it must not be disturbed.
- Corrections to the review's line numbers: `lineTexts` is 387 not 386, `rowCounts` 388 not 387, and
  `:576` is `buildFoldProjection`'s signature — the `Array.from` is at 580. It says "read them, don't
  re-hunt", so a builder trusting that finds `:386` blank.

## PHASE 1 — prove the problem is FELT. Stop here if it is not.

Nobody has ever reported slow editing. The dramatic number from #172 — settings-applied at
655,982 ms — was the SUITE's boot multiplier, not typing.

**No edit benchmark exists.** `.perf-history/` holds only `input-byte-flush.ndjson`, and the only
editor harness is `smoke-editor-harness.ts`. So building the instrument is the first real work —
budget for it, and give it a positive control: force the full-rebuild branch at `:326` and require
the reported number to move.

Measure edit-sync cost for one keystroke mid-document at **2k / 20k / 100k / 500k lines, wrap on and
wrap off**, quiet lock held, load average recorded beside every number. Report the ordered
measurements, not averages.

Then answer one question plainly: **would a user notice?** Typing feels instant below roughly 16 ms
and acceptable below ~50 ms. If 100k-line editing is already imperceptible, **STOP AND REPORT THAT.**
That closes the task and it is worth knowing — nobody has measured it before.

Also measure the hit rate the review's stage 2 depends on: how often does a keystroke change a line's
visual-row count? It claims "most do not," which is true mid-line and FALSE at the wrap boundary.
Stage 2's entire win is proportional to that rate. Measure it; do not assert it.

## PHASE 2 — only if Phase 1 shows a felt problem: is the fix an INVARIANT UNLOCK?

The acceptance test is generativity, because cost/benefit becomes arguable the moment you have a
working diff. **Write your predictions down BEFORE implementing** — a prediction made afterwards is a
rationalisation.

Name which of these gets EASIER, and report against the list:

| candidate | why it would, if the generator is real |
|---|---|
| **#97 folding** | already composes into the same index; "one generator owns document-line-to-visual-row" should become MORE true |
| **#72 break opportunities** | shares the generator; should be consumed more cleanly |
| **#82 marks / gutter / overview ruler** | maps document lines to visual rows constantly |
| large paste, undo/redo, multi-line edits | all are "many lines changed at once" — the shape the head/tail trim already handles |
| **#175 boot attribution** | if index construction is part of the ~300 ms, a cheaper build shows there too |
| diff view row mapping | has its own document-to-visual concerns; watch whether they converge or diverge |

**The reinforcement test, with a concrete yardstick:** today's tradeoff is stated honestly in ONE
sentence at `EditorWrap.ts:310-312` — *"O(delta) wraps + O(n) reference compares + O(n) prefix
additions."* **If your replacement needs a longer explanation than that, it is not a reduction.**
`editor.invariants.md` must get shorter and more definite, not longer and more conditional.

### Disqualifying signals — ANY one means DO NOT ADOPT, regardless of the numbers

- A consumer has to know whether the index was incrementally updated or fully rebuilt. That is
  leakage; the seam exists to hide exactly that.
- An exception rule is required for some case (folding, width change, first sight, a scale threshold).
- Branching increases: more hot-path conditions, more states to reason about.
- Another invariant record must be weakened or qualified to accommodate it.
- The invariant record gets longer or more conditional.
- It is correct but cannot be explained in a paragraph.

## The cheapest candidate, and possibly the only one worth proposing

Caching the fold projection when `(lineCount, foldedRanges)` are both unchanged removes an array AND
the sort copy, with **no algorithmic change and no new concept**. It adds nothing anyone must
understand. If the measurements justify anything at all, it is likely this alone — and it should be
proposed on its own merits, not as stage one of a Fenwick tree.

A Fenwick tree is the review's stage 3. Its own brief says "do not ship a Fenwick tree the numbers do
not ask for," and the user's directive is stronger: even if the numbers ask, it does not land if the
downstream gets harder.

## Constraints

- **Never merge to main.** `experiment-editor-edit-path` only.
- Do not disturb the revision-unchanged fast path at `:361-367`. Scrolling is flat and must stay
  flat — #123/#132/#133 exist because it regressed before.
- The full-rebuild branch at `:326` may stay O(n): first sight, width change and fold-set change are
  genuinely whole-document events.
- Public surface unchanged — `visualRowsFromOffset`, `lineSegmentAtVisualRow`, `totalVisualRows`,
  `firstVisualRowOfLine`, `moveByVisualRows` keep signatures AND semantics.
- `$wrapMemo`'s 512-entry bound and `$wrapIndexByDocument`'s WeakMap keying stay as they are.
- Do NOT build a cross-module dirty-range contract on `TextDocument`. If the O(n) pointer-compare
  floor turns out to matter, PROPOSE it as a follow-up task with its cost stated.

## Repo law

`export let Class = $Class`; the `Static()` wrapper lives at the `$Class` anchor
(`$Class = Static($Raw); Class = $Class`), never `Class = Static($Class)`; `Reactive()` is exempt
because it mutates in place. Invariant records live at
`src/modules/<domain>/<domain>.invariants.md` and are cited by ROOT-RELATIVE path. Full descriptive
identifier names — `increment` not `inc`, `index` not `i`. 80 columns.

## BYCATCH

Report every defect you SEE; fix only the one you were SENT for, under a `## Bycatch` heading with
exact reproduction, repetition count, and commit.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (at or above 913
annotations / 67 lattice links / 0 problems), `bun scripts/check-coverage-ratchet.ts`, plus the
Phase 1 measurement table and the Phase 2 generativity verdict.

**The report is the deliverable, more than the code.** State the verdict explicitly: is this an
invariant unlock, or complexity we decline?

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
