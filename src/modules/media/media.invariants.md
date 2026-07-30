# Animated media — Invariants

Load-bearing rules for `src/modules/media/`. The module contributes a removable pane runtime for
software-rendered 3D scenes and silent sample-video playback. It stands on
`project.invariants.md`, the image capability ladder in
`src/modules/image/image.invariants.md`, and the pane-runtime contract in
`src/modules/ui/ui.invariants.md`.

## Reality-based invariants

### A streaming producer can outrun the display

**Invariant:** If ffmpeg decodes frames faster than the terminal can show them, then an unbounded
reader accumulates frames until memory or latency grows with playback duration.

**Scope:** Silent raw-video output from ffmpeg and the media pane frame handoff.

**Mechanism:** A pipe can hold unread bytes, while application queues can retain decoded frames after
their presentation time. Reading only on display demand applies pipe backpressure. Reusing one decode
buffer and one display buffer prevents application-side accumulation.

**Generates:** Pull-paced decode; a two-frame application working set; dropped frames overwritten in
the decode buffer instead of appended to a queue.

**Evidence:** `src/modules/media/VideoFrameStream.test.ts`;
`scripts/harness/smoke-media-harness.ts`.

**Impossible if true:** A decoded-frame queue whose depth grows while the renderer is slow; playback
latency or application memory that grows with elapsed duration.

**Verification:** `bun test src/modules/media/VideoFrameStream.test.ts && bun
scripts/harness/smoke-media-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-29

## Chosen invariants

### Animation reuses one fixed framebuffer working set

**Invariant:** If an animation advances at unchanged geometry, then its frame, depth, scanline, cell,
and decode backing buffers keep stable identity and size. Per-frame work stays bounded by the pane
area, and garbage-collected heap after a long run does not exceed the short-run envelope.

**Scope:** `CellFramebuffer`, `SoftwareScene`, `MediaPaneContent`, and the half-block projection.
Protocol payload strings and immutable `StyledText` values are bounded transient output, not backing
buffers.

**Mechanism:** Geometry changes allocate the working set once. Every later scene step clears and
writes the same typed arrays. The half-block projection reads those arrays directly. Video swaps two
preallocated RGBA arrays instead of constructing frame objects.

**Generates:** Constant allocation counts at fixed geometry; stable buffer identities across frames;
zero retained per-frame heap growth; resize that replaces one working set without retaining the old
one.

**Rejected alternatives:** Allocate a new RGBA or depth array per frame. Garbage collection can hide
the leak briefly, but allocation pressure and retained references then scale with frame count.

**Evidence:** `src/modules/media/CellFramebuffer.test.ts`;
`src/modules/media/SoftwareScene.test.ts`;
`scripts/harness/smoke-media-harness.ts`.

**Impossible if true:** A fixed-size animation whose backing-buffer allocation count grows with frame
count; a retained frame list; a long-run post-collection heap that grows in proportion to rendered
frames.

**Verification:** `bun test src/modules/media/CellFramebuffer.test.ts
src/modules/media/SoftwareScene.test.ts && bun scripts/harness/smoke-media-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-29

### Video decoding never exceeds the showing and decoding frames

**Invariant:** If video playback is active, then application memory holds at most one frame being
shown and one frame being decoded. The render cadence pulls the next frame. An in-flight pull blocks
another pull, and skipped presentation times overwrite the decode buffer instead of entering a queue.

**Scope:** `VideoFrameStream` and the video mode in `MediaPaneContent`. Kernel pipe storage belongs to
the operating system and remains bounded by pipe backpressure.

**Mechanism:** `VideoFrameStream` owns two fixed RGBA arrays. `FfmpegVideoSource` reads a named pipe
directly into the decode array, so no application-side stdout chunk adds a third raster buffer.
`pullFrame` has one in-flight promise, reads exact frame-sized records, overwrites the decode array
for skipped indices, then swaps the two array references. It does not read again until the pane asks
after presentation.

**Generates:** A double-buffer ceiling; pipe backpressure; deterministic frame dropping; no read-ahead
task and no decoded-frame queue.

**Rejected alternatives:** Decode continuously into a list and let the renderer catch up. That turns
slower display into both memory growth and increasing latency.

**Evidence:** `src/modules/media/VideoFrameStream.test.ts` records maximum resident buffer count,
overlapping-pull rejection, and overwrite-based frame skipping.

**Impossible if true:** Three application-owned decoded frames; two concurrent pipe reads; a dropped
frame remaining reachable after the next display swap.

**Verification:** `bun test src/modules/media/VideoFrameStream.test.ts`.

**Status:** provisional

**Last refined:** 2026-07-29

### Playback memory is independent of duration

**Invariant:** If geometry and source format stay fixed, then playback duration does not increase the
media working set. A run ten times longer retains the same two frame buffers and the same measured
post-collection heap envelope.

**Scope:** The longest driven animation and video playback at fixed geometry.

**Mechanism:** The real path stores scalar counters and two frame arrays only. The contract measures
short and ten-times-long runs after forced collection. Its positive control retains copied frames in
a list and must exceed the same envelope.

**Generates:** A duration-independent memory assertion that fails red on frame retention; long
animation drive evidence that combines visible progress with a flat working set.

**Rejected alternatives:** Inspect the code for a queue. A retained closure or diagnostic history can
leak frames without looking like a queue.

**Evidence:** `scripts/harness/smoke-media-harness.ts` measures the real fixed-buffer path and runs the
same assertion against retained frame copies as its positive control.

**Impossible if true:** A ten-times-longer fixed-geometry playback retaining ten times more frame
memory; a planted frame-retention list passing the contract.

**Verification:** `bun scripts/harness/smoke-media-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-29

### Animated media is a removable runtime plugin

**Invariant:** If the media contribution is disabled or removed, then its commands, status keys,
timers, pixel placements, ffmpeg process, and panes disappear together. The host retains no media
type, construction path, or fallback state.

**Scope:** `MediaPlugin`, `DefaultPlugins`, the generic `PaneRuntime` and `PaneContent` ports, and the
plugin-removal build.

**Mechanism:** `MediaPlugin` registers one runtime, commands, keybindings, and status projection
through `ApplicationContributionContext`. It tracks every pane it creates and releases them before it
withdraws the runtime. The only composition-edge reference is the default-plugin manifest.

**Generates:** Command-palette entry and Add-menu discovery when installed; a clean host build after
the module and its manifest entry are removed; no hidden animation after uninstall.

**Rejected alternatives:** Add a media branch to `Bootstrap` or `RootView`. That makes the host name a
plugin and leaves cleanup decisions behind after removal.

**Evidence:** `src/modules/media/MediaPlugin.test.ts`;
`scripts/harness/smoke-media-harness.ts`; the removal build recorded in the task report.

**Impossible if true:** A host file importing a media class; a disabled media pane still rendering;
media status keys surviving uninstall; deleting the module leaving a TypeScript error outside the
default manifest.

**Verification:** `bun test src/modules/media/MediaPlugin.test.ts && bun
scripts/harness/smoke-media-harness.ts`; copy the checkout, remove `src/modules/media/` and its two
default-manifest lines, then run `bunx tsc --noEmit`.

**Status:** provisional

**Last refined:** 2026-07-29

### Missing ffmpeg is loud and harmless

**Invariant:** If ffmpeg is absent or exits before a complete video frame, then the media pane stays
alive and shows an explicit playback-unavailable notice. It never shows a blank pane or crashes the
app.

**Scope:** Video mode in `MediaPlugin`, `MediaPaneContent`, and `VideoFrameStream`.

**Mechanism:** The plugin checks the executable through an overridable seam before construction.
Absent and failed streams become a visible notice stored by the pane. Demo mode remains available.

**Generates:** Both ffmpeg-present and ffmpeg-absent controls; a deterministic generated sample with
no committed media blob; video-only ffmpeg arguments with audio disabled.

**Evidence:** `src/modules/media/MediaPlugin.test.ts`;
`src/modules/media/VideoFrameStream.test.ts`;
`scripts/harness/smoke-media-harness.ts`.

**Impossible if true:** Selecting sample video with no ffmpeg producing an empty pane; an ffmpeg
failure escaping the pane; an audio stream or committed binary sample being required.

**Verification:** `bun test src/modules/media/MediaPlugin.test.ts
src/modules/media/VideoFrameStream.test.ts && bun scripts/harness/smoke-media-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-29
