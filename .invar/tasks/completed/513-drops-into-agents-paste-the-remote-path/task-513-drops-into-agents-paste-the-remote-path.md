# Task 513 — a drop into a focused agent or terminal pastes the usable path

Priority: user-directed
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
State: COMPLETED — 22c80f69 — Dropped files paste as remote-usable paths into the focused agent/terminal pane via the PaneContent drop capability.

## In plain words (user, 2026-08-05)

Dropping a file while a Claude session or terminal is focused inside
Invar should not OPEN the file — it should hand the child a path the
child can use. Locally: paste the real path (bracketed). Over iv ssh:
upload to the dropzone FIRST, then paste the REMOTE path into the
child. Claude and every CLI agent then works on the file like a
local one.

## The design

- One new branch in 508's drop routing seam, keyed on the focused
  pane content: terminal/agent kind -> paste-the-path route; all
  else -> today's open-by-kind route.
- Over the 509 channel the interception already uploads before
  notifying; the notification gains the focused-route case (paste
  into the child through the existing PTY write path — one backend
  seam, no second byte route).
- The paste is bracketed so the child's own paste handling engages
  (claude composer, readline).
- Multi-file drops paste space-separated quoted paths.

## Ratchet

Smoke arms: local drop onto a focused terminal (child receives the
bracketed path, app opens nothing); the localhost-sshd arm drops
onto a focused remote terminal and the child receives the DROPZONE
path; negative arm: focused editor still opens by kind.

## Invariants in scope

Terminal bytes cross exactly one backend seam; Focus owns the
keystroke; 508's routing records if any were added. Answer record by
record.
