# 258 — readList is the third re-roll of the prose-reflow joiner

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: distillation

## Outline

Bycatch of #236: `MarkdownParser.readList` still joins multi-line list
items with hard newlines while paragraphs and (since #236) blockquotes
reflow through one join-runs-with-a-space decision. Three sites, one
generator: how markdown prose continuation lines become a single reflowable
run.

Route all three through one joiner at the parser layer. The
seam-at-shared-generator rule cuts both ways: if list continuation
genuinely differs (code spans inside items? lazy continuation rules?), the
report says where and stops. The visible product question: a wrapped list
item should reflow inside its hanging indent exactly as a quote reflows
inside its bar — #236 built the indent side; this task feeds it honest
runs.

Done-test: a list item hard-wrapped in the source reflows to the pane
width under the hanging indent; the census in `MarkdownStylesheet.test.ts`
stays green; parser tests lock the joiner for all three block kinds.

## Invariants in scope

- [src/modules/markdown/markdown.invariants.md](../../../../src/modules/markdown/markdown.invariants.md) — the stylesheet record
  from #236 and the parser records; add the one-joiner clause where it
  belongs.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- `report-236-...md`, Bycatch item 5 (generator drift).
