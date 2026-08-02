# Brief 442-9 — git count spacing and icon alignment

Two additions to the activity-bar git count (extends the small-digit
amendment):

1. The count renders with ONE space cell on its left.
2. The git icon `⑂` aligns to the same column as the other activity
   bar icons (`≡` at column 2 in a 4-wide bar) in EVERY state: no
   count, one digit, two digits, three digits (the 999 cap). The
   count's width must never shift the icon column.

    ▎ ≡
      ␣₁₂       count row: leading space, subscript digits
      ⑂         icon stays at the shared icon column

Drive the states with a fixture repo carrying 1, 12, and 1000+
changed files; assert the icon column is identical across all four
states and equal to the files icon column.

## Invariants in scope

Same as the small-digit amendment (activity-bar chrome).

## Bycatch expected

Per the [AGENTS.md](../../../../AGENTS.md) taxonomy; `None observed`
is a valid section.
