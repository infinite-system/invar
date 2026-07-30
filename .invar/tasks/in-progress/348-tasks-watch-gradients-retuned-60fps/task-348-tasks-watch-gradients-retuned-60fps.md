# #348 — tasks:watch gradients retuned for 60fps

State: IN-PROGRESS
Priority: user-directed
Engine: claude
Environment: linux
Model: opus-5
Effort: medium

## The request (user, 2026-07-30)

tasks:watch's gradients were tuned at 30fps. #329 restored the tick at
60fps, so the gradient animation now advances twice as fast as designed —
too fast to view. Adapt the gradient timing to 60fps: same visual SPEED as
the 30fps original, double the temporal resolution.

## The shape

- The fix is time-based, not frame-based: derive gradient phase from
  elapsed milliseconds (or divide per-frame phase steps by the frame-rate
  ratio), so the visual speed is frame-rate-invariant — if the fps changes
  again, gradients keep their pace.
- Reference: scripts/tasks/TasksWatchRenderer.ts
  (TARGET_ANIMATION_FRAMES_PER_SECOND=60, animationFrameAtTime) and
  scripts/tasks/tasks-status.ts watch mode gradient code.
- Verify by driving tasks:watch and by unit test: gradient phase at t
  milliseconds equals the 30fps-era phase at the same t (assert phase
  values at fixed timestamps, not per-frame deltas).
