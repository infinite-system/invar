# Brief 442-13 — chrome strip backgrounds, not just the tabs

## In plain words

The strip behind the workspace tabs is painted the same color as the
editor, so it looks like part of the page. It is not part of the page.
It is a signpost. Paint every signpost strip the darker panel color,
and let only the editor area stay light. The tab chips keep their own
colors and sit on top of the darker strip.

## The change

Measured now (`bun run drive --open . --geometry 120x40 --cells 0,0-6
--cells 0,60-66`):

- active workspace tab chip: bg 2830145 (its own tone, KEEP)
- empty strip right of the tabs: bg 1710886, the EDITOR content tone

Every top-chrome ROW BACKGROUND becomes the panel tone (bg 1447454),
the same tone the left, right, and bottom panels use:

- workspace tab strip (row 0), including the space around `+`
- the branch row (row 1)
- the project row (row 2) — already item 9
- the breadcrumb and history row (row 3, after the move)
- the file tab strip (row 4), EXCEPT the active file tab chip, which
  keeps the content tone because it touches the content and that
  adjacency is what shows which tab the content belongs to

Only the editor content area keeps bg 1710886. Tab chips keep their
own active and inactive tones; this changes the strip behind them.

One generator, not five sites: chrome strips take the chrome
background. If the code paints these rows individually, say so and
propose the seam.

## Invariants in scope

The theme and ui records covering chrome tones and the panel palette.
Propose a design record: chrome strips take the panel tone, the
editor content area is the only content-tone surface, and the active
file tab borrows the content tone because it touches the content.

## Bycatch expected

Per the [AGENTS.md](../../../../AGENTS.md) taxonomy; `None observed`
is a valid section.
