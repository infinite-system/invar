# 213 — drive's default key completion waits for a frame after a quit key

State: ACTIVE
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: flake-evidence

## Outline

Bycatch from #202 (one sighting, not reproduced on retry).
`bun run drive --size 100000 --key Control+q` made Invar exit cleanly (app exit
code 0), but the drive front door itself then exited 1 because its default key
completion waited for a post-quit frame — a frame the app, having quit, can
never paint.

This is the unreachable-wait class (a wait must be a condition the preceding
action can make true) applied to the drive tool itself: a key whose effect is
process exit cannot be confirmed by a repaint. The fix direction from #204's
step model: completion for a quit-class key should observe process exit, not a
frame. Same family as #187's wheel-at-clamp (the action forecloses the observed
effect).

One sighting only — reproduce first (`--key Control+q` at a few sizes) before
changing the tool; if it will not reproduce, record the attempt and park.

## Sources

- `/tmp/202-tab-reactivation-rereads-whole-file-READY.md` — Bycatch section
  (copied into `.invar/tasks/completed/202-.../` at #202's landing).
