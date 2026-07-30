# 324 — terminal 3D demo (cube or crazier) + sample video playback

State: IN-PROGRESS
Engine: codex
Model: 5.6-sol
Effort: high
Provenance: USER-DIRECTED 2026-07-29

## User's words (verbatim, GOVERNS)

> yes, that demo cube or even something crazier + sample videos that
> you can play as well

(In response to the conductor's proposal: half-block sub-cell renderer
first, kitty-protocol/sixel pixel tier where available, DEC-2026 sync
for flicker-free animation, riding the existing pixel/image-preview
capability machinery.)

## Design

1. **Renderer foundation**: a cell framebuffer surface — half-block
   (2 pixels/cell, truecolor) as the universal fallback; route through
   the EXISTING pixel/image capability tier (kitty/sixel) where the
   host terminal supports it (the image-preview machinery owns
   detection — reuse, do not duplicate). Frames bracketed in DEC 2026
   when #321 lands (coordinate; if it has not landed, emit the
   brackets anyway — harmless where unsupported).
2. **3D demo**: a software-rendered scene — at minimum a shaded
   rotating cube; "or even something crazier" invites one better scene
   (e.g. a raymarched shape or the classic donut torus with proper
   lighting) — pick ONE crazier scene, keep it tasteful, record the
   choice as placeholder-for-user-refinement. Reachable as a command
   (palette entry / `--demo` flag — follow how existing demo/preview
   surfaces are launched).
3. **Video playback**: play sample videos in a pane — decode via an
   available system tool (ffmpeg presence detected, loud graceful
   notice when absent — never a silent failure), frames scaled to the
   cell framebuffer / pixel tier; play/pause at minimum; VIDEO ONLY —
   audio is #325's research, do not improvise sound.
4. **Discipline**: it's a plugin-shaped feature (the Vue lesson: core
   untouched polarity — removing it leaves no dangling references);
   frame-rate bounded and paced by the render loop's real capabilities;
   both scales irrelevant here but pane-resize mid-animation must not
   crash or smear.

## Acceptance

PTY drives: cube/scene animates with zero blank-frame flashes (frame
capture), pane resize mid-animation clean, video plays a bundled tiny
sample fixture (generate one deterministically — no binary blobs in
git unless tiny and licensed), ffmpeg-absent path shows the loud
notice, feature-removed polarity leaves core clean.
