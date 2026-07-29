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
