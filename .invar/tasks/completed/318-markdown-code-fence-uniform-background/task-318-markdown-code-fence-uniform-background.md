# 318 — markdown preview code fences: one theme background across all rows, visible language label

State: COMPLETED — 4410e6a9 — rounded fences, uniform selectionMuted background (landed in #300 bundle merge ec651408)
Engine: codex
Model: 5.6-sol
Effort: low
Provenance: USER-DIRECTED 2026-07-29

## User's words (verbatim, GOVERNS)

> in md files preview
>  bash ──────────────────────────────────────────────────────────────────────────────┐
>   │ open docs/index.html                                                               │
>   └────────────────────────────────────────────────────────────────────────────────────┘ the background is black on the line open docs/index.html but transparent on bash and the line after open.. must be darker blue fitting the theme and on all 3 lines and bash text should not be black but a bit lighter so it can be seen

## Design

- A fenced code block renders THREE row classes: header row (language
  label + top border), body rows (code), footer row (bottom border).
  Today only body rows get the black background; header/footer are
  transparent, and the label text is black-on-dark (invisible).
- All rows of a fence share ONE background: a darker blue derived from
  the active theme (semantic token, no literal; derive-don't-copy),
  applied per-cell across the full block width on header, body, and
  footer rows alike.
- The language label ("bash") renders in a lighter theme-derived
  foreground readable against that background.
- Known trap from the records: multi-line bg SPANS mis-position in the
  renderer — apply background per-cell/per-row, not as a multi-line
  span (see FrameProbe reference: code-body bg renders per-cell).
- Both polarities: all three row classes carry the same bg token
  (truecolor cell asserts, COLORTERM=truecolor); label fg contrast
  asserted; surrounding prose rows do NOT get the code bg; live theme
  switch recolors the whole block consistently.

## Acceptance

PTY drive of a fenced bash block: identical bg across header/body/
footer cells, readable label, prose unaffected, at both scales and
across a live theme switch; planted transparent header row goes red.

## User's follow-up (verbatim, GOVERNS — added 2026-07-29)

> also if it can be rounded, would be great

The fence border uses rounded corner glyphs (╭ ╮ ╰ ╯) instead of the
square ┌ ┐ └ ┘ — if the current border comes from a shared box-drawing
generator, add/select the rounded variant there rather than inline
literals; nerd/plain tier behaviour recorded (rounded corners are plain
Unicode box drawing, so both tiers can carry them unless the records
say otherwise).
