# #382 — claude's resume dialog is cut off in a small agent pane

State: ACTIVE
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## The report (user, 2026-07-30 ~08:0x)

In realized, .invar/tasks.json fires and opens claude correctly; claude
shows the "session too long — resume as is or resume from summary"
chooser. In our terminal pane the chooser is NOT visible/scrollable —
the user cannot scroll to make the choice and must expand the window.
Is it fixable so it is visible? Is it a bug on our end?

## Analysis to do

The agent pane hosts a PTY app; claude lays out its dialog for the
terminal size WE report. Candidates: (a) our pane reports a stale/wrong
rows-cols to the PTY (missing SIGWINCH/resize propagation on pane
layout), so claude draws for a bigger surface than visible; (b) the
dialog fits but our pane clips without scrollback for the live screen;
(c) claude's own minimum-height behavior (not ours — then the honest
answer is a minimum-usable-pane note + resize propagation proof).
Reproduce with a fake PTY app drawing a bottom-anchored dialog at
several pane sizes; verify resize events reach the child (stty size in
the child must equal the visible pane), then test with real claude in a
fixture workspace. Fix what is ours; document what is theirs.

## Context

Terminal render fixes (flicker) confirmed good by the user in the same
message — 3d/video panes work fine.
