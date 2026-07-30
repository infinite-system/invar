# Brief #336 round 1 — video playback: ffmpeg overwrite flag

Read [AGENTS.md](../../../../AGENTS.md) fully before any work. Load
[.claude/skills/ibr/IBR.md](../../../../.claude/skills/ibr/IBR.md).

The task file in this folder has the reproduced root cause and two runnable
probes. The diagnosis is already proven. Your job is the fix, the fixture
hardening, and the ratchet.

1. Reproduce first: `bun .invar/tasks/in-progress/336-video-playback-ffmpeg-overwrite-flag/probe-336-app-path-video-frames.ts`
   from your worktree root (real ffmpeg is now at /usr/bin/ffmpeg). Expect
   FAILED at frame 0.
2. Add `-y` to `sampleArgumentVector` in
   [src/modules/media/FfmpegVideoSource.ts](../../../../src/modules/media/FfmpegVideoSource.ts).
   Re-run the probe. Expect 10 complete frames.
3. Harden the fixture: the fake-ffmpeg used by
   [scripts/harness/smoke-media-harness.ts](../../../../scripts/harness/smoke-media-harness.ts)
   must model overwrite refusal — an existing output path without `-y` makes
   it print the real refusal line to stderr and exit without writing. This is
   the arm that would have caught the defect.
4. Positive control, required in the report: with the fixture hardened,
   remove `-y` from the argument vector, run the media smoke, QUOTE the red.
   Restore `-y`, run once more, green. Both runs quoted.
5. Drive the real app path once in your PTY: open the pane via the palette
   command (Media: Play Generated Sample Video) and confirm frames paint
   with the real ffmpeg. State what you observed.
6. One verification pass at the end: media smoke +
   `bunx tsc --noEmit; echo TSC=$?` +
   `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`.

Do not run scripts/merge-gate.sh. Commit in your worktree. Do not push,
merge, or tag. Write your READY report as `report-336-<slug>.md` (this
task's slug) in this folder. END STATE: that report file exists here.

## Invariants in scope

- "Missing ffmpeg is loud and harmless" —
  [src/modules/media/media.invariants.md](../../../../src/modules/media/media.invariants.md).
  This defect is its sibling gap: PRESENT ffmpeg was silent and broken. Check
  whether the record (or a new one) should cover the present-but-refusing
  path. Propose, do not author unilaterally, if it needs a new record.
- "A streaming producer can outrun the display" — same contract. Your change
  touches the producer spawn; confirm the backpressure mechanism is
  untouched.
- Report record by record: upheld, violated, or needs refinement. Name any
  record this list MISSED.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s bycatch taxonomy. Include a
`## Bycatch` section even when it reads "None observed". While you are in
the media module: the user also reports the 3D demo not working in his real
terminal while the harness demo arms pass. Do NOT fix that here. If you see
anything in the demo path that could explain a real-terminal-only failure
(capability tier, tick wiring), it is bycatch gold — name it.
