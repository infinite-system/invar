# Brief 513-1 — a drop into a focused agent or terminal pastes the usable path

## In plain words

Dropping a file while a terminal or Claude session is focused must
hand the CHILD a usable path instead of opening the file: locally the
real path, over iv ssh the uploaded dropzone path — bracketed either
way so the child's paste handling engages. [The task file](task-513-drops-into-agents-paste-the-remote-path.md) is the
spec (design, multi-file form, ratchet arms).

## Reproduce by DRIVING first

On the warm server: focus a terminal, send a framed path paste, watch
today's behavior (the app OPENS the file away from the child — the
defect for this context). Then the localhost-sshd arm from 509's
smoke shows the remote side.

## The work

One routing branch at 508's seam keyed on focused pane content kind
(terminal/agent -> paste route; else -> open-by-kind); over the
channel, the existing upload happens first and the notification
carries the focused-route case; the paste goes through the existing
PTY write path (one backend seam). Multi-file: space-separated
quoted paths. Ratchet per the task file, including the negative arm
(focused editor still opens by kind).

## Invariants in scope

- Terminal bytes cross exactly one backend seam
  ([src/modules/terminal/terminal.invariants.md](../../../../src/modules/terminal/terminal.invariants.md))
- Focus owns the keystroke ([src/modules/keybindings/keybindings.invariants.md](../../../../src/modules/keybindings/keybindings.invariants.md))
- Any routing record 508 added — answer record by record; name misses.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy even when None observed.

## Instrument feedback

EASY / CONFUSING / MISSING; asks get converted.

## Rules

Never run scripts/merge-gate.sh; worktree commits skip the gate via
the planted policy; the conductor gates and lands.
