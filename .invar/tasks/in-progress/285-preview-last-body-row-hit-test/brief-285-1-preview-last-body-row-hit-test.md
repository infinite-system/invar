# Brief — #285: the preview's LAST body row is hit-test dead

Read first: [task-285-preview-last-body-row-hit-test.md](task-285-preview-last-body-row-hit-test.md)
— user-facing bug, bycatch of #276 reproduced twice at 140x40; the
record governs. Note #289 and #291 have landed since the record was
written: the preview now has scroll-sync, both-axis scrollbars, and
dead-link painting — reproduce against CURRENT main first.

Arms:

1. **Reproduce**: a link on the LAST body row publishes no hover
   reference and never shows its tooltip; one row up works. Quote it.
2. **Fix the generator**: suspect off-by-one between the pane's body
   extent and referenceAtCell's visible-row mapping. Fix at the extent/
   hit-test seam, not by nudging the drive.
3. **Remove the tell**: #276's drive scrolls one extra step as a
   workaround — REMOVE it with the fix (it is the regression's marker;
   its removal must stay green).
4. **Both polarities**: last row hits after the fix; one-past-last
   (outside the body) still misses.

Real defaults, both scales if the extent math differs at 100k.

## Invariants in scope

The markdown preview link-handling records (#276, #291's dead-link
verdicts) in
[markdown.invariants.md](../../../../src/modules/markdown/markdown.invariants.md);
the pane extent/hit-test records in
[ui.invariants.md](../../../../src/modules/ui/ui.invariants.md).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report: reproduction quoted, generator fix, workaround removed,
both polarities driven, green `bun test` + markdown smokes. The
conductor gates at landing.
