# Brief 493-1 — ast-query gains imports-of and string-literal census modes

## In plain words

Add two small modes to [scripts/ast-query.ts](../../../../scripts/ast-query.ts): "who imports from
module X" and "which string literals match a given list". The #488
builder wrote bespoke walkers because these were missing; fold their
shapes in as first-class modes.

## The work

1. Read the two walkers in
   [the completed 488 folder](../../completed/488-core-to-plugin-coupling-census/report-488-core-to-plugin-coupling-census.md)
   (census-488-imports.ts, census-488-vocabulary.ts) — they carry the
   exact predicate shapes AND the both-arms control pattern.
2. Add the two modes to scripts/ast-query.ts with its existing CLI
   conventions. Self-test: each mode proves it can fire and can stay
   silent (positive + negative arm in the tool's own self-test).
3. Add one row each to [project.tools.md](../../../../project.tools.md) (question, result shape,
   gotcha).
4. The 488 census scripts stay as they are (they are a committed
   record); do not rewrite them to use the new modes.

## Invariants in scope: none expected (tooling only) — refute if wrong.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy even when None observed.

## Instrument feedback

EASY / CONFUSING / MISSING as usual.

## Rules

- Never run scripts/merge-gate.sh. Commit on your branch; READY report
  in the task folder.
