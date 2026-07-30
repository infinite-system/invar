# 329 — tasks:watch animation tick restored (60fps diff frames; #321 regression)

State: active
Engine: codex
Model: 5.6-sol
Effort: high
Provenance: USER-DIRECTED 2026-07-29
Priority: user-directed (queued behind the transplant; fleet in wind-down)

## User's words (verbatim, GOVERNS)

> i think you disabled 30fps for tasks:watch but now animation is not
> working, for building... etc, maybe we should bring it back also at
> 60fps?

## Diagnosis (conductor, from #321's own report — verify)

#321 (f0a860bf) converted tasks:watch from a fixed 30 FPS full-repaint
loop to repaints on ledger data ticks. Content correctness kept; the
TIME-BASED animation (building… spinner / motion glyphs) lost its
clock — it now only advances when data changes.

## Design

Two tick sources, one renderer:
- DATA ticks repaint changed content rows (as #321 built).
- An ANIMATION tick at 60fps advances ONLY the animated cells
  (spinner/motion glyphs on live rows), emitted as DEC-2026-bracketed
  cursor-home row diffs per #321's frame discipline — the animation
  frame is a few bytes, not a full repaint. No full-screen clears
  return. When zero live rows are animating, the animation timer IDLES
  (no wakeups — a still dashboard costs nothing).
- Frame pacing derives from the render loop's real capability; 60fps
  target, degrade gracefully under load (skip, never queue — the #324
  lightest-streaming invariant applies to this watcher too).

## Acceptance (both polarities)

- With a live building row: the spinner advances at ~60fps with NO data
  changes (raw capture: bracketed diff frames, bytes-per-frame bounded,
  zero full clears, zero blank/partial frames — extend #321's capture
  probe).
- With no live rows: zero animation writes (capture silence — the idle
  arm).
- #321's contracts stay green: synchronized brackets matched, data-tick
  repaints unchanged, non-2026 path unaffected.
- Planted control: freezing the animation clock must fail the
  advancing-spinner assert red.

## Invariants in scope

terminal contract (#321's synchronized-output records), the tasks:watch
renderer (scripts/tasks/TasksWatchRenderer.ts), #214 census (load
behavior of the new tick under pool starvation — normalise before
tolerating).
