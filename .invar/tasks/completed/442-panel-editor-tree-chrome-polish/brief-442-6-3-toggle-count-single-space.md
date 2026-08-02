# Brief 442-3 — item 3 addition: one space between the toggle icon and count

User ruling (2026-08-01): with instances present, the toggle renders
`☰  2` — TWO spaces between icon and count. It must be ONE:

    now:   + Plugin  ☰  2
    want:  + Plugin  ☰ 2 │    (plus item 3's border padding space)

The count and its single separator space stay inside the toggle's
hit area, in normal and hover states. Lock the spacing in the same
smoke arm as item 3.

## Invariants in scope

Same as brief 442-1 item 3; spacing refinement only.

## Bycatch expected

Per the [AGENTS.md](../../../../AGENTS.md) taxonomy; `None observed`
is a valid section.
