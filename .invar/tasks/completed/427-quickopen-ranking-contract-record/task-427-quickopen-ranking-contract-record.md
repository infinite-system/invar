# Task 427 — record the quick open ranking order as a contract

Priority: architecture-hygiene
State: COMPLETED — dbe86131 — Ranking tiers now contract-recorded with annotation. Bycatch: only known punctuation notes.
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## Source

#379 bycatch (codex, 2026-07-31): [search.invariants.md](../../../../src/modules/search/search.invariants.md)
carries six Quick Open records but none claims file-ranking order.
The three-tier rule #379 landed (a623ee71): case-insensitive exact
basename above every fuzzy match; fuzzy score second; lexical path
the final tie-breaker. The smoke is currently the only promise.

## Work

Add the ranking record (canonical fields; Evidence cites the scorer
and the #379 smoke assertion; Impossible-if-true: an exact basename
match observed below a fuzzy match). Annotation at the scorer's tier
seam. Checker clean.
