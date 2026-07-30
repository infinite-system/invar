# READY — #350 (nicer generated sample video)

The demo "Sample Video" no longer shows the ffmpeg `testsrc2` test pattern. It
now shows a morphing Mandelbrot set.

One line of real change, in
[src/modules/media/FfmpegVideoSource.ts](../../../../src/modules/media/FfmpegVideoSource.ts):

```
mandelbrot=size=<W>x<H>:rate=<R>:maxiter=150:start_scale=1.4:end_scale=1.4:morphamp=0.3
```

## The chosen source, and why

`mandelbrot` exists in stock ffmpeg since version 2.x, so it is present in the
user's ffmpeg 6.1.1 and in every 4.x and 5.x build. It needs no extra library.

The picture holds its scale. `start_scale` and `end_scale` are equal, so the
view never zooms. What moves is the morph (`morphamp=0.3` with the default
morph frequencies), which slowly bends the shape of the set. This was the
decisive property, and it is a measured one, not a taste:

- Every ZOOMING variant dies. The stock `mandelbrot` defaults zoom until the
  detail is finer than one pane pixel. After about four minutes the pane shows
  coloured confetti
  ([candidate-b-mandelbrot-default-deep-zoom-81x26.png](frames-350/candidate-b-mandelbrot-default-deep-zoom-81x26.png)).
  A shallow zoom does not save it; it ends on a flat green field
  ([candidate-shallow-zoom-runs-out-81x26.png](frames-350/candidate-shallow-zoom-runs-out-81x26.png)).
- The morphing variant looks the same after ten minutes as after one second:
  [early](frames-350/chosen-morphing-mandelbrot-81x26-early.png) against
  [after 600 seconds](frames-350/chosen-morphing-mandelbrot-81x26-after-600-seconds.png).

`maxiter=150` is far below the stock 7189. A high iteration count paints
narrow colour bands that alias into speckle at pane resolution. 150 gives wide,
smooth bands that survive a pane of 81 by 26 pixels.

The picture is also good when the pane is large
([chosen-morphing-mandelbrot-118x72.png](frames-350/chosen-morphing-mandelbrot-118x72.png)),
so both ends of the pane scale were driven.

Cost is not a concern: 45 frames at 240 by 140 pixels render in 45 ms with one
thread.

### The candidates, at the real pane size

Every frame below is 81 by 26 pixels, the size of the video in a media pane
inside a 120-column terminal. Each PNG is magnified eight times with
nearest-neighbour, so one block is one pane pixel. They live in
[frames-350](frames-350).

| candidate | frame | verdict |
|---|---|---|
| `testsrc2` (before) | [candidate-a-testsrc2-81x26.png](frames-350/candidate-a-testsrc2-81x26.png) | Colour bars and a timecode. The thing the user called ugly. |
| `mandelbrot` stock | [candidate-b-mandelbrot-default-81x26.png](frames-350/candidate-b-mandelbrot-default-81x26.png) | Beautiful early, dead late. See the deep-zoom frame above. |
| `life` with colour | [candidate-c-life-81x26.png](frames-350/candidate-c-life-81x26.png) | Reads as red and green noise on black at this size. No shape. |
| `gradients` stock | [candidate-d-gradients-81x26.png](frames-350/candidate-d-gradients-81x26.png) | Washed-out pastel. Almost no picture at all. |
| `gradients` plus `hue` | [candidate-e-gradients-hue-81x26.png](frames-350/candidate-e-gradients-hue-81x26.png) | One flat colour that slowly changes. Boring. |
| `gradients` radial, three stops | [candidate-f-gradients-radial-81x26.png](frames-350/candidate-f-gradients-radial-81x26.png) | Pleasant, but it is one soft blob that barely moves. |
| `color` plus `geq` plasma | [candidate-g-plasma-geq-81x26.png](frames-350/candidate-g-plasma-geq-81x26.png) | Bright and lively, but it is a screensaver blur with no structure, and it costs a long expression per pixel. |
| `mandelbrot` plus `hue` | [candidate-i-mandelbrot-zoom-hue-81x26.png](frames-350/candidate-i-mandelbrot-zoom-hue-81x26.png) | The hue rotation makes the palette muddy yellow-green. Worse than plain. |
| `cellauto` | none | Rejected on compatibility: `random_fill` does not exist in ffmpeg 6.1.1, which is the version the user runs. |
| **chosen: morphing `mandelbrot`** | [chosen-morphing-mandelbrot-81x26-early.png](frames-350/chosen-morphing-mandelbrot-81x26-early.png) | Large readable shapes, strong colour, constant slow motion, and it never runs out of picture. |

### Captured from the running app, not from a file

The two frames below were rebuilt from the terminal cells of the real app,
driven in a pseudo terminal. Each painted cell carries two pixels: the upper
half block colour is the top pixel and the cell background is the bottom one.

- before: [pane-capture-baseline-testsrc2-82x26.png](frames-350/pane-capture-baseline-testsrc2-82x26.png)
- after: [pane-capture-chosen-82x26.png](frames-350/pane-capture-chosen-82x26.png)

## The pane label

Unchanged: the pane still reads `Sample Video`. The command that opens it is
"Media: Play Generated Sample Video". Renaming only the pane would split that
vocabulary in two for no gain, and the record and the smoke both name the pane
by that text. The brief allowed the rename but did not require it.

## How this was driven

1. Reproduced first. `bun run drive --geometry 120x40` with the command
   palette opened the sample video and painted `testsrc2`.
2. Rendered ten candidates at both pane sizes with
   [candidate-350-render-sample-frames.ts](candidate-350-render-sample-frames.ts)
   and judged them by eye.
3. Changed the source, then drove again with
   [probe-350-capture-sample-video-pane.ts](probe-350-capture-sample-video-pane.ts),
   which opens the pane in the real app and writes the painted picture as a
   PNG. Its later captures wait for a share of the cells to change colour, so
   the wait observes motion instead of counting time.
4. [probe-350-read-one-sample-frame.ts](probe-350-read-one-sample-frame.ts)
   reads frames through the real `FfmpegVideoSource` and its named pipe. It
   separates a decode fault from a paint fault, which is how the odd-width
   defect in the bycatch section was located.

Note on the drive vocabulary: `--wait-for-status mediaDecodedFrameCount=2`
is a flaky condition, because the counter can pass 2 between two polls. It
timed out on the UNCHANGED code as well, so it is not a regression from this
task. The probes above wait on the painted grid instead.

## Smoke status

`bun scripts/harness/smoke-media-harness.ts` — PASS, exit 0, `== harness
media: ALL PASS ==`.

The fake ffmpeg inside
[scripts/harness/smoke-media-harness.ts](../../../../scripts/harness/smoke-media-harness.ts)
used to select its source argument by the prefix `testsrc2=`. It now takes the
argument after `-i`, the same way ffmpeg does. The size parse is unchanged and
still matches, because the new filter string keeps `size=<W>x<H>`.

Positive controls, both run:

- The new source assertion goes red on a planted zoom. With `end_scale=0.3`
  against `start_scale=1.4`: `error: expect(received).toBe(expected) /
  Expected: 1.4 / Received: 0.3`. The plant was removed.
- The fake ffmpeg parse still fails loudly.
  [control-350-fake-ffmpeg-parse.ts](control-350-fake-ffmpeg-parse.ts) lifts
  the python text out of the smoke and runs it twice: a good source writes
  whole 128-byte frames; a source with no `size=` exits 2.

## Verification pass

| step | result |
|---|---|
| `bun test src/modules/media/` | 13 pass, 0 fail |
| `bun scripts/harness/smoke-media-harness.ts` | exit 0, ALL PASS |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | 1217 annotations resolved, 0 problems |
| `bun run typecheck` | exit 0, no errors |

Gate verdict chain: recorded at the end of this report, from the commit hook.

## Invariants answered

Record by record, from
[src/modules/media/media.invariants.md](../../../../src/modules/media/media.invariants.md):

- **Missing ffmpeg is loud and harmless** — UPHELD. The record was the one the
  brief named. Nothing in the executable check, the notice path, or the
  audio-disabling arguments moved. The smoke arm "missing ffmpeg stays in the
  live pane with a visible explanation" passes, and `-an` is still asserted by
  the unit contract. The new source is still generated, so no media blob was
  committed.
- **A streaming producer can outrun the display** — UPHELD. The change is one
  argument to the same ffmpeg process. Reading stays pull-paced through the
  same named pipe.
- **Video decoding never exceeds the showing and decoding frames** — UPHELD.
  The smoke asserts `mediaResidentVideoBufferCount === 2` on the real path
  after the change.
- **Playback memory is independent of duration** — UPHELD. The smoke memory
  arm passes with its planted 300-frame retention leak still failing.
- **Animation reuses one fixed framebuffer working set** — UPHELD. Geometry
  handling is untouched; the working set was 16848 bytes before and after at
  the same pane size.
- **Animated media is a removable runtime plugin** — UPHELD. No new import and
  no new composition edge.

Records this list missed: none inside `src/modules/media/`. One record is
arguably OWED and does not exist, so it is reported rather than written (see
bycatch): the promise that the generated sample never runs out of picture is
now carried only by a unit assertion and a comment.

## Bycatch

1. **Runtime defect — the sample video is sheared and slides at odd pane
   widths.** SEEN, reproduced three times, NOT FIXED (it is not local: the fix
   has to reach `MediaPaneContent` and `VideoFrameStream`, not only the
   argument vector).
   ffmpeg rounds a lavfi frame size DOWN to even in both axes. A pane 81 cells
   wide asks for `size=81x26` and gets an 80-pixel-wide stream:
   `ffmpeg -f lavfi -i testsrc2=size=81x26 -pix_fmt rgba -f rawvideo -` writes
   8320 bytes per frame, while `81*26*4` is 8424. `83x26` writes 8528 bytes,
   which is `82*26*4`. `size=81x27` also writes the 26-row frame.
   `FfmpegVideoSource.readFrameInto` fills a buffer of the requested size, so
   every frame it reads is 104 bytes further out of step. The picture shears
   and drifts.
   Reproduction: `bun .invar/tasks/in-progress/350-nicer-generated-sample-video/probe-350-capture-sample-video-pane.ts out.png 1 0.35 120 40`
   (a 120-column terminal gives an 81-cell pane). The sheared frame is
   [bycatch-odd-width-shear-81x26.png](frames-350/bycatch-odd-width-shear-81x26.png);
   the same drive at 121 columns, which gives an 82-cell pane, is straight:
   [pane-capture-baseline-testsrc2-82x26.png](frames-350/pane-capture-baseline-testsrc2-82x26.png).
   This is pre-existing, and it is very likely part of what the user saw as
   ugly. It hides better on the new source, because a shear is hard to see on a
   fractal and obvious on a timecode, so it should still be fixed.

2. **Contract-layer gap — no record covers the frame geometry agreement.**
   [src/modules/media/media.invariants.md](../../../../src/modules/media/media.invariants.md) records how many frames are
   resident and how memory behaves, but nothing records that the producer's
   frame size and the consumer's buffer size must agree, which is exactly the
   defect above. A record there would make defect 1 impossible instead of
   invisible. Not authored here; it is a design decision.

3. **Nonsense — `mediaScene="cube"` is published while the pane shows video.**
   Seen in every drive of the video pane, including at the moment `mediaMode`
   is `"video"`. The key names a 3D demo scene that is not running. Suspect a
   default that is published unconditionally rather than per mode. Not chased.

4. **Comment drift — the fake ffmpeg header in the media smoke.** Its header
   says it "emits deterministic raw RGBA frames"; it also implements the
   `-y` overwrite refusal from #336 (video playback ffmpeg overwrite flag),
   which the header never mentions. Small, and left alone because the file is
   an instrument another task owns.

## Files changed

- [src/modules/media/FfmpegVideoSource.ts](../../../../src/modules/media/FfmpegVideoSource.ts)
  — the sample source, with the reason in a comment.
- [src/modules/media/FfmpegVideoSource.test.ts](../../../../src/modules/media/FfmpegVideoSource.test.ts)
  — the source name assertion now reads the argument after `-i`; a second
  assertion locks the non-zooming property.
- [scripts/harness/smoke-media-harness.ts](../../../../scripts/harness/smoke-media-harness.ts)
  — the fake ffmpeg reads the source after `-i` instead of matching a source
  name.
- This task folder: three scripts and
  [frames-350](frames-350) (16 PNG files, 176 KB in total).
