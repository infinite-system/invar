# Brief #383 round 1 — the right panel is proportional; the editor is prominent

Read [CLAUDE.md](../../../../CLAUDE.md) and [AGENTS.md](../../../../AGENTS.md) fully first. Load /ivue + /invariants before
governed code. Reason with IBR.

## The task

Read the task file (user verbatim + widened scope). On small screens the
right panel (structure pane today) opens WIDER than the editor. Fix at
the RIGHT-PANEL layout generator, not per-pane: bounded proportion
(~25-30%, your call — state it), never exceeding the editor's share, at
every geometry, clamped on resize; an explicit user drag wins within
bounds (state persistence interaction).

## Method — drive first, contract last

1. Drive at wide, 100x30, 80x24: reproduce the inversion (structure
   wider than editor), capture widths from the published layout.
2. Fix the generator; drive again. Assert editor width > right-panel
   width at every geometry once both visible.
3. Contract assertions after; check layout/structure records ("pane
   height is an input not an output" has the width sibling here) and
   propose the proportion record if it deserves one.

## Rules

No merge-gate.sh by hand; no SKIP_GATE; commit through the hook; commit
BEFORE writing READY; real hash + GATE_EXIT in header; report to the
main-checkout task folder (absolute path). Known flaky classes: #214,
#359, #362, #364, #371, #385. Name, do not chase. Builders never push.

## Invariants in scope

Layout + structure module records (the task file names candidates).
Answer record by record; list missed records.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md) taxonomy; ## Bycatch always, even "None observed."

## Definition of done

READY report in this folder, standard naming (report prefix, number 383,
the task slug, md extension): per-geometry width evidence before/after,
the chosen proportion + why, drag/persistence interaction, gate chain,
invariants answered, bycatch.
