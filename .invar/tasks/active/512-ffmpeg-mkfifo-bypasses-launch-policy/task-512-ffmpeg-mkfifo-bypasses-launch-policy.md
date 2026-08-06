# Task 512 — FfmpegVideoSource mkfifo bypasses the launch policy

Priority: verification-integrity
Engine: claude
Environment: linux
Model: fable-5
Effort: low
State: ACTIVE

## In plain words

FfmpegVideoSource.ts calls Bun.spawnSync(['mkfifo', ...]) directly,
bypassing the "External tools share one launch policy" record
(system.invariants.md). Route it through Processes; check the record
verdict honestly (a VIOLATION today — the fix makes it upheld).
Found by #509's bycatch (2026-08-05); predates that task.
