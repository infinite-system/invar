# READY — FfmpegVideoSource publishes a raw anchor (#451)

## In plain words

The ffmpeg video source had shared helper functions, but it did not use the wrapper that makes those functions work correctly for child classes. I added that wrapper at the class anchor. Video playback, animation, and missing-ffmpeg behavior still work.

## Result

Commit: `a80c75c0` (`fix: anchor ffmpeg video source statics`)

I chose the anchor rung from the [task brief](brief-451-1-ffmpeg-source-publishes-raw-anchor.md). Deletion was not valid:

- `locate` has two structural occurrences: its declaration and one external read in [MediaPlugin.ts](../../../../src/modules/media/MediaPlugin.ts).
- `sampleArgumentVector` has four structural occurrences: its declaration, one instance-body read, and two external test reads in [FfmpegVideoSource.test.ts](../../../../src/modules/media/FfmpegVideoSource.test.ts).

[FfmpegVideoSource.ts](../../../../src/modules/media/FfmpegVideoSource.ts) now imports `Static` from `ivue/extras` and publishes `Static($FfmpegVideoSource)` at `$Class`. `Class` still selects that anchor. No runtime path or recipe changed.

The fixed `sampleArgumentVector` recipe remains one allowlisted instance read. The static-read census stayed at 16 instance reads and 0 static-body reads. The [static-read allowlist](../../../../scripts/static-self-read-allowlist.txt) still matches exactly, so I did not change its ffmpeg row.

I did not add a subclass knob test. The keep decision comes from external static method reads. Neither retained member is a live static getter knob.

## Invariants

- [Public classes use the namespace pattern](../../../../project.invariants.md#public-classes-use-the-namespace-pattern): strengthened. The live violation was real. A statics-bearing public class had a raw anchor. The anchor now uses `Static($FfmpegVideoSource)`.
- [Live static reads follow the receiving class](../../../../project.invariants.md#live-static-reads-follow-the-receiving-class): upheld. The census reports 0 static-body self-reads. The one fixed sample-recipe read remains on its exact, reasoned allowlist row.
- [A streaming producer can outrun the display](../../../../src/modules/media/media.invariants.md#a-streaming-producer-can-outrun-the-display): upheld. The source still reads only on display demand.
- [Animation reuses one fixed framebuffer working set](../../../../src/modules/media/media.invariants.md#animation-reuses-one-fixed-framebuffer-working-set): upheld. The real harness kept the small and large working sets flat.
- [Video decoding never exceeds the showing and decoding frames](../../../../src/modules/media/media.invariants.md#video-decoding-never-exceeds-the-showing-and-decoding-frames): upheld. The generated-video drive retained exactly two buffers.
- [Playback memory is independent of duration](../../../../src/modules/media/media.invariants.md#playback-memory-is-independent-of-duration): upheld. The 15-frame and 150-frame paths had no managed growth, and the planted retention leak failed.
- [Animated media is a removable runtime plugin](../../../../src/modules/media/media.invariants.md#animated-media-is-a-removable-runtime-plugin): upheld. The edit does not change plugin composition or ownership.
- [Missing ffmpeg is loud and harmless](../../../../src/modules/media/media.invariants.md#missing-ffmpeg-is-loud-and-harmless): upheld. The driven missing-ffmpeg path kept the pane alive with a visible explanation and allocated no video buffers.

The brief named only the two project records. Path scope also implicates all six records in the colocated [media contract](../../../../src/modules/media/media.invariants.md). This report answers those records above.

## Verification

- `bun scripts/ast-query.ts static-self-read-census --allowlist scripts/static-self-read-allowlist.txt`: pass; 16 instance reads, 0 static-body reads, and no allowlist drift.
- `bun test`: pass; 2,308 tests across 349 files, 0 failures, and 71,924 expectations.
- `bunx tsc --noEmit`: pass.
- `bash scripts/conventions-gate.sh`: pass.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: pass; 1,339 annotations and 266 lattice links resolved, with 0 problems.
- `bun scripts/harness/smoke-media-harness.ts`: pass before and after the edit. The harness covered small and large animation frames, the generated ffmpeg sample, kitty and half-block graphics, memory controls, and missing ffmpeg. Its planted blank-frame and retention defects both failed as required.
- `git diff --check`: pass.
- Worktree after commit: clean.

## Bycatch

- Comment drift: the [task brief](brief-451-1-ffmpeg-source-publishes-raw-anchor.md) asks for `bun scripts/harness/smoke-animated-media-harness.ts`, but that file does not exist. The command failed with `Module not found`. `rg --files scripts/harness` confirmed that [smoke-media-harness.ts](../../../../scripts/harness/smoke-media-harness.ts) is the only media harness. I did not rerun the missing command because the file census is deterministic.
- Contract-map gap: the brief's invariant list omits the colocated [media contract](../../../../src/modules/media/media.invariants.md), although the task changes `src/modules/media/`. I reviewed all six media records and reported their verdicts above.
