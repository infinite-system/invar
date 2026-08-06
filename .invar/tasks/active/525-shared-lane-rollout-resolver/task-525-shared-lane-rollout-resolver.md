# 525 — shared lane rollout resolver

Priority: architecture-hygiene
State: ACTIVE
Engine: claude
Environment: linux
Model: fable-5
Effort: low

## In plain words

Two fleet scripts each carry their own copy of the same search: find a
lane's codex session record by scanning recent rollout files for the
worktree path. Distill one shared resolver both call.

## Evidence (from #517 bycatch, 2026-08-06)

- `steer.sh` and `fleet-watch.sh` both grep the newest 40 rollout heads
  for the cwd (`find_session_record`, duplicated logic).
- The #517 notify payload proves the thread-id -> rollout-filename
  identity, which a shared resolver can use directly.

## Outline

Extract one resolver (thread-id first, cwd-scan fallback) into a shared
fleet support file; both scripts call it; #524's fix becomes a third
caller. Self-test with a planted rollout fixture, both polarities.
