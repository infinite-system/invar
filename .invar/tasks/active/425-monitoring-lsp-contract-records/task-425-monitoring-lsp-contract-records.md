# Task 425 — record the LSP monitoring invariants #412 proved but never wrote

Priority: architecture-hygiene
State: ACTIVE
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## Source

#412 bycatch (codex, 2026-07-31), verbatim findings:

1. Refine: "A runtime reading is a delta over a named window"
   ([monitoring.invariants.md](../../../../src/modules/monitoring/monitoring.invariants.md))
   scopes only RuntimeSample and Invar processes; the implementation
   now upholds it for registered child processes through the platform
   sampler interface — widen the Scope to match reality.
2. Gap: no record claims monitored language-server identity comes
   only from the owner's spawn registry (never process-table
   name-grep), nor that absence reads GONE, not idle. Both behaviors
   are tested (fixture contract, landed 22e667f2) but uncontracted —
   a discipline enforced only by tests is one refactor from silent
   loss.

## Work

Propose the refine plus the new record(s) with Mechanism/Evidence/
Impossible-if-true/Verification citing the landed code and tests;
annotations at the enforcement points (LanguageClient registry,
MonitoringStats sampler). Checker --all/--refs clean.
