# Task 508 — M1: a dropped file opens (local, bracketed paste)

Priority: user-directed
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
State: ACTIVE

## In plain words

Dropping a file onto the terminal pastes its path (bracketed). Enable
mode 2004 (OpenTUI parses but never enables — the known gap), detect
existing-path pastes, and route by kind: image/video -> media pane,
text -> buffer, directory -> open-as-workspace offer. The blessed
wave draft sits beside this file; M1 section governs. Outside-root
files: open read-only with a visible badge OR import — per the
draft's confined-root proposal; the record refinement is
propose-only.
