# Task 498 — global chords do not pass through a focused panel

Priority: user-directed
Engine: codex
Environment: any
Model: 5.6-sol
Effort: medium
State: IN-PROGRESS

## In plain words

With the Agent pane focused, Ctrl+Shift+X does not open Extensions,
and a nearby note says Ctrl+P does not reach Quick Open either. The
panel keeps non-reserved global chords. A user inside any panel loses
the app-level commands. Decide and implement the pass-through rule:
which chords are global-reserved, and how a panel declares what it
consumes.

## Evidence

- #356 report (completed folder), Bycatch NOT FIXED: reproduced three
  times while building the lifecycle smoke; the smoke works around it
  by clicking the visible control instead.
- Related contract: A focused panel routes keystrokes to its active
  pane content (ui.invariants.md) — the repair must refine, not
  violate: routing to the pane stays; RESERVED app chords bypass.

## Coordination

#490 (chord relocation) touches the same keybinding files — sequence
after it, or brief them together.

Round 2 of [#356 (Agent pane is a decoupled module)](../../in-progress/356-agent-pane-is-a-decoupled-module/task-356-agent-pane-is-a-decoupled-module.md) adds the generic `applicationGlobal` binding flag and focused-pane routing seam. This task still owns the wider policy for existing app chords and pane consumption.
