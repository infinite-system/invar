# Task 420 — terminal-stage: expanded tool result paints the previous command

Priority: user-directed
State: IN-PROGRESS
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## Evidence (#417 bycatch, conductor-verified 2026-07-31 ~05:1x)

smoke-terminal-stage-harness now fails DETERMINISTICALLY on main
standalone (conductor reproduced: exit 1 at
driveAnimatedTerminalTools, smoke-terminal-stage-harness.ts:388) —
the status line sees the new readline buffer but the EXPANDED agent
tool result paints the PREVIOUS command. Builder reproduced on #417's
task base, main, and combined tree. NOTE: #411 recorded this smoke as
retry-green LOAD flake (from #393's gate) — it has since hardened into
a solid red, so bisect main between #393's landing (79b325ea) and now;
the regression likely landed inside the Field v2 window. User-visible
class (stale terminal content), not instrument-only.
