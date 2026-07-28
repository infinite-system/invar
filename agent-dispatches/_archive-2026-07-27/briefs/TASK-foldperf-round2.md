# ROUND 2 — merge new main, then the DEPTH-SAMPLED scroll contract (#132)

Work ONLY in `/tmp/conductor-foldperf` (branch `fix-fold-scroll-cost`). Do NOT run
`scripts/merge-gate.sh`; do NOT push/merge/tag/delete branches. Append to
`/tmp/fold-scroll-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`.

Your round-1 work (`3baba8a`, BracketMatch revision cache + EditorWrap collapsed-fold projection +
`editor.codeFolding` + the fold-toggle viewport anchor) is accepted. Two things remain.

## Part A — merge main (it moved to `ac868f4`)

`git fetch origin && git merge origin/main`. Main now carries the INLINE-REWRITE PLUGIN landing,
which also touched `src/modules/editor/Editor.ts` — expect a real conflict there. Resolve BY HAND,
never by scripting conflict markers. Keep YOUR fold/bracket/projection work and MAIN's
inline-rewrite work; where both edited the same region, both behaviours must survive — if you
believe they genuinely cannot coexist, STOP and report rather than dropping either.

## Part B — #132, the depth-sampled scroll contract (USER REQUEST)

USER, verbatim (first): "also 100k+ lines test make it test by scrolling further than just initial
canvas, should test long scroll properly"

USER, verbatim (refinement — this governs the shape, keep it FAST): "i am thinking over 50k lines
maybe too long lol, has to be reasonable so the test is fast, so maybe test first 0->1000 lines,
then scroll instantly to 50k test from here scrolling another 1000-5000 lines, scroll to 75k
instantly scroll here for a bit, you know what i mean?"

Your current 100k ratchet drives two gestures from the TOP, so the viewport never leaves the first
screenful. SCROLL DEPTH is a SEPARATE axis from DOCUMENT SIZE. A per-frame cost proportional to
distance-from-origin is invisible to a gesture off the top and instantly visible to the user:
per-row lookups that scan from line 0, scrollbar geometry recomputed against scrollTop, fold/wrap
index traversal from the document start, syntax-span windows anchored at the top.

Required shape — JUMP to depth (direct scroll-position/goto-line set, NOT a gesture), then measure
a SHORT gesture-driven scroll there:

1. depth 0      — gesture-scroll ~1000 lines. This is the REFERENCE every checkpoint compares to.
2. jump to 50k  — gesture-scroll 1000-5000 lines from there.
3. jump to 75k  — gesture-scroll 1000-5000 lines from there.

Rules:
- The jumps are SETUP, not measurement: exclude their frames, and settle on a real CONDITION
  (never a sleep) before sampling starts.
- Report FPS and rows-travelled PER CHECKPOINT in a table, plus each checkpoint's RATIO to the
  depth-0 reference. A depth-dependent cost shows up as a falling ratio — that ratio is the finding.
- The 28 FPS floor applies at EVERY checkpoint; the contract FAILS if any single checkpoint is
  below it. Do NOT aggregate or average across checkpoints — averaging hides exactly the defect
  this is built to catch.
- Run the same three-checkpoint drive on the fold-DENSE fixture too, with indent guides and gutter
  marks ON (both axes at once — the user's real configuration).
- Keep it fast. Report the added wall-clock. If it is more than a modest fraction of the contract's
  runtime, cut GESTURE LENGTH, not checkpoints, and say so.
- Positive control: the per-checkpoint floor must be able to FAIL. Prove it (e.g. temporarily
  restore an O(document) per-frame cost, or plant a synthetic depth-proportional delay) and show
  the red naming the specific checkpoint.

If a depth-dependent cost exists, that IS the finding — report the per-checkpoint table with
attribution to the exact callee, same temporary per-frame attribution pattern as round 1.

## Verification — exact exit codes

`bun install --frozen-lockfile`, `bunx tsc --noEmit`, `bun test`,
`bash scripts/conventions-gate.sh`, `node .claude/skills/invariants/scripts/check_invariants.mjs
--all --refs`, `bun scripts/check-coverage-ratchet.ts`, `bash scripts/behavioral-contracts.sh` 3x,
the folding smoke 3x, and the inline-rewrite reproduction drives 3x (main's work now lives here too
— you must not have broken it). Coverage declarations appended in the counted grammar.

Full descriptive identifier names, 80 columns, ivue conventions (subclass `$Class` never `Class`).
Commit `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
