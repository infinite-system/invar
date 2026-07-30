# Brief #347 round 1 — markdown link resolution, and double-click opens links

Read [CLAUDE.md](../../../../CLAUDE.md) and [AGENTS.md](../../../../AGENTS.md) fully first. Load the /ivue and /invariants
skill docs before governed code. Reason with IBR.

## The task

Read the task file in this folder: user request + four ranked rival
hypotheses (relative-base, anchors, encoding, state-move rot) for why
links render red in task reports/briefs. Then add double-click to open a
link — full mouse navigation.

## Method — drive first, contract last

1. Reproduce by DRIVING: open real task reports from
   .invar/tasks/completed/ folders in the app's markdown preview; find
   red links; capture WHICH links and their targets. Classify each red
   against the four rivals — measurement decides, not the ranking.
2. Fix the real generator(s). If a red is TRUE (target genuinely absent),
   that is correct behavior — say so; the defect class then lives in the
   link-writing tooling, not preview.
3. Double-click: one mouse event path, shared hit geometry with the
   existing link hover/click model (no parallel math). Define single vs
   double click semantics cleanly (existing single-click behavior must
   not break). Internal links open in the editor/preview; define external
   http(s) behavior explicitly (and say what you chose).
4. Contracts after the behavior is right; extend the markdown harness
   smoke. NOTE: smoke-markdown-harness has two known defects filed as
   #362 (an ordinal settings drive at line 2428 and a load-clipping
   preview assertion) — do not chase them, but avoid making either worse;
   if your assertions go near them, say so.

## Rules

- No merge-gate.sh by hand; no SKIP_GATE. Commit through the hook;
  GATE_EXIT=0 is part of DONE. Commit BEFORE writing READY — real hash
  and GATE_EXIT in the header, never placeholders. Write the report to
  the main checkout's task folder (absolute path).
- Known flaky classes: #214, #359, #362, #371. Name, do not chase.
- Builders never push; the conductor lands.

## Invariants in scope

- src/modules/markdown contracts (link resolution, preview records) and
  any navigation records for opening files from links. Answer record by
  record: upheld / violated / needs refinement, plus missed records.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md) taxonomy; include ## Bycatch even if "None observed."

## Definition of done

READY report in this folder, standard naming (report prefix, number 347,
the task slug, md extension): red-link census with per-rival
classification, fixes with driven before/after, double-click semantics +
driven proof, gate chain, invariants answered, bycatch.
