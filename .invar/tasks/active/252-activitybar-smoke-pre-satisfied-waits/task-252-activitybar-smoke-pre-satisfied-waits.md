# 252 — latent pre-satisfied waits in the activitybar smoke's awaitStatus arms

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: flake-evidence

## Outline

Bycatch of #35 round 2, found BY a positive control: while fixing the
literal-order assertion in `smoke-activitybar-harness`, the builder's first
planted defect — expecting the INITIAL order after Alt+Up — PASSED, because
that expectation is already true before the keystroke fires. The #182/#198
class (a wait that cannot fail launders a no-op into a green) sits latent in
this smoke's `awaitStatus` arms.

Audit every wait in the smoke: for each, answer "is this condition FALSE at
the moment the wait begins?" Add a pre-action hidden assertion (the #211
pattern) where the answer is no. Positive control per repaired arm.

## Invariants in scope

- The harness records naming the wait-must-be-a-condition rule; extend the
  smoke, not the records, unless a record gap appears.

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- `report-35-...md` `## Gate follow-up`, red 1, second positive control.
