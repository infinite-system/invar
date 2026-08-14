# 560 — harness cli manifest compat fix

Priority: verification-integrity
State: ACTIVE
Engine: claude
Environment: linux
Model: fable-5
Effort: low
Assignment note: conductor self-do — two defects found by post-#556
landing acceptance on main.

## In plain words

Two fixes. One: talking to a warm server started before M3 crashed the
CLI, because the old server's id-file has no birth-commit field and the
warning code assumed it always exists. Two: task 556's structured
report file landed with merge-conflict scribbles inside (two copies of
it met in the merge) — rewrite it clean, and the branch never plants
one where main will write one.

## The deliverable, twice

CODE: warnIfStale guards absent bootCommit (undefined AND null); test
with an old-format manifest; 556's report-meta.json valid again;
metrics count it.
VISUAL: attached queries against any server version answer without
crashing; `get metrics.tasksWithReportMeta` reads 1.

## Invariants in scope

- iv-harness.invariants.md "A graph server is a disposable cache" —
  the compat guard upholds "clients never depend on server version".

## Bycatch expected

Report per AGENTS.md taxonomy, even when None observed.
