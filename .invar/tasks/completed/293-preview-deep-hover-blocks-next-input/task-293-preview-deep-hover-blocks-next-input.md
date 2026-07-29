# 293 — deep markdown preview hover blocks the next input at 100k lines

State: COMPLETED — bbbed70f — Deep hover window-bound: 100k hover 1.1s->15ms, next input 12.5ms; border hover owned; scale-parity contract
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium
Priority: user-facing-suspect (bycatch of #285, reproduced twice)

## Outline

#285's scale arm: jump to 100,000, hover a link on the final body row —
the reference publishes correctly, then the NEXT pointer move misses a
15s harness deadline; second run reproduced with Escape as the next
input. Suspect: the deep-window walk in MarkdownPreview.ts doing
per-hover work proportional to document depth, blocking the input loop.
May violate the "Preview rendering follows visible rows" record.

Arms: reproduce with the exact #285 recipe (report quotes it); profile
or reason the hover path's cost at depth; fix at the windowing seam so
hover work is visible-window-bound; both polarities (deep hover then
immediate input lands; shallow behavior unchanged); never widen the
harness deadline.

## Invariants in scope

- markdown.invariants.md: "Preview rendering follows visible rows"
  (the suspected violation) and #289's anchor-map records (the hover
  path may share the row mapping).

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if
it reads `None observed`.

## Sources

- report-285 Bycatch (exact reproduction recipe, two runs).
