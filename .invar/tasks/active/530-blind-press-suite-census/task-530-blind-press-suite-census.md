# 530 — blind press suite census

Priority: verification-integrity
State: ACTIVE
Engine: claude
Environment: linux
Model: fable-5
Effort: low

## In plain words

One smoke lost a mouse press because it clicked a control that had just
moved, before the app's hit map caught up. Other smokes may press the
same blind way. Find every press with no hover proof before it and fix
the members of the class.

## Evidence (from #529, 2026-08-06)

- Class C mechanism proven: OpenTUI's native hit grid lags the painted
  frame; a press inside the lag window dispatches by the previous frame's
  geometry and the gesture is silently consumed elsewhere (~1 in 6 edge
  drags in the probe).
- #529 fixed only smoke-panel-chrome's two edge drags (hover, await the
  reveal, then press).

## Outline

Census `kind: 'press'` sends across scripts/harness/* with no preceding
hover-verified move on a just-relaid-out target; classify each (static
target = safe; moved-this-frame target = class C); fix members with the
hover-reveal pattern. Cross-reference #529's two MISSING instrument asks
(hit-grid echo verb; cell-attribute waitForHoverState) — implementing
either shrinks this census to a mechanical sweep.
