# Task #439 — notice persistence and restored-state panel defects

Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
State: COMPLETED — ed401644 — Cascade cause found: folderOpen before restore; fixed by ordering. Notices non-persistent + legacy sanitization; Displaced suppressed for redeclared labels; my two probe findings refuted (pre-satisfied toggle). Landed over pre-existing #436 red.

## What

Cluster on the panel restore / task-notice seam, found while chasing a
user report (closing "Displaced: Claude" removes the two neighbor task
terminals and shows Database inside the Terminal space). Conductor
findings, driven with a copy of the user's real
~/.config/invar/settings.json (2026-08-01):

1. The task notice is PERSISTED as a terminal: panelWorkspaceStates
   saves `task:...:2:notice` with kind "terminal", label
   "Displaced: Claude". Notices derive from configuration at folder
   open; persisting them resurrects a closed notice on every boot.
2. Restored state auto-closes the pinned instances list about 1.5 s
   after it opens. Fresh state keeps it pinned.
3. The Displaced list row's hover-revealed close control is unreliable
   in restored state: inert in some runs, working in others.
4. The user's reported cascade did not reproduce in four conductor
   attempts, but it lives on this same close/restore path.

## Evidence

Probe: probe-439-close-displaced-notice.ts (in this folder; run with
PROBE_COPY_REAL_SETTINGS=1 to copy the user's live settings into the
probe home). Conductor transcripts 2026-08-01 morning.
