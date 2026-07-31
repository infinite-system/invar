# Brief 425-1 — record the two proven-but-unwritten LSP monitoring disciplines

Read the task file in this folder; it carries #412's exact findings.
Two jobs:

1. Refine "A runtime reading is a delta over a named window"
   ([monitoring.invariants.md](../../../../src/modules/monitoring/monitoring.invariants.md)):
   widen Scope to cover registered child processes and the platform
   sampler interface, which the landed code (22e667f2) already obeys.
2. Add the missing record(s): monitored server identity comes ONLY
   from the owner's spawn registry (never process-table name-grep),
   and absence reads GONE, never idle-0%. Full canonical fields —
   Mechanism/Evidence cite LanguageClient registry + MonitoringStats;
   Impossible-if-true must be concrete; Verification names the
   fixture contract test. Status: provisional. Add invariant:
   annotations at the enforcement points.

Rules: contract + annotation comments only (annotations are comments
in code files — allowed); no behavior changes. Checker --all/--refs
clean; run the fixture contract test to confirm Verification commands
are real. No merge-gate.sh; no push; commit; READY report here.

End state: report exists; refine + new record(s) in place; annotations
resolve; checker clean.

## Invariants in scope
The monitoring and lsp contracts — answer record by record.

## Bycatch expected
Report per [AGENTS.md](../../../../AGENTS.md) taxonomy; include a ## Bycatch section
even when it reads: None observed.
