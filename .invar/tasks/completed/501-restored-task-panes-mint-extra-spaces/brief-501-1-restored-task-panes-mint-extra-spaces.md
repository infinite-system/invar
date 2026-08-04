# Brief 501-1 — restored task-kind panes must not mint extra spaces

## In plain words

The user's saved settings hold panel panes whose kinds are task keys
(task:<root>:0 labeled Claude). Those panes used to restore INSIDE the
Terminal space. Since the #405 declaration map, restore mints one new
space per undeclared kind, so the user sees extra Claude and Terminal
tabs in the panel tab row. Restore must keep such panes in their
persisted space, and the healed state must persist on next save.

## Reproduce by DRIVING first

Read [the task file](task-501-restored-task-panes-mint-extra-spaces.md) — it carries the user's real
settings shape (READ ONLY at ~/.config/invar/settings.json — NEVER
write to the user's real config; copy the shape into a scratch drive
home). Build a drive home whose settings.json panelWorkspaceStates
contains a terminal space holding a task-kind pane (copy the exact
kind/label shape), boot the warm server with that home, and SEE the
extra spaces in the tab row. That sighting is your entry ticket.

Use the drive layer per the drive-pty skill: warm server in your
worktree, fluent snippets, graph waits (panelHost paths), screen
reads for the painted tab row.

## The fix shape (propose better if the code disagrees)

- A persisted pane whose kind no runtime declares restores into the
  space its saved state names — never a minted space.
- Decide the general rule for DYNAMIC kinds (task:<...> panes are
  created at runtime by the tasks feature): where do they belong when
  their space is absent? Keep the old fold-into-terminal as the
  explicit fallback if nothing better exists, but as data in the
  restore path, not a hardcoded kind table (do not undo #405).
- The user's existing settings heal on next save (extra minted spaces
  collapse back); prove by driving the same home twice.
- Ratchet: a smoke arm restoring a saved task-kind pane and asserting
  the tab row (no minted spaces; the pane lands in Terminal).

## Invariants in scope

- Panel content order is one persisted sequence
  ([src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md))
- A persisted pane identity is never reissued
  ([src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md))
- An emptied space survives its last instance
  ([src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md))
Answer record by record; name misses.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy even when None observed.

## Instrument feedback

EASY / CONFUSING / MISSING; asks get converted.

## Rules

Never run scripts/merge-gate.sh; SKIP_GATE=1 for commits; the
conductor gates and lands. NEVER write to the user's real ~/.config.
