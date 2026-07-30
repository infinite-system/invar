# #350 — the generated sample video becomes something worth watching

State: COMPLETED — 4017f53c — morphing mandelbrot sample video; landed over proven pre-existing reds (#359/#360/#337)
Priority: user-directed
Engine: claude
Environment: linux
Model: opus-5
Effort: medium

## The request (user, 2026-07-30)

The sample video works now (post #336) but it is ffmpeg's testsrc2 test
pattern. Try a better one.

## The shape

- Same pipeline, same fifo, same rawvideo rgba output — only the lavfi
  source changes in FfmpegVideoSource.sampleArgumentVector.
- Candidates to TRY BY DRIVING (pick the best-looking at pane resolution
  and 15fps, subjective call goes to the report with a frame capture each):
  `mandelbrot` (zooming fractal), `life` (cellular automaton with color),
  `gradients` (animated smooth gradients), or a short filter chain (e.g.
  gradients + hue rotation). Mind CPU: the source runs inside ffmpeg, cheap.
- Keep compatibility: the chosen source must exist in stock ffmpeg 6.x
  (the user runs 6.1.1). Guard: if the source name is unavailable, ffmpeg
  exits — the existing "stopped before a complete frame" notice covers it,
  but prefer a source present since ffmpeg 4.
- Fake-ffmpeg smoke is source-agnostic (it parses size= from the filter
  string) — confirm it still matches, adjust the parse if the new filter
  string shapes differently.
- The label "Sample Video" may deserve the source's name (builder taste).
