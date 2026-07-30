# #336 — video playback dies: ffmpeg refuses to overwrite the fifo (missing -y)

State: IN-PROGRESS
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## The defect (user-reported, conductor-reproduced 2026-07-30)

"Media: Play Generated Sample Video" paints "ffmpeg stopped before it produced
a complete video frame" with a real ffmpeg (6.1.1-3ubuntu5, /usr/bin/ffmpeg).

Root cause, proven: `FfmpegVideoSource` pre-creates the named pipe
(`mkfifo`), then spawns ffmpeg with `sampleArgumentVector`, which has no `-y`.
ffmpeg sees the existing output path, prompts "Overwrite? [y/N]" on a closed
stdin (`stdin: 'ignore'`), answers itself N, and exits 0 before writing a
byte. `readFrameInto` then sees EAGAIN + exited subprocess and returns false.

## Evidence (probes in this folder)

- `probe-336-app-path-video-frames.ts` — drives the real
  `FfmpegVideoSource.Class` at 120x48: FAILED at frame 0 (reproduces the
  notice). Run: `bun <probe>` from repo root.
- `probe-336-ffmpeg-stderr-fifo.sh` — same argument vector against a fifo
  with stderr captured: "File '...video.rgba' already exists. Overwrite?
  [y/N] Not overwriting - exiting." With `-y` added (sed variant), ffmpeg
  streams indefinitely. Stdout generation (no fifo) always worked: 3 frames =
  49152 bytes.

## Why the gate missed it

The media smoke's fake-ffmpeg does not model overwrite-refusal semantics, and
the CI host had no real ffmpeg until tonight. Both #324 polarities (fake pipe
drive, absent-ffmpeg degradation) were green while the real-ffmpeg path was
broken. This is the fixture-blind-spot family.

## The fix

1. Add `-y` to `sampleArgumentVector` (one flag).
2. Teach fake-ffmpeg the overwrite-refusal semantics: refuse an existing
   output path unless `-y` is present, mirroring real ffmpeg. Then the
   existing pipe-drive smoke arm would have caught this red. Positive
   control: remove `-y`, watch the smoke fail, restore.
3. Re-run the app-path probe: 10 complete frames expected.
