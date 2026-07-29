# Brief — #293: deep preview hover blocks the next input at 100k lines

Read first: [task-293-preview-deep-hover-blocks-next-input.md](task-293-preview-deep-hover-blocks-next-input.md)
— bycatch of #285, reproduced twice; the exact recipe is in
[#285's report](../../completed/285-preview-last-body-row-hit-test/report-285-preview-last-body-row-hit-test.md)
(NOTE: that folder lands to completed/ shortly — the link system
resolves the move; follow the name).

Arms:

1. **Reproduce**: 100k document, jump to the end, hover a link on the
   final body row — reference publishes, then the NEXT input (pointer
   move; also Escape) misses the 15s deadline. Quote both runs.
2. **Measure before diagnosing**: the suspect is the deep-window walk in
   [MarkdownPreview.ts](../../../../src/modules/markdown/MarkdownPreview.ts)
   doing per-hover work proportional to document depth — but a
   structural read is a HYPOTHESIS; time the hover path at 10 / 500 /
   100k before touching code and brief the ranked candidates in the
   report if the measurement disagrees.
3. **Fix at the windowing seam**: hover work must be visible-window
   bound. Never widen the harness deadline.
4. **Both polarities**: deep hover then immediate input lands; shallow
   hover behavior and the published reference unchanged.

## Invariants in scope

[Preview rendering follows visible rows](../../../../src/modules/markdown/markdown.invariants.md#preview-rendering-follows-visible-rows)
(the suspected violation) and #289's anchor-map records in the same
contract file.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report: reproduction quoted, measurement table, generator fix
with both polarities driven at 100k, deadline untouched, green
`bun test` + markdown smokes. The conductor gates at landing.
