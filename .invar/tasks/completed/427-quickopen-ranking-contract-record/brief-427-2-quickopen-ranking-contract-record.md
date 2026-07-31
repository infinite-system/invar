# Brief 427-1 — record the quick open ranking tiers

Read the task file. #379 landed the three-tier ranking (a623ee71);
only a smoke promises it. Write the contract record in
[search.invariants.md](../../../../src/modules/search/search.invariants.md)
per its local format: case-insensitive exact basename above every
fuzzy match; fuzzy score second; lexical path tie-break. Canonical
fields — Mechanism cites the scorer's tier seam; Evidence cites the
#379 smoke assertion and the score-printout diagnosis; Impossible if
true: an exact basename match observed ranked below any fuzzy match;
Verification: the smoke command. Status: provisional. Add the
invariant: annotation at the tier seam in the scorer. Checker
--all/--refs clean. Contract + annotation comment only; no behavior
change. No merge-gate.sh; no push; commit; READY report here.

## Invariants in scope
The six existing Quick Open records in [search.invariants.md](../../../../src/modules/search/search.invariants.md) — confirm
the new record contradicts none; answer each briefly.

## Bycatch expected
Report per [AGENTS.md](../../../../AGENTS.md) taxonomy; include a ## Bycatch section
even when it reads: None observed.
