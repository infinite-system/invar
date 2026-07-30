# READY — supersampled graphics-tier demo resolution (#339)

State: READY

Branch: `fleet/339-demo-supersampled-graphics-tier-resolution`

Base: `0773a4b8cc0e5dff153cee38a3a6dd37f56147a1`

Commits:

- `6ff8ea1168195ef8859b7005f1db29e1479b8866` — Render the 3D demo at 8x graphics resolution (#339)
- `5fe4ccd75d72216011a3f0c18a351485c6c7fd0c` — Keep the media smoke outside the removable plugin build (#339)
- `7da49fdf2bda1473c59a33300989e01b69262aaa` — Keep demo tier sync inside projection state (#339)

Task: [supersampled graphics-tier demo resolution](task-339-demo-supersampled-graphics-tier-resolution.md)

Brief: [round 1 brief](brief-339-2-demo-supersampled-graphics-tier-resolution.md)

## Result

The 3D demo now renders at 8× supersampling on kitty and sixel tiers.
The source raster uses 8 pixels per column and 16 pixels per row.
This preserves the existing 1×2 half-block aspect ratio.

The half-block path still uses one pixel per column and two pixels per row.
The same half-block scene, projection, and byte shape remain in place.

[CellFramebuffer](../../../worktrees/339-demo-supersampled-graphics-tier-resolution/src/modules/media/CellFramebuffer.ts)
accepts a supersampling scale.
[MediaPaneContent](../../../worktrees/339-demo-supersampled-graphics-tier-resolution/src/modules/media/MediaPaneContent.ts)
selects scale 8 only when the existing image encoder seam returns a pixel encoder.
It returns to scale 1 for the half-block floor.

The framebuffer reallocates only when pane geometry or projection tier changes.
Frames at a fixed geometry and tier reuse the same RGBA and depth arrays.

## Measurement

The task-local
[measurement instrument](../../../worktrees/339-demo-supersampled-graphics-tier-resolution/.invar/tasks/in-progress/339-demo-supersampled-graphics-tier-resolution/339-software-scene-resolution-measurement.ts)
measured a 100×24-cell pane.
Each row contains 20 frames after five warmup frames.
The current 15 FPS frame budget is 66.667 ms.

| Scene | Scale | Source pixels | Pixel count | Mean ms | Median ms | p95 ms | Max ms | Fits 15 FPS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Cube | cell | 100×48 | 4,800 | 0.502 | 0.432 | 0.759 | 0.893 | yes |
| Cube | 2× | 200×96 | 19,200 | 1.454 | 1.510 | 1.570 | 1.602 | yes |
| Cube | 4× | 400×192 | 76,800 | 5.557 | 5.819 | 6.036 | 6.049 | yes |
| Cube | 8× | 800×384 | 307,200 | 22.295 | 23.076 | 25.002 | 26.649 | yes |
| Torus | cell | 100×48 | 4,800 | 0.600 | 0.446 | 0.867 | 0.881 | yes |
| Torus | 2× | 200×96 | 19,200 | 1.618 | 1.628 | 1.671 | 1.683 | yes |
| Torus | 4× | 400×192 | 76,800 | 6.150 | 6.185 | 6.245 | 6.264 | yes |
| Torus | 8× | 800×384 | 307,200 | 24.107 | 23.795 | 27.770 | 28.833 | yes |

Both scenes sustain 8× within the current budget.
The default is therefore 8× for both cube and torus.
No per-scene branch is needed.

The instrument is listed in
[project tools](../../../worktrees/339-demo-supersampled-graphics-tier-resolution/project.tools.md).

## Driven evidence

The
[media PTY smoke](../../../worktrees/339-demo-supersampled-graphics-tier-resolution/scripts/harness/smoke-media-harness.ts)
drives the real app.

- The 61×9 half-block arm supplied 61×18 pixels.
- The small kitty arm supplied 488×144 pixels for 61×9 cells.
- The large kitty arm supplied 968×144 pixels for 121×9 cells.
- The small kitty framebuffer used one fixed 562,176-byte working set.
- The 96×36, 8× memory path used one fixed 3,538,944-byte working set.
- The 15-frame and 150-frame runs reported managed growth of 0 and 0 bytes.
- The large half-block run kept generation 4 and 17,424 working-set bytes.

The final smoke ended with `ALL PASS`.
The video, missing-ffmpeg, pause, scene, ASCII, and Unicode arms also passed.

## Positive controls

I planted production scale 4 while the smoke required scale 8.
The kitty arm failed with:

```text
Timed out waiting for output condition: the kitty encoder receives the supersampled demo dimensions
```

I removed the plant and reran the arm.
It passed at 488×144 and 968×144 pixels.

The memory control retained 30 copied 8× frames.
It failed with:

```text
media memory grew with duration: short=0 managed bytes, long=53084398 managed bytes,
excess=53084398, envelope=4194304, workingSet=3538944/3538944
```

The normal 15-frame and 150-frame runs stayed flat.

## Verification

- `bun scripts/harness/smoke-media-harness.ts` — `ALL PASS`
- `bunx tsc --noEmit; echo TSC=$?` — `TSC=0`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — 1,211 annotations, 223 lattice links, 0 problems
- `bash scripts/conventions-gate.sh` — PASS, with three reported legacy `vue` grammar findings
- Final-commit removal build — `REMOVAL_TSC=0`
- Worktree after commits — clean

The removal build used final commit
`7da49fdf2bda1473c59a33300989e01b69262aaa`.
It removed `src/modules/media/` and both `MediaPlugin` manifest lines in a detached scratch worktree.
It then ran `bunx tsc --noEmit`.

The first removal attempt found a static test-tool import of the removable module.
The harness now loads its optional smoke subject only when the smoke runs.
The repeated removal build passed.

## Invariant review

| Record | Verdict | Evidence |
| --- | --- | --- |
| Animation reuses one fixed framebuffer working set | Needs refinement | Fixed geometry and tier reuse one set. A tier change replaces the raster set once. |
| Playback memory is independent of duration | Upheld | The 15-frame and 150-frame 8× runs kept 3,538,944 bytes and 0/0 managed growth. |
| Animated media is a removable runtime plugin | Upheld | The final-commit removal build returned `REMOVAL_TSC=0`. |
| The #324 no-capability-detection-in-media rule | Upheld | `PaneRenderContext.graphicsTier` flows through `ImageRenderers.encoderFor`. Media performs no detection. |
| A pixel tier places and deletes graphics explicitly | Needs refinement | Animated frames change the placement key once per presented frame. The record says “never per frame.” |
| Cost tracks the actively observed set | Upheld | The 8× constant scales only with the live pane area. It does not scale with duration or document size. |
| Data flows one way | Upheld | Tier sync changes projection backing only. It does not assign the active scene during paint. |
| Seams are drawn at the shared generator | Upheld | Kitty and sixel still use `ImageRenderers` and `PixelImageMount`. |

The brief missed the image pixel-placement record and three project records.
Those project records are `Cost tracks the actively observed set`, `Data flows one way`, and
`Seams are drawn at the shared generator`.

I propose two contract refinements.
Do not apply them as part of this task.

1. Refine the framebuffer condition to “unchanged pane geometry and projection tier.”
   State that either change replaces one fixed working set.
2. Refine the pixel-placement record for animated sources.
   An unchanged frame must not emit again.
   A newly presented animation frame changes the placement key and emits once.

The #324 capability rule has no record in
[the media contract](../../../worktrees/339-demo-supersampled-graphics-tier-resolution/src/modules/media/media.invariants.md).
That is a contract-layer gap.

## Bycatch

- The automatic pre-commit hook ran the forbidden full merge gate.
  Its plugin-manifest structure-outline drive timed out twice.
  The first and retry logs are
  [attempt 1](/tmp/merge-gate-failures.3937812/behavioral-contracts-felt-invariants-.attempt1.log)
  and [attempt 2](/tmp/merge-gate-failures.3937812/behavioral-contracts-felt-invariants-.log).
  I did not fix this unrelated smoke.
- The invariant checker skipped two ignored Bun cache files over 2 MB.
  It reported `artifacts/home/.cache/bun/@t@/bea620923fa09dd0.pile` and
  `artifacts/home/.cache/bun/@t@/ec49c70a3f7e4fb8.pile`.
  The note reproduced on two checker runs.
- The #324 capability-routing rule exists in task history but not in the media contract.
  The implementation follows it, but a cold contract-only review cannot discover it.
- The image pixel-placement record says “never per frame.”
  Animated media uses the same mount and must emit each newly presented frame.
  The record needs the refinement proposed above.

## User check

The harness proves the encoder input resolution.
It cannot prove visible sharpness in the user’s Ghostty session through cmux.
The remaining check is to open the 3D demo there and compare the graphics tier with half-block.

No push, merge, or tag was performed.
