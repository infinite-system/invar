# TASK — #108: propose distinct marks for the shell-script and YAML families (PROPOSAL ONLY)

Work ONLY in `/tmp/conductor-gearmark` (branch `docs-gear-mark-proposal`, cut off `bf57bcf`).
Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Report to `/tmp/gearmark-READY.md`.
`export PATH=$HOME/.bun/bin:$PATH`, then `bun install`.

## THIS TASK DOES NOT CHANGE APPEARANCE

Changing a file-tree glyph changes what every user sees, which makes it the user's call, not a
builder's. Your deliverable is a **proposal they can accept or reject in one reading** — plus the
verification that the proposed marks actually work in this terminal. If you change the shipped
vocabulary, you have done the wrong task.

## The finding

The mark-ownership instrument (built for `#89`) enforces: *a mark may be shared only by owners that
mean the same thing.* `⚙` currently has FOUR owners, and two of them can appear in the SAME column —
`.sh` and `.yaml` file rows are indistinguishable in the file tree today. That is a real ambiguity a
user hits, unlike the two cases already adjudicated:

- `⑂` shared by two owners — verdict INTENDED, both mean version control.
- `●` shared by file rows and the tab dirty marker — verdict FAILED, fixed by moving `.js`/`.jsx` to
  `◉` and leaving `●` to the dirty marker.

`⚙` presumably stays with the Settings activity glyph, since that is the meaning users already
associate with it — which means BOTH file families move.

## Constraints on any candidate mark (all learned the hard way)

- **Unambiguously ONE cell.** The repo has a width-agreement instrument comparing
  `EditorCoordinates.lineWidth` (OpenTUI) against `@xterm/headless` `cell.getWidth()`. `☰` was
  retired for measuring two and rendering one; `🔒` and `🖼` are enumerated exceptions for the same
  class in the other direction. **Run that instrument against every candidate** — this is the part
  that makes the proposal trustworthy rather than tasteful.
- **No thin internal detail** that vanishes at terminal size. That killed `⊞`.
- **Not in the Geometric Shapes block**, which is largely East-Asian-Width Ambiguous.
- **No collision** with the reserved-mark table or the activity row `≡ ⑂ ⌕ ⚙ ⧫`.
- Must exist in all three tiers the vocabulary supports (unicode / ascii / nerd) or degrade honestly.
  Do NOT invent a Nerd Font PUA code point you cannot verify renders — `#89` established that an
  unverified PUA glyph is strictly worse than a verified unicode one, because it fails as a silent
  tofu box that looks like the user's font is broken.

## Deliverable

A short proposal — in the report AND as a committed markdown section wherever the mark vocabulary's
reasoning already lives (find it; do not create a new file for this) — containing:

1. the current owner table for `⚙`, measured from source, with the two colliding owners named;
2. **two or three candidate pairs** (one mark for shell scripts, one for YAML/config), each with:
   the code point, why it reads as that file family, and the measured width-agreement result;
3. a recommendation with reasoning, stated as a recommendation;
4. what changes if accepted: the exact files and lines, so acceptance is a small mechanical edit
   rather than a fresh investigation.

## Acceptance

- every candidate has a MEASURED width-agreement result, not an assumed one — quote the instrument's
  output per candidate, including a known-good control (`漢` measures 2) so the run is provably able
  to report a disagreement;
- no shipped glyph changes: `git diff` touches documentation only;
- the proposal is readable in one pass and ends with a clear question for the user.

## Verification

`bash scripts/conventions-gate.sh` and
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (at or above 884
annotations / 67 lattice links / 0 problems). Quote both exit codes. If you add no code, say so
plainly rather than inventing a test to run.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
