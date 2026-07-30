# Brief #345 round 1 — the horizontal separator glyph centers vertically

Read [CLAUDE.md](../../../../CLAUDE.md) and [AGENTS.md](../../../../AGENTS.md) fully first. Load the /ivue and /invariants
skill docs before governed code. Reason with IBR.

## The task

Read the task file in this folder (user request + conductor triage). The
horizontal panel separator paints the lower-half block, bottom-aligned;
the user wants the mark vertically centered. Unicode has no centered
half-block, so swap to the heavy horizontal line U+2501 (triage's
recommendation; confirm by driving both candidates U+2501 and U+2500,
pick what looks right, and say why in the report).

## Method — drive first, contract last

1. Drive the real app, look at the bottom-panel separator. Change the
   glyph in SeparatorAppearance.paint, drive again, compare. Screenshot
   or cell-assert both candidates in the report.
2. Check the vertical separator sibling stays consistent (the record on
   equal visual weight between axes — read it and answer whether the
   glyph swap refines it: its reasoning may cite the old half-block).
3. Update any smoke asserting the old glyph. Contract updates AFTER the
   visual is right.

## Rules

- No merge-gate.sh by hand; no SKIP_GATE. Commit through the hook;
  GATE_EXIT=0 chain is part of DONE. Commit BEFORE writing READY — the
  report header carries the real hash and GATE_EXIT, never placeholders.
- Known flaky classes: #214 panel-chrome, #359 panel-split, #362 markdown
  preview clipping. Name, do not chase.
- Builders never push; the conductor lands.

## Invariants in scope

- "One scrollbar painter gives each axis equal visual weight"
  ([src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)) — likely needs refinement, its
  reasoning cites the half-block glyph. Answer record by record; list
  records this list missed.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md) taxonomy; include ## Bycatch even if "None observed."

## Definition of done

READY report in this folder, standard naming (report prefix, number 345,
the task slug, md extension): both-candidate driven comparison, chosen
glyph + why, record refinement proposal if owed, gate chain, invariants
answered, bycatch.
