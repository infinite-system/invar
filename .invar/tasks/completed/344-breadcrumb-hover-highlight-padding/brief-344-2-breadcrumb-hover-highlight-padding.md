# Brief #344 round 1 — breadcrumb hover highlight with one-cell side padding

Read [CLAUDE.md](../../../../CLAUDE.md) and [AGENTS.md](../../../../AGENTS.md) fully first. Load the /ivue and /invariants
skill docs before governed work. Reason with IBR.

## The task

Read the task file in this folder for the user's verbatim intent and
boundaries. Summary: hovering a breadcrumb folder segment paints a
background highlight extending one cell left and one cell right of the
text; positions never shift on hover; the whole row gains exactly one
leading pad column (always present) so the first segment has room for its
left highlight cell; separators stay unhighlighted.

## Method — drive first, contract last

1. Drive the real app, hover breadcrumb segments with the mouse, see the
   current behavior. Iterate drive -> change -> drive.
2. Renderer and hit-tester must share one geometry (no parallel math);
   hit area may include the padding cells.
3. Use the existing hover background token (light and dark themes).
4. Contract assertions AFTER the visual is right; one verification pass
   at the end. Extend the existing breadcrumb harness smoke rather than
   adding a new one.

## Rules

- Do NOT run scripts/merge-gate.sh yourself; do NOT use SKIP_GATE. Commit
  through the hook; a GATE_EXIT=0 chain is part of DONE. Commit BEFORE
  writing READY into your report — the report header carries the real
  commit hash and GATE_EXIT, never placeholders.
- Known flaky pre-existing classes: #214 panel-chrome, #359 panel-split,
  #362 markdown preview clipping. Name them if they bite; do not chase.
- Builders never push; the conductor lands.

## Invariants in scope

- Breadcrumb/UI records in src/modules/ui contracts (hover, hit-testing,
  geometry sharing) and any navigation records naming breadcrumbs. Answer
  record by record in the READY report: upheld / violated / needs
  refinement, plus records this list missed.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s bycatch taxonomy. Include a ## Bycatch section
even when it reads: None observed.

## Definition of done

READY report in this folder, standard naming (report prefix, number 344,
the task slug, md extension): driven before/after evidence (frame
captures or cell asserts), the one-column shift proof, hover geometry
shared-generator note, gate chain, invariants answered, bycatch.
