# Brief 506-1 — constructor first, and the constants role table

## In plain words

Move every constructor to the top of its class (85 of 113 violate),
enforce it in the file grammar, and write the constants role table
into the docs with its real mechanism: a subclass GETTER override
dispatches correctly even while the parent constructor runs; a FIELD
override applies only after construction. Also triage 13 suspicious
plain fields. [The task file](task-506-constructor-first-and-the-constants-role-table.md) carries the
full role table, the blessed member order, and the 13-field list —
read it first; it is the spec.

## Reproduce by DRIVING first

The sweep is mechanical, but the two hot classes get a real drive:
after moving TerminalInstance's and one pane class's constructors,
drive a terminal open + scrollback and a panel open on the warm
server (drive-pty skill) and compare to a pre-change drive. Byte-same
screens expected.

## Order of work

1. Grammar rule first: add constructor-first to check-file-grammar's
   class-file-order family (enforced for converted modules). Prove
   both arms: a planted violation reds the gate check; current tree
   reds with 85 (that IS the positive control), swept tree greens.
2. The sweep: 85 classes, constructor to the top (after statics; the
   blessed order is in the task file). Preserve comments attached to
   moved members. bunx tsc + bun test after each module batch, not
   one big bang at the end.
3. Docs: [project.conventions.md](../../../../project.conventions.md) + the ivue skill (template + spacing
   section) gain the role table WITH the construction-time-dispatch
   mechanism written out — the reason must be un-losable.
4. The 13-field triage table in your report (mutated-missed /
   add-readonly / DEAD-removed, one verdict each, with evidence).
5. Hot-path comments on the static readonly exception family
   (TerminalEmulator byte constants).

## Invariants in scope

- Per the task file: overridable-construction and public-namespace
  records in [project.invariants.md](../../../../project.invariants.md); layout and terminal contracts
  if any record cites member order. Answer record by record; name
  misses.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy even when None observed — the 13-field
triage is likely to surface real bycatch; dead code found elsewhere
during the sweep is reported, not fixed.

## Instrument feedback

EASY / CONFUSING / MISSING; asks get converted.

## Rules

Never run scripts/merge-gate.sh; your worktree commits skip the full
gate via the planted policy; the conductor gates and lands.
