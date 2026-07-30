# 302 — status bar: git user/date gets a user icon + 1-cell left margin; project name loses its extra space

State: COMPLETED — 5b36cec3 — status bar author glyph tiers + spacing (landed in #300 bundle merge ec651408)
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: low
Priority: USER-DIRECTED (2026-07-29 ~17:2x, verbatim)

## Outline

User, verbatim: "bottom most pane where user / date from git plugin
comes should have user icon and 1 key of space from the left most
edge, where project name sits there is an extra 1 key space that
should be removed"

Two arms in the bottom status row:

1. **Git user/date segment**: prefix a user icon (per the icon
   vocabulary — Nerd/Unicode/ASCII tiers like other glyphs) and place
   the segment exactly ONE cell from the leftmost edge.
2. **Project name segment**: remove the extra one-cell space it
   currently carries (align to the same one-cell rule).

Check the segment layout generator: if both segments derive margins
from one place, fix the rule there — the goal is ONE left-margin
convention for status segments, not two point fixes. Driven with cell
asserts: icon cell, one space cell, then text; both tiers, both
themes.

## Invariants in scope

- The status bar / git plugin segment records; the icon-tier
  vocabulary records.

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if
it reads `None observed`.

## Sources

- User message 2026-07-29 ~17:2x (verbatim above).

## Third arm (user, 2026-07-29 ~17:3x, verbatim)

"in nerd font mode, the invar agent button on bottom pane should be
improved, it's not a good one"

3. **Agent button glyph (Nerd tier)**: pick a better Nerd Font glyph
   for the Invar agent button in the bottom pane — current one reads
   poorly. Candidates from the robot/sparkle/terminal-assistant family
   (e.g. nf-md-robot, nf-md-robot_outline, nf-fa-magic — builder
   evaluates rendering in the REAL terminal at both font sizes and
   shows the chosen cell in the report). Unicode and ASCII tiers stay
   unless they share the same weakness — state the check either way.
   The mark-ownership census gains the chosen glyph's owner row.
