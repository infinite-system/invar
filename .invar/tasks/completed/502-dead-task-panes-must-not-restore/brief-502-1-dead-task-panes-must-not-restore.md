# Brief 502-1 — dead task panes must not restore

## In plain words

Saved task-kind panes restore as tabs although their tasks died long
ago. Drop provably-dead task panes at restore, keep genuinely
reattachable ones, save the healed layout. The user watches this row
daily — make it clean.

## Reproduce by DRIVING first

Copy the shape from [the task file](task-502-dead-task-panes-must-not-restore.md)'s driven evidence: a scratch
home whose settings hold task:<root>:0 "Claude" and task:<root>:1
"Terminal" panes inside the terminal space (NEVER write the user's
real ~/.config). Boot, open the panel, SEE the stale Claude/Terminal
tabs. Establish the liveness test for a task pane (what does the
tasks feature key them to, and when can one reattach?) — name it in
the report BEFORE fixing.

## The work

1. At restore, a task-kind pane whose task cannot be found is DROPPED
   (not folded in); one that can reattach keeps working exactly as a
   live task pane does today — do not break live task panes.
2. The healed layout saves (double-boot proof: second boot reads a
   file with no dead task panes).
3. Ratchet: extend the #501 smoke arm — the saved shape with dead
   task panes boots to a row WITHOUT them, twice.
4. While there: the restored "Terminal 5..12" herd is legitimate
   (real terminals) — do NOT touch those.

## Invariants in scope

- Panel content order is one persisted sequence
  ([src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md))
- A persisted pane identity is never reissued
  ([src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md))
- A pane runtime owns its processes
  ([src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md))
Answer record by record; name misses.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy even when None observed.

## Instrument feedback

EASY / CONFUSING / MISSING; asks get converted.

## Rules

Never run scripts/merge-gate.sh; SKIP_GATE=1 commits; the conductor
gates and lands. NEVER write to the user's real ~/.config.
