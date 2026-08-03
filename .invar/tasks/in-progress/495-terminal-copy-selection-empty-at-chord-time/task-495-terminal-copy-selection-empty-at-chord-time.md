# Task 495 — terminal copy finds no selection at chord time in the agent terminal

Priority: user-directed
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
State: IN-PROGRESS

## In plain words

The user drags over Claude's output in their agent terminal, sees a
highlight, presses Ctrl+C — and the app finds no selection, so the
chord goes to Claude as an interrupt. terminal.copy exists and works
when a selection exists. Find why the selection is empty at chord
time in a real claude session, and make copy work there.

## The closing telemetry record (user's real cmux, 2026-08-03)

{"focusedSurface":"terminal","selectionOwner":"none","selectionLength":0,
 "routeTaken":"forwarded-to-child-pty","osc52Emitted":false}

## Ranked rivals (probe before belief)

1. The child (claude CLI) enables mouse reporting; the drag is
   FORWARDED to the child, so TextSelectionModel never begins. The
   highlight the user saw needs its own explanation then (child-side
   rendering? theme-colored?). Separating observation: drive a child
   that enables mouse mode (or claude itself), drag, read
   hasSelection via the graph.
2. The selection forms but CLEARS before the chord (click-to-focus
   clears it, or child repaint/scroll invalidates it — claude repaints
   constantly). Separating observation: drag over a busy child WITHOUT
   mouse mode, wait, read hasSelection over time.
3. The telemetry only reports agent-pane selections and misreports
   terminal ones ("selectionOwner":"none" blind spot) while
   terminal.copy's own gate also failed for a different reason.
   Separating observation: make a plain-shell terminal selection,
   press Ctrl+C, read the telemetry record and the clipboard.

## Wanted

The mechanism named with drive evidence, then the fix so that a drag
over a mouse-mode child still yields a copyable selection (or a
deliberate alternate: Shift+drag = app selection, matching common
terminal convention — propose, do not unilaterally choose UX).
Telemetry gains terminal-selection reporting either way. Ratchet with
a smoke driving a mouse-mode child.

## Invariants in scope

- Child terminal modes own wheel input (terminal.invariants.md) — the
  drag-forwarding question lives exactly at this record's boundary;
  a refinement may be needed rather than a violation.
- Copy reaches the host terminal (system.invariants.md).
- Focus owns the keystroke (keybindings.invariants.md).
