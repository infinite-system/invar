# Brief 395-1 — a focused input must live in the visible space

Read the task file in this folder. User-visible bug, reproduced three
times in #346: after a failed connection, Database: Connect focuses
the Database path input while ANOTHER content space is visible;
keystrokes edit an invisible field.

Work order:
1. Reproduce by DRIVING first (PTY harness): fail a connection, run
   Database: Connect with a different tab visible, type — observe the
   keystrokes vanish. No assertion yet.
2. Fix at the SEAM, not the symptom: a command that activates an
   input routes through the pane host's reveal path so
   focus-implies-visible holds structurally — not a one-off
   "select the Database tab first" patch inside the database module.
   Check whether other commands share the same unrevealed-focus path;
   if so, fix the seam once and list the beneficiaries.
3. Drive again: after Database: Connect, the focused input's space IS
   the visible space; typing edits what you see.
4. THEN the contract: count-based driven smoke (extend an existing
   database or focus smoke; new smoke only if no surface fits) —
   focused-element space == visible space after the command. Condition
   waits per [harness.invariants.md](../../../../scripts/harness/harness.invariants.md), never frame ordinals.
5. Verification pass at the end: tsc, focused tests, the smoke,
   checker --all/--refs.

Rules: no merge-gate.sh; no push; commit on the branch; READY report
here.

End state: report exists; before/after drive evidence; seam-level fix
with beneficiaries listed; smoke green with a planted-defect red
described.

## Invariants in scope
- Focus/UI records in [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) — enumerate those the seam touches, answer each.
- [harness.invariants.md](../../../../scripts/harness/harness.invariants.md) "Harness waits observe conditions not frame ordinals" — binds the new smoke.
Refute any my list missed.

## Bycatch expected
Report per [AGENTS.md](../../../../AGENTS.md) taxonomy; include a ## Bycatch section
even when it reads: None observed.
