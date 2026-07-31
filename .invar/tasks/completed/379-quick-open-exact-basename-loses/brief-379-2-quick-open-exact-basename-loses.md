# Brief 379-1 — an exact basename match ranks first

Read the task file in this folder. Reproduced every #347 census run:
typing a FULL basename leaves a sibling selected first.

Work order:
1. Reproduce by DRIVING: quick open, type the full basename from the
   task file, observe the wrong first selection.
2. Read the scorer; find WHY the sibling outranks the exact match
   (the structural read is a HYPOTHESIS — confirm it with a focused
   score printout of both candidates before changing anything).
3. Fix the ranking so an exact basename match always ranks first.
   State the rule you implement (exact-basename tier above fuzzy
   score, or a score bonus — prefer the tier: no invented threshold).
4. Census the neighborhood: exact match with different case,
   extension omitted, multiple exact matches (dir disambiguation) —
   state each behavior in the report.
5. Ratchet: the assertion goes into the existing quickopen smoke
   (condition waits). Planted-defect red proven, then removed.
6. Verification: tsc, focused tests, smoke, checker --all/--refs.

Rules: no merge-gate.sh; no push; commit on the branch; READY report
here.

## Invariants in scope
- Any quick-open/palette records in the ui or workspace contracts —
  enumerate and answer. Refute any missed.

## Bycatch expected
Report per [AGENTS.md](../../../../AGENTS.md) taxonomy; include a ## Bycatch section
even when it reads: None observed.
