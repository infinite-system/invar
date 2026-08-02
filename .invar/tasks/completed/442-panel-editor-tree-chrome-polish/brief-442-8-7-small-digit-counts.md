# Brief 442-7 — small-digit counts (user-approved design)

Two count surfaces adopt Unicode small digits, with an ASCII-mode
fallback to plain digits (existing glyph-tier pattern):

1. Instances toggle (bottom panel): the count is a SUPERSCRIPT badge
   attached to the icon — `☰ ²` (one space, per the earlier
   amendment). Multi-digit juxtaposes: `☰ ¹²`.
2. Activity-bar git affected-files count: stays exactly where it is,
   renders as SUBSCRIPT digits — `₁₂`. Standalone small numbers are
   baseline-anchored, so subscript, not superscript.
3. CAP: above 999 both render the digits 999 (`₉₉₉` / `⁹⁹⁹`) — three
   cells is the budget; never overflow, never abbreviate.

Digit sets: superscript U+2070/00B9/00B2/00B3/2074-2079; subscript
U+2080-2089.

Propose the design record: icon-attached counts are superscript
badges; standalone counts are subscript; ASCII mode uses plain
digits; counts cap at their cell budget.

## Invariants in scope

Same as brief 442-1 item 3 plus the activity-bar chrome; the glyph
fallback records in the theme/glyph contracts if present.

## Bycatch expected

Per the [AGENTS.md](../../../../AGENTS.md) taxonomy; `None observed`
is a valid section.
