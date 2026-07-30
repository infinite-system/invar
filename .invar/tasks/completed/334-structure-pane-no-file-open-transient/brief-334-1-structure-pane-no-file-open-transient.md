# Brief #334 round 1 — structure dock says "No file is open" while ready

Read [AGENTS.md](../../../../AGENTS.md) fully before any work. Load
[.claude/skills/ibr/IBR.md](../../../../.claude/skills/ibr/IBR.md) and the
ivue skill before touching src/modules/**. The task file in this folder
(including the UPGRADE section) is part of this brief.

This red now blocks every landing. It is the priority.

1. Reproduce first: `bun test scripts/harness/Drive.test.ts` on your fresh
   worktree. The failing case is "prints a large Markdown file only after
   preview and structure work settle": the structure dock paints
   "No file is open." while the SAME snapshot reports structureStatus=ready
   and structureRows=110. That contradiction is the finding to explain —
   the status channel and the painted dock disagree.
2. Rival hypotheses — separate them, do not pick one:
   a. Paint lag: the dock's empty-state text is a stale frame from before
      the document attached; the settle wait accepts a frame the dock has
      not yet repainted (instrument: the wait's condition misses a
      publisher).
   b. Projection defect: structureStatus/structureRows publish from the
      model while the dock renders from a different (unattached) source —
      two sources for one truth (product).
   c. Ordering: large-Markdown preview work delays the structure dock's
      document binding; the empty-state branch wins a race (product,
      transient).
3. Whichever wins: fix product defects in the product; fix an instrument
   defect in the wait's CONDITION (never a timeout widening). The test
   asserts a settled screen — settled must MEAN the dock repainted.
4. Scale parity: the case is large-Markdown; drive small Markdown too and
   confirm both settle identically.
5. Positive control for any changed wait or assertion: plant, quote red,
   remove. Final pass: Drive.test.ts (all 12), the markdown and structure
   smokes, `bunx tsc --noEmit; echo TSC=$?`, invariants checker --all --refs.

Do not run scripts/merge-gate.sh. Commit in your worktree; no push, merge,
tag. Write your READY report as `report-334-<slug>.md` (this task's slug) in
this folder. END STATE: that report exists here.

## Invariants in scope

- [structure.invariants.md](../../../../src/modules/structure/structure.invariants.md)
  if present — read all records, report each implicated one.
- Harness records
  [harness.invariants.md](../../../../scripts/harness/harness.invariants.md):
  waits observe conditions; the screen oracle rule — the emulator grid is
  truth, so a status/paint disagreement implicates the projection layer too.
- Status projection: the #322 family ("status/editor columns read the shared
  projection seam") — check whether structureStatus reads the same painted-
  content truth the dock renders.
- Report record by record: upheld, violated, or needs refinement. Name any
  record this list MISSED.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s bycatch taxonomy. Include
the section even when it reads "None observed".
