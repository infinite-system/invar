# Brief 540-1 — the last visible line must stay readable under the scrollbar

## In plain words

When the horizontal scrollbar shows, it paints over the text of the last
visible content row while that row's line number still paints. The user
ruled the row must stay readable. Make the bar occupy its own space
instead of the content's.

## The deliverable, twice

CODE: the editor viewport accounts for the horizontal bar's row — one
geometry source (the same projection that paints the bar reserves the
row), so content height shrinks by one row while the bar is visible and
the last content row is always fully readable. No parallel geometry.
VISUAL (conductor will drive before landing): open a file wide enough to
show the horizontal bar; the last visible line's TEXT is fully readable;
scrolling to the bottom shows the true last line above the bar; the bar
appearing/disappearing (content narrower than viewport) reflows by
exactly one row with no jump artifacts.

## Evidence

#531's frozen frame (in its completed task folder) shows the defect
exactly: gutter number painted, text overlaid by the bar. Reproduce it
first by driving (wide fixture, horizontal bar visible, widest line
last on screen), then fix.

## The bar

DRIVE ADVERSARIALLY: both scales (10 / 100,000 lines); bar
appearing/disappearing mid-scroll; vertical + horizontal bars together
(the corner cell); check the SYMMETRIC concern while there — does the
vertical bar hide the rightmost content column? Answer by driving; if
yes, report it (same ruling likely applies — do not silently expand
scope, list it). Neighbor sweep: the #531 smoke's new predicate must
still pass (it now encodes the OLD overlay behavior's workaround — if
your fix makes the widest-line-on-last-row case readable, ask whether
that predicate should be simplified back, and propose it in the report).
Update [scroll.invariants.md](../../../../src/modules/ui/scroll.invariants.md) ONLY as a proposal if a record needs the
reserved-row wording.

## Invariants in scope

- [scroll.invariants.md](../../../../src/modules/ui/scroll.invariants.md) —
  "Thumbs are painted from the same position+extent the content uses"
  and neighbors; answer record by record; the one-geometry-source rule
  binds the reserved row.

## Bycatch expected

Report per the taxonomy in [AGENTS.md](../../../../AGENTS.md), even when
None observed.
