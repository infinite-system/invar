# Brief 439-2 — contract wording confirmed; apply and commit

The conductor confirms your proposed wording for
`File sources report displaced built-ins` in
[tasks.invariants.md](../../../../src/modules/tasks/tasks.invariants.md),
verbatim from your report. Apply it, bump `Last refined` to 2026-08-01.
Also apply the refinement you named for
`Panel content order is one persisted sequence` in
[ui.invariants.md](../../../../src/modules/ui/ui.invariants.md):
derived task notices may exist in the live order but never in the
persisted sequence — fold that sentence into the record.

Checker green (`--all --refs`, 0 problems), commit SKIP_GATE=1, append
one line to your report naming the commit.

## Invariants in scope

The two records above; wording only.

## Bycatch expected

Per the [AGENTS.md](../../../../AGENTS.md) taxonomy; `None observed`
is a valid section.
