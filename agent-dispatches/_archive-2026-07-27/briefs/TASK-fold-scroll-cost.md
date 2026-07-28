# TASK — Fold-dense files still scroll slow: measure fold cost per frame, add the disable setting (#129)

You are a builder on the Invar terminal IDE. Work ONLY in `/tmp/conductor-foldperf`
(branch `fix-fold-scroll-cost`, forked from main at 4ad3287 — which ALREADY contains the
fold-metadata revision cache, incremental document length, and diff-overview cache from the scroll
landing). Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Commit and report to
`/tmp/fold-scroll-READY.md`. `export PATH=$HOME/.bun/bin:$PATH; bun install --frozen-lockfile`.

## The user, verbatim (live-testing AFTER the scroll landing was cut)

> "I think the 100k case your agent was testing is without code folds, because when I test on
> package.json in ../realized/app folder i disabled indent guides and it became a bit faster, but
> can't find setting to disable folds, i think the folds are what makes it slow to scroll now,
> need fixing"

Their hypothesis is testable and plausibly right: the landing's 100k fixtures were
runtime-generated — if flat text, they carry FEW fold regions, while real JSON is MAXIMALLY
foldable (every object/array a region, deeply nested). The fixture axis covered SIZE but maybe not
FOLD DENSITY. Also confirmed signal: disabling indent guides measurably helped, so per-visible-row
render costs stack.

## The work

1. **Fixture first**: add a fold-DENSE variant to the smoothness fixtures — a deeply nested
   generated JSON at 26k and 100k lines (mirror package-lock.json's shape: nested objects, arrays,
   long key runs). Measure scroll on it TODAY (at 4ad3287) vs the flat fixture — publish the FPS
   table. If fold-dense is slower, you have the reproduction; attribute the per-frame cost to the
   exact callee (the temporary per-frame attribution pattern from the scroll work). Candidate
   costs to MEASURE: fold-control painting per visible gutter row consulting structure; fold-range
   lookup per row not O(1) after the cache; indent-guide interaction; wrap index consultation per
   row for folded regions.
2. **Fix**: per-frame fold work must be O(viewport) with O(1) per-row lookups against the cached
   index. Whatever the attribution names, fix the mechanism.
3. **The setting the user asked for**: `editor.codeFolding` (schema-contributed, default on) —
   disabling removes fold CONTROLS from the gutter, expands everything, and skips fold work
   entirely on the render path (zero fold cost when off — assert that, do not just hide the
   glyphs). Editor capability setting, host schema (folding is host editor capability, not a
   plugin).
4. **Ratchet**: the behavioral contract's 100k floor gains a fold-dense variant — 28 FPS on the
   nested-JSON fixture with folding ON. Also assert indent guides + folds + marks TOGETHER (the
   full per-row stack) still meet the floor — the user's real configuration is everything-on.

## Verification — exact exit codes

Full checker suite; before/after FPS tables (flat vs fold-dense, folding on vs off); the folding
smoke 3x (fold behavior unchanged when enabled); idle-quiescence; coverage declarations (counted
grammar, APPEND).

## Rules

Full descriptive names, 80 columns, ivue conventions. Other builders own src/modules/agent and the
inline-rewrite files — stay out. Commit `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`;
clean tree.

## ADDENDUM (user regression report, fold this into your task — same files, same owner)

USER, verbatim: "another regression, pressing code fold symbol to fold the code -> jumps editor
canvas to the top of screen -> needs fix + tests"

Clicking the gutter fold control collapses the region AND scrolls the viewport to document top.
Correct behavior: the viewport anchor is PRESERVED — translate the pre-toggle topmost visible
document line through the NEW line→row mapping and restore it; the fold header stays at its screen
row. Caret unchanged unless it was inside the folded body (then it moves to the header, per the
landed skip-over rules).

Suspects to MEASURE: scrollTop recomputed from scratch (or clamped against a transiently-empty
fold index during the toggle frame — your own cache-rebuild path is adjacent); a focus-projection
side effect in the gutter mouse handler resetting the viewport.

Required driven test, permanent in the folding harness: scroll deep (line ~500 visible), click a
fold control mid-viewport, assert the region collapsed AND the same anchor line is still visible
(NOT line 0); unfold restores; repeat via the keyboard chords. Record the invariant: a fold toggle
never moves the viewport more than the collapsed-row delta requires.

## ADDENDUM 2 (user) — the 100k test must sample scroll at DEPTH, cheaply

USER, verbatim (first): "also 100k+ lines test make it test by scrolling further than just initial
canvas, should test long scroll properly"

USER, verbatim (refinement — this governs the SHAPE, keep the test FAST): "i am thinking over 50k
lines maybe too long lol, has to be reasonable so the test is fast, so maybe test first 0->1000
lines, then scroll instantly to 50k test from here scrolling another 1000-5000 lines, scroll to 75k
instantly scroll here for a bit, you know what i mean?"

### Why (the axis being covered)

The landed 100k contract drives a 12-notch gesture from the TOP, so the viewport never leaves the
first screenful. SCROLL DEPTH is a SEPARATE axis from DOCUMENT SIZE. A per-frame cost proportional
to distance-from-origin is invisible to a gesture off the top and instantly visible to the user:
per-row lookups that scan from line 0, scrollbar geometry recomputed against scrollTop, fold/wrap
index traversal from the document start, syntax-span windows anchored at the top.

### The required shape — JUMP to depth, then MEASURE a short scroll there

Do NOT scroll continuously from 0 to 50k — that is slow wall-clock and it measures travel, not
depth. Instead: instant jump (a direct scroll-position/goto-line set, NOT a gesture) to each depth
checkpoint, then measure a short GESTURE-DRIVEN scroll from there.

Checkpoints (3 is enough; keep total added runtime small — report it):
1. depth 0      — gesture-scroll ~1000 lines (this is the existing coverage, keep it as the
                  reference number every other checkpoint is compared against)
2. jump to 50k  — gesture-scroll 1000–5000 lines from there
3. jump to 75k  — gesture-scroll 1000–5000 lines from there

Rules for the measurement:
- The instant jumps are SETUP, not measurement — exclude their frames from the FPS numbers, and
  let the view settle (a real condition, never a sleep) before sampling begins.
- Report FPS and rows-travelled PER CHECKPOINT in a table, plus each checkpoint's ratio to the
  depth-0 reference. A depth-dependent cost shows up as a falling ratio; that ratio is the finding.
- The 28 FPS floor applies at EVERY checkpoint — the contract fails if ANY single checkpoint is
  below it. Do not aggregate/average across checkpoints; averaging hides exactly the defect this
  is built to catch.
- Run the same three-checkpoint drive on the fold-DENSE fixture as well, with indent guides and
  gutter marks ON (both axes at once — the user's real configuration).
- Keep it fast. Report the added wall-clock; if the deep drive costs more than a modest fraction of
  the contract's runtime, cut gesture length (not checkpoints) and say so.

If a depth-dependent cost exists, that IS the finding of this addendum — report the per-checkpoint
table with the attribution, same temporary per-frame attribution pattern as the rest of this task.
