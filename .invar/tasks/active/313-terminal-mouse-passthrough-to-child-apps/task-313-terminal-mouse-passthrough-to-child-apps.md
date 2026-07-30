# 313 — INVESTIGATE: mouse clicks pass through to child TUI apps (Claude Code scroll button)

State: active
Engine: codex
Effort: high
Provenance: USER-DIRECTED 2026-07-29

## User's words (verbatim, GOVERNS)

> so claude code has scroll to bottom button, but seems like my mouse
> click is not passing through, it sometimes it doesn't pass through in
> vscode as well, can we investigate if we can make it pass through?

## Investigation shape (diagnose FIRST, measure before briefing a cause)

Child TUI apps (Claude Code in the agent/terminal pane) request mouse
tracking from the host terminal via DECSET (1000 click, 1002 drag,
1003 any-motion, 1006 SGR encoding). For a click to reach the child,
Invar must: (1) capture the child's DECSET requests from the PTY output
stream; (2) when the child has mouse mode on and the pointer event
lands inside that pane, ENCODE the click as the requested mouse
sequence and write it to the child's PTY instead of (or in addition to)
consuming it for Invar's own UI; (3) translate coordinates to the
child's local cell space; (4) release tracking on DECRST.

Ranked hypotheses to verify against the actual code (do not assume):
1. Invar never parses/tracks the child's DECSET 1000/1002/1006 state.
2. Invar consumes all pointer events for pane focus/selection and never
   forwards any to the PTY.
3. Coordinates forwarded (if at all) are pane-global, not child-local.

Reproduce FIRST: run a real child app that reports clicks (e.g. a tiny
script enabling SGR mouse and echoing sequences — positive control that
fails loudly) inside the terminal pane; show the click never arrives.
Then diagnose against the code. Note the OpenTUI bracketed-paste
finding (reference: OpenTUI parses paste events but never enables 2004
— the mouse path may have the same shape: parsed upstream, never
enabled/routed).

## Implementation (if the investigation lands where expected)

- Track per-pane child mouse-mode state from PTY output.
- Forward clicks (and scroll wheel; decide drag/motion scope and record
  it) as SGR-encoded sequences with child-local coordinates when mode
  is on; Invar chrome (pane borders, tabs) keeps its own clicks —
  define the boundary: inside the child's viewport → child; on chrome →
  Invar.
- Both polarities: with mouse mode ON, click arrives at the child with
  correct cell coordinates (echo harness asserts exact sequence); with
  mouse mode OFF, clicks keep today's Invar-side behaviour (focus,
  selection) and NOTHING is written to the PTY.
- Scroll wheel over a mouse-mode child: decide whether wheel goes to
  the child or Invar scrollback, follow what real terminals do (cite),
  record the decision.
- The Claude Code scroll-to-bottom button becomes the real acceptance
  drive: click it through the agent pane and observe the transcript
  jump.

## Acceptance

PTY harness with an SGR-echo child proves sequence + coordinates both
polarities at both scales of pane geometry; real Claude Code drive
shows the button responding; contract records the chrome/child click
boundary.
