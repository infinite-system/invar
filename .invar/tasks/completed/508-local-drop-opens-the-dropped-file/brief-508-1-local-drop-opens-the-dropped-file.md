# Brief 508-1 — M1: a dropped file opens

## In plain words

Dropping a file onto the terminal makes the terminal paste the file
path inside bracketed-paste framing. Enable the mode, recognize the
paste, and open the file the right way. [The blessed wave draft](the-wave-draft-blessed.md)
M1 section is the spec; [the task file](task-508-local-drop-opens-the-dropped-file.md) carries the
routing table and the confined-root working rule.

## Reproduce by DRIVING first

The gap first: send a bracketed paste containing a real path through
the warm server PTY and watch nothing happen (mode 2004 never
enabled — OpenTUI parses \e[200~ but the app never turns it on).
That sighting is the defect made visible.

## The work

1. Enable mode 2004 at boot (and re-assert where the terminal state
   machine could drop it); route paste events through ONE seam.
2. Drop detection: bracketed paste whose trimmed content is one or
   more existing-path tokens (quote/escape variants; multi-file
   drops). A path TYPED without bracketing must NOT trigger (negative
   arm in the smoke).
3. Routing: image/video -> media plugin pane; text -> open buffer;
   directory -> open-as-workspace offer (popup). Outside the
   workspace root: open read-only with a visible badge (working rule;
   the record refinement text is PROPOSED in your report, never
   written by you).
4. Ratchet: PTY smoke drives a framed path paste for each kind + the
   unbracketed negative arm; positive control planted per house rules.

## Invariants in scope

- Terminal bytes cross exactly one backend seam
  ([src/modules/terminal/terminal.invariants.md](../../../../src/modules/terminal/terminal.invariants.md))
- File access is confined to a single root
  ([src/modules/system/system.invariants.md](../../../../src/modules/system/system.invariants.md)) — propose the refinement,
  record verdicts honestly.
- Focus owns the keystroke ([src/modules/keybindings/keybindings.invariants.md](../../../../src/modules/keybindings/keybindings.invariants.md)) —
  paste routing must not eat keystrokes.
Answer record by record; name misses.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy even when None observed.

## Instrument feedback

EASY / CONFUSING / MISSING; asks get converted.

## Rules

Never run scripts/merge-gate.sh; worktree commits skip the gate via
the planted policy; the conductor gates and lands.
