# Brief #459 round 2 — confirmation scales with blast radius

## In plain words

Stop asking before closing a single instance. Keep asking before
closing a plugin tab, because that takes every instance inside it with
it. The user made this call; VS Code behaves the same way.

## Read this BEFORE you invest in round 1's helper item

Round 1's verification asked you to fix
`HarnessSmoke.closePanelContentsListRow` so it answers the
`Close <label>?` dialog. **For instance rows that dialog is going
away**, so do not build the confirmation-answering path for them. If
you already wrote it, keep only what a CONTAINER close still needs.

## The rule

Confirmation is warranted by how much the gesture destroys, not by
what kind of thing it is:

- **One instance → no dialog.** The user asked for exactly one thing
  and gets exactly one thing. This matches VS Code, which kills a
  terminal without asking.
- **A plugin tab / container → keep the dialog**, and make it carry the
  number: how many instances are about to close. A dialog that does not
  say what is at stake is friction pretending to be safety.

## Two properties the dialog was silently providing

Name what you are removing before you remove it, and say in the report
whether each still holds:

1. **A destructive-default guard.** The current dialog defaults to
   **No**. Removing it removes that safety. Decide honestly whether a
   single-instance close needs any recovery path at all. If the answer
   is no — the user's position, and VS Code's — say so plainly rather
   than inventing an undo nobody asked for.
2. **A pause before killing a live process.** Closing a terminal kills
   its child. **Open question for the user, do not decide it alone:**
   should a terminal running a FOREGROUND command still confirm? VS
   Code's `terminal.integrated.confirmOnKill` exists for exactly this
   and does not default to always-on. Report what the code makes
   cheap, and flag the choice — do not quietly add a second dialog.

## Why this is not merely cosmetic

That dialog is why no smoke has ever closed a terminal from the
instances list: the shared helper cannot answer it, so every existing
caller uses Database rows instead. The confirmation created a coverage
hole around a user-facing gesture. Removing it closes the hole; the
new driven assertions from round 1 then cover the real path.

## Verification

- Both arms: closing ONE instance must remove it with NO dialog
  painted; closing a CONTAINER holding instances must still paint one,
  and the dialog must state the count.
- Drive the real gesture, not a command call — hover the row, click the
  close glyph, observe the result.
- The round 1 assertions still apply: the empty-state message paints
  when the panel empties, and never while a cell remains.
- `bun test` in FULL, `bunx tsc --noEmit`,
  `bash scripts/conventions-gate.sh`, invariant checker `--all --refs`.
- Do NOT run `scripts/merge-gate.sh`. Commit with `SKIP_GATE=1`.

## Invariants in scope

- [The UI contract](../../../../src/modules/ui/ui.invariants.md) — any
  record describing close confirmation or destructive gestures. If a
  record asserts that destructive panel actions confirm, this change
  REFINES it: the claim becomes about blast radius, not about the
  action. Propose the sharper wording rather than deleting the record.
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. Write the
`## Bycatch` section even if it reads `None observed`.

## End state

The round 1 report, extended with a section on this change: what was
removed, which container gestures still confirm, and the foreground-
process question answered or explicitly flagged for the user.
