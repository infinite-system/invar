# Brief 438-1 — builder worktrees get a planted hook policy

## In plain words

The repo pre-commit hook runs the full merge gate. That is right for
the conductor's checkout and wrong in builder worktrees: five briefs
in two days were bitten (accidental gate runs, hand SKIP_GATE, one
gate mid-fleet). Make dispatch plant a worktree-local policy so
builder commits are fast and quiet BY DEFAULT, with the light checks
kept.

## The decided direction (user-authorized; do not re-litigate)

- dispatch.sh, after cutting the worktree, plants configuration that
  makes commits in THAT worktree skip the full merge-gate (keep
  prettier/format-and-stage if cheap; keep git hygiene). Candidate
  mechanisms: core.hooksPath to a builder hook set, or an env/marker
  file the existing hook checks — pick what the existing hook
  structure makes cleanest and say why.
- The conductor's main checkout behavior is UNCHANGED.
- The planted policy must be self-describing: the builder hook prints
  one line saying what it skipped and why that is safe (the conductor
  gates the combined tree at landing).
- Evidence sites: task file evidence sections (#487, #493, #495 x2,
  #490 report notes).

## Reproduce by DRIVING first

Cut a scratch worktree the way dispatch does, commit a trivial change
there, watch the full gate launch (the defect). After the change:
commit is fast, prints the policy line; the SAME commit in the main
checkout still launches the gate (both arms).

## End state

DRY_RUN=1 dispatch shows the planting; a real scratch-worktree commit
skips the gate with the policy line; main checkout unchanged; the
dispatch self-checks still pass; update the conductor skill's brief
Rules boilerplate note (SKIP_GATE=1 line becomes unnecessary for new
briefs — say so in the report; the conductor updates doctrine at
landing).

## Invariants in scope

none expected (fleet tooling); refute if wrong.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy even when None observed.

## Instrument feedback

EASY / CONFUSING / MISSING; asks get converted.

## Rules

Never run scripts/merge-gate.sh. SKIP_GATE=1 for your commits (yes,
the irony); the conductor gates and lands.
