# Brief 537-1 — the doctrine pass (Find/Replace milestone 6)

## In plain words

Everything is built. Now prove both search surfaces obey every design
chapter, fix what does not, and leave the feature coherent. This is a
DRIVE-FIRST audit task: the deliverable is the driven compliance table
plus the fixes it forces.

## The deliverable, twice

CODE: fixes for every doctrine gap the audit finds (known seed: the
summary says "10 results in 1 files" — pluralize per copy rules);
approved-record wiring is NOT in scope (proposals stay proposals).
VISUAL: both surfaces (in-file find bar; workspace Search panel)
compliant per chapter, proven by driving.

## Scope (Milestone 6 verbatim, as a driven table)

For EACH of the two surfaces, drive and record PASS/FIXED per chapter:
- Buttons: one geometry, hover/pressed states, themed glyphs at both
  glyph tiers, toggle semantics.
- Dialogs: overlay family, one-key padding (assert the SPAN, not a
  substring — the #528 lesson), consent with counts, safe focus,
  Escape, selection + copy.
- Flows: cancel spine (every state reachable AND leavable), drive-
  addressable states, drift detection surfaces.
- Text inputs: the shared input model bindings (movement, selection,
  clipboard) in all five fields (find, replace x2, include, exclude).
- Scroll areas: shared momentum, thumb, wheel, PageDown, edge behavior
  in the result tree at 100,000 lines.
- Copy text: every user-facing string per the copy rules (counts,
  pluralization, remedy text); fix "1 files".

## The bar

DRIVE ADVERSARIALLY. The table is evidence: each row names the drive
that proved it. Both glyph tiers (unicode + ASCII fallback). Narrow
geometry. Both scales. Fixes ride in this task; anything genuinely out
of scope (a doctrine gap in a NON-search surface discovered en route)
is bycatch, not scope creep.

## Invariants in scope

- [search.invariants.md](../../../../src/modules/search/search.invariants.md)
  record by record.
- [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)
  records your fixes touch.
- Design section 12 proposals remain proposals.

## Bycatch expected

Report per the taxonomy in [AGENTS.md](../../../../AGENTS.md), even when
None observed.
