# Brief — #253: the systematic sweep — every [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) citation verified

Read first:
`.invar/tasks/in-progress/253-ui-contract-systematic-citation-sweep/task-253-*.md`
— it carries the verdict from two spot-repair rounds (#239, #243), the known
seeds, and the checker question.

The method is #239/#243's, applied exhaustively: enumerate EVERY citation in
[src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) (Mechanism, Evidence, Scope, Verification).
For each: the path exists AND the named symbol is owned by the cited file —
AST via `bun scripts/ast-query.ts identifiers <name> --tests`; existence
alone cannot validate ownership. Read each replacement owner before any
repair. One planted positive control, quoted, removed.

Fix the known seeds inside the sweep (the dead keybindings test path at
:767, SelectableText's two rotted header comments, RootView's short-form
citations) and DECIDE the checker question: it currently accepts
`(ui.invariants.md)` where convention requires root-relative — if you make
it refuse, both control arms, apparatus rule.

The deliverable that outlives you: a table in the report — citation, kind,
verdict (valid / repaired / removed), evidence pointer — so "every citation
verified" is checkable, not claimed.

## Invariants in scope

- [src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) — the whole file.
- [src/modules/ui/ui.lattice.md](../../../../src/modules/ui/ui.lattice.md) — 217 links stable, counts quoted before
  and after.
- `.claude/skills/invariants/scripts/check_invariants.mjs` if the
  short-form decision changes it.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy — the contract-boundary gap especially: evidence
that ui records now depend on editor/filetree/git owners belongs to #241
(the user's split decision); report toward it, do not decide it.

## Verification

Checker `--all --refs` at zero problems, counts quoted. Contract-only
unless the checker changes (then its own controls). Do not run merge-gate.
Commit `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`. Prose
STE-flavored.
