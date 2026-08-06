# 519 — terminal toggle gesture flake

Priority: flake-evidence
State: ACTIVE
Engine: claude
Environment: linux
Model: fable-5
Effort: medium

## In plain words

One time, pressing Control+J did not reopen the terminal panel. The same
press worked on retry and in a long protocol run. We must find out if this
is a real timing defect or a one-off.

## Evidence (from #513 builder bycatch, 2026-08-06)

- Sequence: close Settings, open project.conventions.md, press Control+J in
  the first 10-line drive. The terminal did not reopen once.
- The immediate retry passed. The full 100,000-line protocol passed.
- Not reproduced a second time. One occurrence only.

## Outline

Drive the exact sequence in a loop (50+ iterations) with graph waits, on a
cold-boot app each time. If it reproduces: bisect the focus/keybinding
routing after dialog close. If it never reproduces: record the census and
retire with evidence. Check the neighboring surface: keybinding routing
right after a dialog closes (focus restoration window).
