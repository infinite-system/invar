# Brief 442-2 — item 5 correction: shift only when the scrollbar shows

User ruling (2026-08-01, supersedes item 5's "pick the shifted
position unconditionally"): the file-tree reveal button shifts one
cell left ONLY while the tree scrollbar is visible. Without a
scrollbar (small trees) it stays in its current position — neat
edge alignment wins there.

    short tree (no scrollbar):   │        ␣ ⊙ ␣ │   unchanged
    tall tree (scrollbar):       │       ␣ ⊙ ␣ ▐ │  shifted left one

The button MAY move when the scrollbar appears or disappears — that
is the intended behavior, not a layout jump defect. Hover and hit
area follow the button in both positions. Lock both states in the
smoke arm (drive a fixture across the scrollbar threshold and assert
both positions).

## Invariants in scope

Same as brief 442-1 item 5; this narrows its spec only.

## Bycatch expected

Per the [AGENTS.md](../../../../AGENTS.md) taxonomy; `None observed`
is a valid section.
