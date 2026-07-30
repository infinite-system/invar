# #339 — 3D demo renders at supersampled pixel resolution on graphics-capable tiers

State: COMPLETED — 0d24d168 — 8x demo on graphics tiers; scale from encoder seam; gate green at re-gate
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## The request (user, 2026-07-30)

The user runs cmux on Ghostty (kitty-capable). The 3D demo currently renders
at cell resolution regardless of tier: `CellFramebuffer` allocates 1 pixel
per column and 2 per row (half-blocks), so kitty/sixel terminals show an
upscale of a ~100x48 source. He wants real resolution on a graphics tier.

## The shape

1. Tier-aware scale factor: when the negotiated tier is kitty or sixel,
   render the demo scene into a supersampled framebuffer (candidate 4-8 px
   per cell each way) and push true pixel frames through the EXISTING image
   encoders (PixelImageMount / ImageRenderers already carry real pixels for
   PNG preview). Half-block tier is untouched: cell-resolution path stays
   exactly as is.
2. MEASURE the software renderer first — do not assume a frame budget. The
   raymarched torus especially: pixel count rises ~30-60x. Measure per-frame
   render time per scene at candidate scales, pick the largest scale that
   sustains a smooth rate, allow per-scene scales (cube may afford more than
   torus). Counts and measured milliseconds in the report, not adjectives.
3. Invariants must survive with a bigger constant, not be weakened: one fixed
   working set (no per-frame allocation), memory independent of duration,
   producer/display pacing untouched. If a record needs its constant
   restated, that is a refines proposal, not a silent edit.
4. Scale parity: drive small and large pane geometry, both tiers.

## Constraints

- The user's OWN terminal drops kitty escapes (that was #338) — final visual
  confirmation on Ghostty is the USER'S step; the harness proves the encoder
  receives the supersampled frames (assert encoder input dimensions, not
  felt sharpness).
- No capability detection inside media (the #324 rule): the tier arrives
  from the existing image capability seam.
