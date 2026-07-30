# READY — #336 (video playback ffmpeg overwrite flag)

## Result

Generated sample video playback now works with a real ffmpeg and its pre-created named pipe.

[FfmpegVideoSource.ts](../../../../src/modules/media/FfmpegVideoSource.ts) now passes `-y` before
the input arguments. ffmpeg can open the existing pipe without an interactive overwrite refusal.

[smoke-media-harness.ts](../../../../scripts/harness/smoke-media-harness.ts) now models the real
refusal. Its fake ffmpeg exits without writing when the output exists and `-y` is absent.

The prescribed [app-path probe](probe-336-app-path-video-frames.ts) had a broken import and a stale
run command. I repaired both so the exact command in the
[brief](brief-336-2-video-playback-ffmpeg-overwrite-flag.md) runs from the repository root.

Commit: `cb26d74cb970123bf9bca7ade754aefd48dd52cc`

The worktree is clean.

## Reproduction and real drive

The prescribed probe first failed before it reached ffmpeg:

```text
error: Cannot find module '../src/modules/media/FfmpegVideoSource'
```

After the task-owned probe path was repaired, the unchanged application source reproduced the
reported defect:

```text
ffmpeg: /usr/bin/ffmpeg
FAILED at frame 0: readFrameInto returned false (this is the "ffmpeg stopped" path)
only 0 frames
```

After the fix, the same command read 10 complete 23,040-byte frames:

```text
frame 0 ok (23040 bytes)
...
frame 9 ok (23040 bytes)
APP PATH OK: 10 complete frames
```

I also drove the real app through the PTY media video arm with `/usr/bin/ffmpeg`. The arm opened
`Media: Play Generated Sample Video` through the command palette. The status reached video mode
with no notice and at least three decoded frames. The grid painted more than 100 truecolor
half-block cells. Playback paused, resumed with a higher decode count, and quit cleanly.

## Positive control

I hardened the fake ffmpeg, removed `-y`, and ran:

```text
INVAR_MEDIA_SMOKE_ARM=video bun scripts/harness/smoke-media-harness.ts
```

The fixture caught the planted defect and exited 1:

```text
== harness media: generated sample through pull-paced ffmpeg ==
error: Timed out waiting for the generated video decodes through the fake ffmpeg pipe
Bun v1.3.14 (Linux arm64)
```

I restored `-y`. The final full media smoke was green:

```text
== harness media: generated sample through pull-paced ffmpeg ==
  PASS  video playback owns exactly the showing and decoding buffers
  PASS  the pull-paced generated-video session quits cleanly
== harness media: ALL PASS ==
```

## Final verification

- `bun scripts/harness/smoke-media-harness.ts` exited 0 with `ALL PASS`.
- `bunx tsc --noEmit; echo TSC=$?` printed `TSC=0`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` exited 0.
  It resolved 1,210 annotations and 223 lattice links with 0 problems.

The commit hook started the repository merge gate automatically. I did not run
`scripts/merge-gate.sh`. The hook completed with `merge-gate: ALL-PASS`.

## Invariant review

The change implicates the complete
[media contract](../../../../src/modules/media/media.invariants.md) through its source and smoke
annotations.

| Record | Verdict | Evidence |
| --- | --- | --- |
| [A streaming producer can outrun the display](../../../../src/modules/media/media.invariants.md#a-streaming-producer-can-outrun-the-display) | Upheld | The change only alters spawn arguments. Pull-paced reads, pipe backpressure, and buffer reuse are unchanged. |
| [Animation reuses one fixed framebuffer working set](../../../../src/modules/media/media.invariants.md#animation-reuses-one-fixed-framebuffer-working-set) | Upheld | The final smoke passed small and large geometry. It kept generation 4 and 17,424 working bytes during the longest large animation. |
| [Video decoding never exceeds the showing and decoding frames](../../../../src/modules/media/media.invariants.md#video-decoding-never-exceeds-the-showing-and-decoding-frames) | Strengthened | The real pipe now opens. The fixture rejects the missing flag. The final drive still reported exactly two resident video buffers. |
| [Playback memory is independent of duration](../../../../src/modules/media/media.invariants.md#playback-memory-is-independent-of-duration) | Upheld | The 30-frame and 300-frame paths kept 55,296 working bytes. The planted 300-frame retention leak failed. |
| [Animated media is a removable runtime plugin](../../../../src/modules/media/media.invariants.md#animated-media-is-a-removable-runtime-plugin) | Untouched | No plugin registration, runtime, command, or disposal path changed. |
| [Missing ffmpeg is loud and harmless](../../../../src/modules/media/media.invariants.md#missing-ffmpeg-is-loud-and-harmless) | Strengthened | The missing arm stayed green. The fake present-but-refusing process now exercises the record's existing “exits before a complete video frame” scope. |

The brief missed `Video decoding never exceeds the showing and decoding frames`. The change touches
the producer spawn named by that record.

No contract edit is needed. `Missing ffmpeg is loud and harmless` already covers an executable that
exits before one complete frame. The gap was the ffmpeg-present fixture, not the record wording.

## Bycatch

- The automatic commit hook saw one starvation-class timeout in the scrollbar smoke. Its one quiet
  retry passed, so the failure did not reproduce on the second attempt.
- The reported real-terminal 3D demo failure did not reproduce in this harness. The half-block and
  kitty graphics arms both passed. I found no capability-tier or tick-wiring cause in the paths I
  inspected.
- The invariant checker printed pre-existing canonical-name and uncovered-record notes outside the
  media contract. It found 0 problems. I did not change those records.
