# 108 — shell and yaml rows are indistinguishable in one column

State: COMPLETED — merged 186f2d8, fix 82b746c (user accepted Pair A)
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default

## Outline

Found by the mark-ownership instrument. Completing the ownership table — under the rule *a mark may
be shared only by owners that mean the same thing* — exposed a worse collision than the two it was built
to adjudicate.

`⚙` has FOUR owners, and two can appear in the SAME column: `.sh` and `.yaml` file rows are
indistinguishable in the tree today. Unlike `⑂` (verdict: intended — both owners mean version control)
and `●` (verdict: failed, fixed by moving `.js`/`.jsx` to `◉`), this is a genuine ambiguity a user can
hit: two file types, same mark, side by side.

It was declared and dated rather than fixed, correctly — changing it moves the tree's appearance for
every user, which is the user's call, not a builder's.

Constraints on the replacements: unambiguously one cell; no thin internal detail that vanishes at
terminal size (that killed `⊞`); not in the Geometric Shapes block (largely EAW-Ambiguous); and not
colliding with the reserved-mark table or the activity row `≡ ⑂ ⌕ ⚙ ⧫`. The `⚙` slot presumably stays
with the Settings activity glyph, since that is the meaning users associate with it — so BOTH file
families move. Worth surfacing with a proposed pair rather than asking cold.

## Sources

- `brief-108-1-gear-mark-four-owners-collision.md`
- `report-108-gear-mark-four-owners-collision.md`
