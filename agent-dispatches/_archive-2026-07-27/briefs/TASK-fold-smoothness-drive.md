# TASK — the fold is STILL not smooth. Find it by DRIVING, not by testing (#135)

Builder on the Invar terminal IDE. Work ONLY in `/tmp/conductor-foldfeel` (branch
`fix-fold-smoothness`, forked from latest main). Do NOT run `scripts/merge-gate.sh`; do NOT
push/merge/tag/delete. Report to `/tmp/fold-feel-READY.md`.
`export PATH=$HOME/.bun/bin:$PATH; bun install --frozen-lockfile`.

## The user, verbatim

> "the fold is still not smooth like it was before"

Said AFTER `e500748` landed (BracketMatch revision cache, collapsed-fold projection,
`editor.codeFolding`, fold-toggle viewport anchor) and after `25cdf18` (glide continuation). So the
per-frame costs already fixed are NOT what they are feeling. Something else remains.

## HOW TO WORK THIS — read carefully, this is a deliberate change of method

**Your inner loop is DRIVING THE REAL APP, not running tests.**

1. **Reproduce by driving FIRST.** Launch the app in your own PTY through the harness driver, open
   a fold-dense file, scroll it by hand, and LOOK at the frames. Do not write an assertion yet. If
   you cannot see the difference, you cannot fix it — say so and report what you tried.
2. **Use `editor.codeFolding` as an A/B switch.** Same file, same gesture, folding ON vs OFF.
   That setting exists precisely for this. Also A/B: a file with folds COLLAPSED vs all expanded.
   The user's phrase "like it was before" points at a fold-specific cost, so isolate the fold
   variable while holding size, marks, and guides constant.
3. **Iterate: drive -> change -> drive.** One instrument run at a time. Do NOT run
   `behavioral-contracts.sh`, do NOT run it 3x, do NOT run the full checker suite while iterating.
   Those are for the END.
4. **Write the contract only AFTER the symptom is gone**, to lock in what you achieved. Prefer a
   load-invariant COUNT over an FPS number — a count cannot flake and cannot be argued with.
5. **One verification pass at the end.** Then report.

Judge by observation of the real path. Assertions prevent regression; they do not discover the fix.

## What to look for (candidates, unranked — let the driving rank them)

- Per-frame cost that appears only when fold REGIONS EXIST, or only when some are COLLAPSED,
  distinct from the document-length costs already fixed.
- Row-crossing IRREGULARITY rather than low throughput: the same average FPS can feel worse if the
  per-frame row deltas are uneven. Look at the sequence of per-frame row crossings, not the mean.
  A glide that crosses 3,3,3,3 rows feels smooth; 5,1,5,1 at the same average does not.
- The visual-row projection near a collapsed region: does crossing a fold boundary cost more than
  crossing an ordinary row, producing a hitch exactly at boundaries?
- Gutter fold-control painting per visible row.
- Anything that makes the FIRST frame after a gesture different from the rest.

## Deliverable

- A named mechanism, with the per-frame evidence that identifies it (attribution, counts, or the
  row-crossing sequence).
- The fix.
- A contract that would have caught it, preferring counts/regularity over FPS. Positive control
  required: show the assertion red before the fix (or with the fix reverted).
- If the honest finding is "it is already as smooth as it can be and the user is comparing against
  something that never existed", SAY THAT with the evidence. A negative result reported clearly is
  a real deliverable; do not manufacture a fix.

## Final verification only (not during iteration)

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`, invariant checker
`--all --refs`, coverage ratchet, `bash scripts/behavioral-contracts.sh` ONCE, folding smoke once.
Exact exit codes. Report added wall-clock.

Full descriptive identifier names, 80 columns, ivue conventions (subclass `$Class`, never `Class`).
Commit `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; clean tree.
