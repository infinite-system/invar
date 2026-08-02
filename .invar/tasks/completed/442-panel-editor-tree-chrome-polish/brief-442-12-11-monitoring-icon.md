# Brief 442-11 — monitoring activity icon becomes the live-tasks circle

## In plain words

The little symbol for Monitoring in the left icon strip is a tiny dot.
It is too faint and it does not match the round symbol the live tasks
view already uses for the same idea. Use that same round symbol, so
one idea has one picture.

## The change

The activity bar renders six items in this order: files `≡`, git `⑂`,
structure `▣`, tasks `▶`, monitoring `·`, extensions `⧫`. Replace the
monitoring `·` with the circle glyph the LIVE TASKS surface already
uses for a live or running item (`scripts/tasks/tasks-status.ts` uses
`◉` and `◍`; the dashboard pane may render its own). Read the live
tasks surface first and take the exact glyph it uses. Do not invent a
new circle.

Constraints, from the existing activity-icon reasoning in
[ThemeIcons.ts](../../../../src/modules/theme/ThemeIcons.ts) near
`activityExtensions`: solid, ONE unambiguous cell, East-Asian-Width
neutral if possible, and not visually heavier than the row. If the
chosen circle is Ambiguous-width, say so and pick the closest
neutral circle. Keep the ASCII-mode fallback working.

## Invariants in scope

The glyph and theme contracts covering activity icon width and ASCII
fallback. If a record states the one-cell rule, name it and confirm
the new glyph upholds it.

## Bycatch expected

Per the [AGENTS.md](../../../../AGENTS.md) taxonomy; `None observed`
is a valid section.
