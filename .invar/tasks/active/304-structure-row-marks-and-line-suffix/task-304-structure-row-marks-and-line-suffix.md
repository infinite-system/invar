# 304 — structure rows: slimmer cache/getter marks; line numbers off by default (setting), drop the ":"

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: low
Priority: USER-DIRECTED (2026-07-29 ~17:4x, verbatim)

## Outline

User, verbatim: "cache icon/ getter icon in structure is not good and
takes too much space, do not show line in structure by default (make
it setting, remove :)"

Two arms on the #281 row vocabulary:

1. **Cache + getter marks**: the current $cache and getter glyphs read
   poorly and cost too many cells. Choose slimmer marks (one cell
   each; evaluate in the real terminal across Nerd/Unicode/ASCII
   tiers, show the cells in the report). The semantic slots and census
   ownership stay; only the glyph choice and width change.
2. **Line numbers off by default**: structure rows currently show the
   line (with a ":" separator). Default OFF; contributed setting
   (naming per the settings convention, e.g. structureShowLineNumbers)
   turns it back on — and when ON, render WITHOUT the ":" separator
   (space-separated, dim). Both polarities driven: default hides, the
   setting round-trips through Settings and the ⛭-adjacent surface
   stays consistent; filter/jump behavior unaffected either way.

## Invariants in scope

- structure.invariants.md (#274/#281 row records — refine glyph +
  line components); settings records.

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if
it reads `None observed`.

## Sources

- User message 2026-07-29 ~17:4x (verbatim above).

## Refinement (user, 2026-07-29 ~17:5x, verbatim)

"in structure there is also extra 1 key space from that icon to the
property, there is too many glyphs, 1 glyph is enough f for function,
no need for second glyph, only 1 glyph per item"

This SHARPENS arm 1 into a row-density rule:

- **ONE glyph per row, total.** The symbol-kind glyph (f for function
  etc.) is the only mark; the separate visibility/cache/getter/override
  glyph COLUMN goes away. Fold those semantics into the one glyph's
  COLOR/styling (the existing semantic slots: e.g. getter = info-
  colored kind glyph, private = warning-colored, $cache = its
  differentiator on the same cell) — semantics stay expressed, cells
  stop multiplying. Record the mapping in the invariant.
- **Kill the extra space** between the glyph and the property name:
  glyph, ONE space, name.
- Census/authority: the mark-ownership census reduces accordingly;
  labels stable at both scales.

Both polarities: each semantic still visually distinguishable (drive
one example per class in both themes); row width shrinks by the
removed column + space.
