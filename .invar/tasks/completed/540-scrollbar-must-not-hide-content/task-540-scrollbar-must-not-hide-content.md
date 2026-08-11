# 540 — scrollbar must not hide content

Priority: user-directed
State: COMPLETED — 2080aa1a — The scrollbar reserves its own row — the last visible line is always readable; user ruling implemented and harvested into ui-design chapter 5.
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## In plain words

The horizontal scrollbar paints over the last visible line's text while
its line number still shows, so the user cannot read that line. The user
ruled: the last row must stay readable. Give the bar its own space.

## Evidence

- #531 (completed) found the mechanism while killing the gate flake; the
  frozen frame is preserved in its task folder
  (evidence-531-gate-539-r2-contention-scrollbars.log.txt).
- User ruling 2026-08-11: "of course it has to be readable."
