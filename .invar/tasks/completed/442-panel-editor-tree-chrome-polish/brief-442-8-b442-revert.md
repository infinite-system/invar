# Brief 442-15 — REVERSION: no leading space on the splitter line

## In plain words

I asked for a gap before the bottom panel line. Cancel that. The line
should start where it starts today. The only thing wrong there is the
color of the first cell: it is dark when it should match the rest of
the row.

## The change

Item 2 of [brief 442-1](brief-442-1-panel-editor-tree-chrome-polish.md)
is WITHDRAWN. Do not add a leading space cell. The splitter line keeps
its current start column.

Item 1 stands unchanged: the crossing cells keep the vertical
splitter's background (bg 1447454) instead of the row background
(bg 1710886). Fix that coloring at both sites through the one
generator, at col 37 (sidebar seam) and col 91 (right-dock seam).

So col 37 stays a LINE glyph, painted in the row background.

## Invariants in scope

Same as brief 442-1 item 1. This reversion removes a requirement; it
adds none.

## Bycatch expected

Per the [AGENTS.md](../../../../AGENTS.md) taxonomy; `None observed`
is a valid section.
