# Task 477 — copying agent output from the agent pane does not work

Priority: user-directed
State: COMPLETED — 08ab9d46 — Landed: shared-drag hover fix + assistant-reply copy smoke, no production change. Morning item for the user: confirm whether cmux forwards Cmd+C/kitty Ctrl+C over ssh — the app side is proven.
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high

## Evidence (user, live, 2026-08-03)

"for some reason i cannot copy claude's output via ctrl+c or cmd+c in
invar, so i had to rephrase what he said". Context: the user runs Invar over
ssh from a Mac (cmux built on ghostty); the agent pane runs Claude; they
selected agent output and neither chord copied it.

## Reading — hypotheses to SEPARATE by driving, not to assume

- Ctrl+C in a terminal-family pane is SIGINT to the child by design — if the
  agent pane treats it that way, copy needs a different chord or a
  selection-active carve-out (what do we do in plain terminal panes?).
- Cmd+C arrives only via the kitty keyboard protocol (Bootstrap enables
  useKittyKeyboard for exactly the mac-overlay chords) — over ssh through
  cmux, does Super+C reach the app at all? Drive-pty cannot synthesize the
  cmux side; the user's terminal is the fixture for that arm.
- Selection-copy machinery exists ("Copy reaches the host terminal", OSC52,
  #299 unified selection/copy) — check whether the agent pane participates
  in the selection seam at all, or only editor/terminal panes do.

## Verification

Reproduce first in-harness where possible (selection in agent pane +
the app's copy command), assert through the existing copy-emission audit;
the Cmd-over-ssh arm needs the user's real terminal as final verifier.
