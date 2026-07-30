# READY — terminal 3D demo and video playback (#324)

State: READY

Branch: `fleet/324-terminal-3d-demo-and-video-playback`

Commit: `f22342357e88090e23a87286bd2cbdf75b255639`

Enforcing hook: `GATE_EXIT=0`

Git status: clean. `git status --porcelain=v1` returned no output.

Task:
[terminal 3D demo and video playback (#324)](task-324-terminal-3d-demo-and-video-playback.md)

Brief:
[terminal 3D demo and video playback brief](brief-324-1-terminal-3d-demo-and-video-playback.md)

## Result

Invar now has a removable Animated Media plugin.
The command palette opens a shaded rotating cube, a lit raymarched torus, or a generated sample
video.
The demo alternates between the cube and torus every five seconds.
The user can also select either scene.
Space pauses and resumes both animation and video.

The
[media contract](../../../worktrees/324-terminal-3d-demo-and-video-playback/src/modules/media/media.invariants.md)
states the flyweight, lightest-streaming, memory-flatness, plugin-removal, and missing-ffmpeg rules.
No terminal module changed.

## Renderer and capability routing

The
[cell framebuffer](../../../worktrees/324-terminal-3d-demo-and-video-playback/src/modules/media/CellFramebuffer.ts)
owns one RGBA array and one depth array.
It writes truecolor upper-half cells as the universal fallback.
The
[software scene](../../../worktrees/324-terminal-3d-demo-and-video-playback/src/modules/media/SoftwareScene.ts)
writes the cube and torus into those same arrays.

The media pane uses the existing
[image renderer selector](../../../worktrees/324-terminal-3d-demo-and-video-playback/src/modules/image/ImageRenderers.ts)
and
[pixel image mount](../../../worktrees/324-terminal-3d-demo-and-video-playback/src/modules/image/PixelImageMount.ts).
It does not detect terminal capabilities.
The host resolves the existing image graphics tier once and passes it through the generic
[pane render context](../../../worktrees/324-terminal-3d-demo-and-video-playback/src/modules/ui/PaneContent.interface.ts).

The structural census returned:

```text
TerminalCapabilities identifiers in src/modules/media: 0
ImageRenderers identifiers in src/modules/media: 2
PixelImageMount identifiers in src/modules/media: 3
MediaPlugin identifiers in src: 3
  DefaultPlugins import
  DefaultPlugins construction
  MediaPlugin namespace
```

Kitty and sixel payloads use the existing image encoders.
The plugin wraps its out-of-band payload in DEC 2026 synchronized-output markers.
The ordinary OpenTUI frame supplies the same boundary for half-block cells.

## Rendering invariant evidence

### Flyweight

The driven small animation captured four completed painted frames with changing color fingerprints.
The resize and large-geometry arm captured 75 consecutive completed frames.
No captured media frame had zero colored cells.

At fixed large geometry, the longest animation kept framebuffer generation `4` and a working set of
`17,424` bytes.
The measured 30-frame and 300-frame runs both kept a `55,296`-byte working set.
Their managed-memory growth was `0` and `423` bytes after collection.

The framebuffer unit contract also rendered 200 frames with the same RGBA and depth identities.
Only resize replaced the two arrays.

### Lightest streaming

The
[ffmpeg source](../../../worktrees/324-terminal-3d-demo-and-video-playback/src/modules/media/FfmpegVideoSource.ts)
creates a named pipe.
It reads that pipe directly into the reusable decode array.
There is no application-side stdout chunk or decoded-frame queue.
The pipe applies operating-system backpressure when the render loop does not pull.

The
[video frame stream](../../../worktrees/324-terminal-3d-demo-and-video-playback/src/modules/media/VideoFrameStream.ts)
owns exactly two RGBA arrays.
One array is shown and one array is decoded.
One pull can be active.
A later target overwrites skipped frames in the decode array and then swaps the two references.
The driven video status reported `mediaResidentVideoBufferCount=2`.

The deterministic sample uses ffmpeg `testsrc2`, raw RGBA output, and `-an`.
The repository contains no media binary and no audio path.

### Memory flatness

The longest driven animation runs the same memory assertion as the direct probe.
The real 30-frame and 300-frame paths stayed green.

The final-code positive control retained 300 frame copies.
It failed red with this exact result:

```text
media memory grew with duration:
short=0 managed bytes
long=8295899 managed bytes
excess=8295899
envelope=4194304
workingSet=55296/55296
```

The continuity positive control also planted a blank completed frame.
The smoke rejected it before it trusted the real capture.

## Acceptance drives

The
[animated-media PTY smoke](../../../worktrees/324-terminal-3d-demo-and-video-playback/scripts/harness/smoke-media-harness.ts)
drives the real application.
It is part of the merge gate.

- At `100x30`, the cube painted truecolor half-block cells and changed across completed frames.
- At `160x50`, resize replaced one working set, animation continued, and 75 completed frames stayed
  painted.
- The automatic scene reached the torus interval.
- The `t` scene key selected the torus.
- Space paused and resumed the demo.
- A deterministic fake ffmpeg executable proved the present pipe path.
  The sample video painted cells, paused, resumed, and kept exactly two resident frame buffers.
- An isolated path with no ffmpeg painted `VIDEO UNAVAILABLE` and
  `ffmpeg was not found on PATH`.
  It allocated zero video frame buffers.
- Forced kitty mode emitted a synchronized kitty transmit payload.
- Unicode chrome used `×`.
  ASCII chrome used `x`.
- Every application session quit cleanly.

## Plugin removal

The
[media plugin](../../../worktrees/324-terminal-3d-demo-and-video-playback/src/modules/media/MediaPlugin.ts)
owns its commands, keybindings, panes, timers, pixel placements, status fields, and ffmpeg process.
Disable removes them together.

The structural census found the only host references to `MediaPlugin` in
[DefaultPlugins](../../../worktrees/324-terminal-3d-demo-and-video-playback/src/modules/plugins/DefaultPlugins.ts).
The media package contains no direct `TerminalCapabilities` reference.

The removal build copied the checkout to a bounded temporary directory.
It removed the media package, its smoke, and the two composition entries.
It then returned:

```text
bunx tsc --noEmit
exit 0

bun run build
bundle 402 modules
compile dist/iv
exit 0
```

The temporary removal checkout and removed package were deleted after the proof.

## Verification

The final commit ran the full enforcing hook.
It returned:

```text
conventions-gate                         OK
prettier format check                   OK
invariant contracts --all               OK
invariant contracts --refs              OK
unit tests                              OK
binary build                            OK
animated-media harness                  OK
panel-chrome harness                    OK
behavioral-contracts                    OK
GATE_EXIT=0
```

The final parallel pool recorded one unrelated starvation timeout in the git-watch smoke.
Its built-in quiet retry passed.
The gate named the retry and still returned `GATE_EXIT=0`.

## Commit

`f22342357e88090e23a87286bd2cbdf75b255639`
— `feat: add terminal 3D demo and video playback (#324)`

## Bycatch

- [AppStatusProjection](../../../worktrees/324-terminal-3d-demo-and-video-playback/src/modules/app/AppStatusProjection.ts) publishes generic bottom
  panel state under `terminalVisible`, `terminalFocused`, `terminalColumns`, and `terminalRows`.
  Open the 3D Demo at `100x30`.
  The active content is `media-demo`, but the terminal fields report `true`, `true`, `61`, and `9`.
  This reproduced in two independent drives.
  Its “Bottom panel / terminal state” comment has the same drift.
  This task did not change that projection.
- The final six-worker gate run saw one starvation timeout in the unrelated git-watch smoke.
  Its quiet retry passed.
