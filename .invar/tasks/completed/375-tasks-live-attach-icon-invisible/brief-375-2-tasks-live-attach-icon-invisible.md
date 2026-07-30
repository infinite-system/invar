# Brief #375 round 1 — tasks live view: visible attach icon, never-stale attach target

codex auto-reads [AGENTS.md](../../../../AGENTS.md). Load the invariants skill for governed code.

## The task

Read the task file in this folder: two user-hit defects in the tasks LIVE
view. (1) The tmux-attach link icon is INVISIBLE (found only by tooltip).
(2) The attach target is read from meta.json ONCE and never re-read — a
repaired meta.json still pointed the link at a dead session.

## Method — drive first, contract last

1. Drive the tasks pane with a LIVE row (fixture task folder + fake
   meta.json — NEVER this repo's real tasks.json; use harmless stand-ins
   per the #342 safety rail). Read the actual cells where the icon should
   paint: is it fg=bg, a missing glyph in the tier, or zero-width?
2. Fix visibility across themes and glyph tiers (ASCII fallback).
3. Staleness: resolve the attach target from disk AT CLICK TIME (the
   sharp fix — a click can then never use a stale record). If the
   session named in meta.json does not exist, show the row DEGRADED
   (loud over silent), not a dead link.
4. Smoke: edit the fixture meta.json mid-session, click, prove the new
   target is used; assert the icon cell is non-blank in both tiers.

## Rules

- No merge-gate.sh by hand; no SKIP_GATE; commit through the hook;
  GATE_EXIT=0 is part of DONE. Commit BEFORE writing READY; real hash +
  GATE_EXIT in the report header. Report to the main-checkout task
  folder (absolute path).
- Known flaky classes: #214, #359, #362, #364, #371. Name, do not chase.
- Builders never push; the conductor lands.

## Invariants in scope

- src/modules/tasks-dashboard contracts (idle quiescence, CLI lens
  generator) + any records the attach-link mechanism touches. Answer
  record by record; list missed records.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md) taxonomy; ## Bycatch section always, even "None observed."

## Definition of done

READY report in this folder, standard naming (report prefix, number 375,
the task slug, md extension): cell-level icon diagnosis, click-time
resolution proof (mid-session meta edit honored), degraded-state driven
evidence, gate chain, invariants answered, bycatch.
