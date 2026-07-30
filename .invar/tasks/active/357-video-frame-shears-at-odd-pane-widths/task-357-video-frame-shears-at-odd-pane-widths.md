# #357 — video frames shear and slide at odd pane widths

State: ACTIVE
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Bycatch from #350 (user-visible, reproduced 3x, builder evidence verbatim)

ffmpeg rounds a lavfi frame size DOWN to even in both axes. A pane 81
cells wide asks size=81x26 and gets an 80-pixel-wide stream: rawvideo
writes 8320 bytes/frame while 81*26*4=8424. size=83x26 writes 8528
(=82*26*4); size=81x27 also returns the 26-row frame.
FfmpegVideoSource.readFrameInto fills a buffer of the REQUESTED size, so
every frame drifts 104 bytes further out of step: the picture shears and
slides. Pre-existing (visible on testsrc2 too — very likely part of what
the user saw as ugly); the new mandelbrot source hides it better but it
is still wrong.

Reproduction (from the #350 completed folder after landing):
bun probe-350-capture-sample-video-pane.ts out.png 1 0.35 120 40
(120 columns gives an 81-cell pane). Sheared frame:
frames-350/bycatch-odd-width-shear-81x26.png; 121 columns (82 cells) is
straight.

## Work

Fix reaches MediaPaneContent and VideoFrameStream, not just the argument
vector (builder's locus analysis): the producer's actual frame geometry
and the consumer's buffer geometry must agree — either request even
dimensions and letterbox/center, or read the producer's true size.

## Contract owed (#350 bycatch item 2)

media.invariants.md records frame counts and memory but NOTHING records
producer/consumer frame-geometry agreement — exactly this defect class.
Author the record as part of the fix (design decision in the report).
