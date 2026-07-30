# #366 — a manual frame-dump run overwrites the tracked frame fixture

State: ACTIVE
Priority: architecture-hygiene
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Bycatch from #90 (census finding 1, static)

.gitignore ignores artifacts/*.json then re-admits !artifacts/frame.json;
Bootstrap defaults the frame path there. TUI_FRAME_DUMP=1 bun run
src/main.ts in a checkout silently overwrites the tracked fixture. Gate
paths are safe (PtyTestDriver strips the variables; tmux ring passes
per-session paths).

## Work

Decide: should the fixture be tracked at all? If yes, default manual dumps
to an untracked path; if no, untrack it and regenerate where needed.
