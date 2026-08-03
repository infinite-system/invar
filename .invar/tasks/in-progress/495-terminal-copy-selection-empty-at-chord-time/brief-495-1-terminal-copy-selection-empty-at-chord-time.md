# Brief 495-1 — why is the terminal selection empty at chord time?

## In plain words

The user drags over Claude's output in a terminal pane, sees a
highlight, presses Ctrl+C — the app finds no selection and forwards
the chord to Claude as an interrupt. terminal.copy works when a
selection exists. Find why none exists in a real claude session, then
make copy work there. Report the UX choice; do not decide it alone.

## Reproduce by DRIVING first

Read the task file FULLY — it carries the user's closing telemetry
record and three ranked rivals, each with a separating observation.
Use the drive-pty skill: one warm headless server in your worktree,
GraphClient waits, screen reads. Do not write any assertion until you
have SEEN the failure by driving.

Run each rival's separating observation, in order:

1. Mouse-mode child: run a child that enables mouse reporting (claude
   itself, or a small script that emits the enable sequences and
   echoes events). Drag across its output. Read hasSelection through
   the graph and watch where the mouse bytes went. If the drag is
   forwarded, also establish what painted the highlight the user saw.
2. Busy child without mouse mode: drag over constantly-repainting
   output, wait, sample hasSelection over time — does it clear?
3. Plain shell: select, Ctrl+C, read the COPY_PATH_TELEMETRY record
   (INVAR_COPY_PATH_TELEMETRY=1) and clipboardEmissions. Does the
   telemetry report terminal selections, or is selectionOwner:"none"
   a blind spot?

## Then

- Name the mechanism with drive evidence.
- Fix so a drag over a mouse-mode child still yields a copyable
  selection. Shift+drag = app-owned selection is the common terminal
  convention and the leading candidate — implement behind the existing
  seams, but STATE the UX decision plainly in your report for the
  user to confirm; if another shape fits the contracts better,
  propose both.
- Telemetry gains terminal-selection reporting (selectionOwner names
  the terminal pane, length real) either way.
- Iterate drive -> change -> drive. Ratchet ONLY at the end: a smoke
  driving a mouse-mode child (select, copy, assert clipboard bytes and
  the telemetry record). One verification pass at the end.

## Invariants in scope

- Child terminal modes own wheel input
  ([src/modules/terminal/terminal.invariants.md](../../../../src/modules/terminal/terminal.invariants.md)) — the drag question
  lives at this record's boundary; a refinement proposal is a
  legitimate outcome, never a silent violation.
- A terminal selection owns copy; with no selection the chord falls
  through to the child (annotated at TerminalPaneContent.ts:220).
- Copy reaches the host terminal
  ([src/modules/system/system.invariants.md](../../../../src/modules/system/system.invariants.md)).
- Focus owns the keystroke
  ([src/modules/keybindings/keybindings.invariants.md](../../../../src/modules/keybindings/keybindings.invariants.md)).
Answer record by record in the report; name any record this list
missed.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s bycatch taxonomy even when None observed.

## Instrument feedback

Report EASY / CONFUSING / MISSING about the drive layer; asks get
converted. Note: a DriveSession drag primitive is already filed
(#489) — if you need one, say so rather than building it twice.

## Rules

- Never run scripts/merge-gate.sh; the conductor gates and lands.
- Commit on your branch as you go. READY report in the task folder.
