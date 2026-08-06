# Brief 533-1 — tasks header pipes and the dead Open button

## In plain words

Two user-reported regressions, both already reproduced by the conductor
on a fresh build. The tasks pane header paints pipe characters that were
only separators in the user's sketch — remove them and make the three
segments read as one clean control. The file-tree header's up-arrow Open
button ignores clicks and shows no tooltip — make it work.

## End state (mechanically checkable)

A report newer than dispatch; driving shows the header with NO pipe
glyphs (segments distinguished by background/selection tone per the
ui-design buttons chapter, hit geometry still contiguous); clicking ↥
opens the Open picker and hovering it shows its tooltip; the #518 smoke
updated to assert the NEW header (and its old literal-pipe predicate now
appears in the smoke as the planted-failure control).

## Items

1. Tasks pane header (conductor drive 10:04, fresh app): row paints
   `| LIVE | ACTIVE | DONE | ▷`. The user's spec sketch used pipes as
   SEPARATORS, not glyphs. Wanted: `LIVE  ACTIVE  DONE` as one segmented
   control — segment identity by background tone (selected segment
   filled; hover tone on the others), no dead cells, no painted pipes.
   The #518 smoke asserts the literal pipe string — rewrite that
   predicate to the new design and keep the contiguity assertion.
2. Files header ↥ (conductor drive 10:05): hover shows NO tooltip
   (declared 'Open file', FileTreePaneContent.ts:88); click changes
   nothing. Handler at line 181 runs `commands.run('file.open')`.
   Diagnose by driving: does buttonAtColumn resolve the ↥ cell? Does
   `file.open` still exist (#510 landed the Open tiers)? Fix the real
   break; then BOTH polarities: click opens the picker, tooltip appears
   after hover dwell; a control proves the assertion can fail.
3. While there: the sibling ⊙ (reveal open file) — verify by driving it
   is not the same class of dead; fix if it is.

## The bar

DRIVE ADVERSARIALLY: reproduce both before touching code; after fixing,
sweep the neighbors (activity bar items, other header buttons, the tasks
pane cycle ▷ control) for the same classes — dead hit geometry and
missing tooltips. No timeout widening, no assertion weakening.

## Invariants in scope

- "Panel controls share paint and hit geometry"
  ([ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)).
- The tasks-dashboard row-shape record
  ([tasks-dashboard.invariants.md](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md)) —
  answer whether the header change implicates it.

## Bycatch expected

Report per the taxonomy in [AGENTS.md](../../../../AGENTS.md), even when
None observed.
