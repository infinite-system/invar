# TASK — #102: markdown preview renders tables as ALIGNED TABLES, not raw pipes

Work ONLY in `/tmp/conductor-mdtables` (branch `feat-markdown-tables`, off latest main).
Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Report to
`/tmp/mdtables-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`.

## The request

USER: the markdown preview shows table syntax as raw pipe characters instead of rendering an
aligned table. Fix that.

## ⚑ DRIVE IT FIRST

Open a markdown file containing a table in the real preview via your own PTY and LOOK at it.
Capture the frame. You need the before-picture in the report, and you need to know exactly what
it does today — including whether the pipes are passed through untouched or partially handled.

There are tables in this repo's own docs to drive against (several `.md` files use them,
including the invariant records), so you do not need to invent a fixture for the first look.

## What "aligned" has to mean in a terminal

This is a cell grid, not a browser, and that constrains the work in ways an HTML renderer never
faces. Get these right or the feature is worse than raw pipes:

- **Column width is measured in DISPLAY CELLS, not characters.** This repo has an existing
  authority for that and a width-agreement instrument that catches glyphs the app measures at 2
  cells but the terminal renders at 1. Use the existing seam. Do not count `String.length`.
- **CJK, emoji and combining marks** must not shift a column. Include at least one wide-character
  row in your fixture and prove alignment holds.
- **Narrow terminals**: a table wider than the pane must degrade honestly — truncate or scroll
  through the existing mechanism, never wrap mid-cell into visual garbage and never paint past the
  pane boundary into a neighbour. The chrome work this session fixed a real instance of a footer
  painting under the terminal pane; do not add another.
- **Alignment markers** (`:---`, `:---:`, `---:`) set left/centre/right per column. Honour them.
- **Border/separator glyphs come from the theme vocabulary**, never as literals in behaviour code.
  Check the reserved-mark table before choosing anything, and run the width-agreement check on any
  glyph you introduce — an appearance dependency on an unproven glyph is a defect class that has
  bitten this repo repeatedly.

## Reuse, do not re-roll

A markdown parser and preview already exist (`MarkdownParser`, `MarkdownDocument`,
`MarkdownPreview`). Tables are a block construct: parse into a block with rows, cells and per-column
alignment, then render. **The parser must not know about painting and the painter must not re-parse.**
If you find yourself adding a second place that understands pipe syntax, stop — that is the seam
violation this repo cares most about.

Check whether a break-opportunity/wrap generator already exists that cell content should route
through, rather than adding table-specific text handling.

## Contract

Driven assertions from the emulator grid, not from a string comparison of the model:
- a table renders with columns aligned at a given width, asserted on CELL COLUMNS;
- alignment markers place content left/centre/right;
- a wide-character row does not shift any column boundary;
- a too-narrow pane degrades by the declared mechanism and paints nothing outside the pane;
- malformed table syntax (ragged row, missing separator) does not crash and does not silently
  swallow the text — state what it does and assert it.

**Positive control mandatory:** break the alignment deliberately and quote the red.

## Scale parity

A 10-row table and a 1,000-row table must cost the same PER VISIBLE ROW. Do not parse or measure
rows that are not on screen — the repo's central invariant is that per-frame cost does not scale
with document length, and it is now recorded in `scroll.invariants.md`. Read that record before
you start; a preview that measures every row of a long table to compute column widths would
violate it, so decide deliberately how widths are determined and say so in the report.

## Bycatch

Report other bugs you notice; do not chase them. Fix one only if small, obvious, clearly correct,
and in a file you already touched.

## Verification — quote exact exit codes

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`, and the markdown smoke 3x. Never read `$?` after a
pipeline.

Full descriptive identifier names (no abbreviations), 80 columns, ivue conventions (subclass
`$Class`, never `Class`). Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`;
leave the tree clean.
