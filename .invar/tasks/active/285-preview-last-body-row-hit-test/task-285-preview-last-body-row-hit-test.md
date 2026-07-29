# 285 — the preview's LAST body row is hit-test dead

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium
Priority: user-facing-bug

## Outline

Bycatch of #276, reproduced twice at 140x40: a link on the LAST body row
of the preview pane publishes no hover reference and never shows its
tooltip; one row up works. Suspect off-by-one between the pane's body
extent and referenceAtCell's visible-row mapping. #276's drive works
around it by scrolling one extra step — REMOVE that workaround when the
fix lands (it is the tell). Both polarities: last row hits after the fix,
one-past-last still misses.

## Invariants in scope

- The markdown preview records (link handling from #276); the pane
  extent/hit-test records.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if
it reads `None observed`.

## Sources

- report-276, Bycatch 1.
