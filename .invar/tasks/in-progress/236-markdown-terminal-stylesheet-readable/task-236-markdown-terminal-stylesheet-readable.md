# 236 — a terminal stylesheet for markdown: padding, tables, blockquotes, readable

State: IN-PROGRESS
Created: 2026-07-29
Engine: claude
Environment: linux
Model: fable-5
Effort: medium
Priority: user-directed
Assignment note: User roadmap 2026-07-29 ("reading is the new writing"). After #35; pairs with #237.

## Outline

Markdown preview becomes genuinely readable — "a sort of CSS in terminal
approach": one stylesheet-like layer that owns spacing and presentation for
every markdown element, instead of per-element ad-hoc rendering.

User's asks, verbatim intent:
- More PADDING — md files must "show very well"; generous margins, breathing
  room between blocks.
- Tables presented properly (the aligned-table work from #102 is the base;
  verify ragged/missing-separator fallbacks still hold — #174's contract).
- Blockquotes styled distinctly; "etc" — sweep the element set: headings,
  lists, nested lists, code fences, rules, links, emphasis.
- The stylesheet is ONE generator (spacing/indent/color decisions in one
  place), so consistency is structural, not per-element luck.

Agents generate lots of md; the user will read task reports and briefings in
this view daily. Optimize for long-form reading.

Scale parity: the 100k-line markdown fixture must render with the same
per-frame costs (#174's revision-wait contract and the markdown smoke are the
instruments). Wide tables must scroll or wrap deliberately, never corrupt.

## Invariants in scope

- `src/modules/markdown/markdown.invariants.md` — every render rule cited
  there; expect to add "one stylesheet owns markdown presentation".
- *Seams are drawn at the shared generator* — the stylesheet IS the generator
  claim.
- The wrap-break records (`WrapBreakOpportunity` in `modules/text/`) — prose
  wrapping in the preview must use the shared break generator.

## Bycatch expected

Per AGENTS.md's taxonomy, all seven categories. The READY report carries
`## Bycatch` even if it reads `None observed`.

## Sources

- User goal message 2026-07-29 (~02:1x).
