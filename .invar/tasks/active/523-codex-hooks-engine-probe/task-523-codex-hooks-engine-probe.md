# 523 — codex hooks engine probe

Priority: architecture-hygiene
State: ACTIVE
Engine: claude
Environment: linux
Model: fable-5
Effort: medium

## In plain words

Codex has a hooks engine we do not use. If a post-compact hook works, it
can replace our usage-differencing compaction detection with a direct
signal. Probe it the way #517 probed notify.

## Evidence (from #517 bycatch, 2026-08-06)

- `codex features list` shows `hooks stable true`. The binary carries a
  `hooks.json` config with `pre_compact` / `post_compact` /
  `session_start` / `session_end` events and Claude-style hook semantics.
- Payload shape and registration path are unverified.

## Outline

Register each hook in a scratch codex session; capture real payloads;
prove pre/post_compact fire around a forced compaction. If solid, propose
replacing #517's usage-collapse differencing with post_compact and the
opening task-file send with session_start. Keep #517's notify path as the
fallback until the hooks path is proven in a real lane.
