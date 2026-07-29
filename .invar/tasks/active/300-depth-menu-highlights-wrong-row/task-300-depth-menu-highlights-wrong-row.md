# 300 — the depth gear menu highlights row 0 while "(current)" is 1

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: low
Priority: USER-DIRECTED (2026-07-29 ~17:1x, verbatim)

## Outline

User, verbatim: "structure depth shows (current) is 1 but highlights 0,
should highlight the current one by default."

The #281 depth gear opens the shared context menu with depths 0-8 and
marks the current depth "(current)" — but the menu's initial HIGHLIGHT
sits on row 0 regardless. The highlight must start on the current
value's row.

Fix at the shared context-menu seam if the menu supports an initial-
selection index (then every value-picker menu benefits); only in the
structure gear's invocation if the seam already supports it and the
gear simply doesn't pass it. Check which before coding.

Both polarities: opening the gear with depth N highlights row N (driven
for two different N); arrow keys move from there; Enter picks the
highlighted row; the "(current)" mark and the highlight agree by
construction (one source).

## Invariants in scope

- The context-menu records; #281's gear records in
  structure.invariants.md (two surfaces, one value).

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if
it reads `None observed`.

## Sources

- User message 2026-07-29 ~17:1x (verbatim above).

## Refinement (user, 2026-07-29 ~17:2x, verbatim)

"also maybe current should not say current just have a highlight on the
left or right like the activity bar does"

Replace the "(current)" TEXT with the activity bar's active-indicator
vocabulary: an edge marker (left or right — match the activity bar's
side convention) on the current value's row. One indicator vocabulary
across activity bar and value-picker menus; the text suffix goes away.
The initial-highlight arm above still binds — the highlight starts on
the marked row, and marker + highlight derive from the one source.
Driven both themes: the marker cell paints the active-indicator slot;
no row text contains "(current)".
