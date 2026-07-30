# #343 — tasks activity-bar icon becomes a play glyph; LIVE row gets the watch spinner

State: ACTIVE
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## The request (user, 2026-07-30, verbatim intent)

1. The tasks entry in the activity bar currently shows a gear icon. Change
   it to a play button "or something closer to tasks" — a glyph that reads
   as run/tasks, not settings.
2. In the tasks pane's LIVE section: the building/exploring rows show a
   number; put an animated loader under/near the number beside the word,
   like `* building` where `*` is the spinner — the SAME spinner animation
   `bun run tasks:watch` uses (scripts/tasks/TasksWatchRenderer.ts is the
   reference; reuse its glyph cycle, do not invent a second spinner).

## Boundaries

- Idle-quiescence contract: the spinner may only animate while a LIVE row
  exists (dashboard motion exists only while observed —
  src/modules/tasks-dashboard/tasks-dashboard.invariants.md). No live rows,
  no timer, frame counter still at rest.
- One spinner generator: if tasks:watch's glyph cycle is reused, reference
  the shared generator rather than copying the frames (seam rule).
- Activity-bar glyph change is a one-cell visual; check the glyph renders in
  the ASCII glyph tier too (glyphMode fallback).
