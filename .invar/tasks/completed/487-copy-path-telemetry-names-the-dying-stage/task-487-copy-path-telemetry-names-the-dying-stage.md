# Task 487 — copy-path telemetry names the dying stage

Priority: user-directed
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
State: COMPLETED — 9f132d18 — copy telemetry: one record per attempt names surface, route, OSC 52 result

## In plain words

The user selects Claude's output in the agent pane and presses Ctrl+C.
Nothing lands on the clipboard. We proved the app's copy code works in
the harness, so the failure is in the user's real flow, at a stage we
cannot see. Make the app tell us: show a status flash when copy fires,
and write one log line naming what happened at each stage.

## Evidence so far (do not re-derive)

- Raw OSC 52 printf (invar-osc52-test) reaches the user's clipboard
  through cmux: transport works.
- #477 proved transcript-focus copy emits OSC 52 in-harness (5 chord
  forms). #482 proved composer-focus copy works, with a smoke arm.
- NEW (user, 2026-08-03): drag-selecting in the agent pane shows the
  INVAR palette highlight (bluish text) — the drag reaches the app and
  an app-side selection is active.
- User reports a "flinch" on Ctrl+C — consistent with the chord being
  forwarded to the Claude child instead of the copy handler.

## Wanted

1. When a copy chord is handled: status-bar flash "Copied N chars".
2. One structured log line per copy attempt (gated by an env flag or
   always-on debug file): focused surface, selection owner + length,
   chord route (copy handler vs forwarded-to-child), OSC 52 emitted
   yes/no + byte length.
3. If the chord is FORWARDED to the child while an app selection is
   active, log that explicitly — it is the prime suspect.
4. Drive-verified via the PTY harness; a smoke locks the telemetry
   (flash appears + log line written on a driven copy).

The goal is one observation from the user's real terminal closing the
diagnosis. Do not fix the routing in this task unless the telemetry
itself proves the route trivially wrong; report first.
