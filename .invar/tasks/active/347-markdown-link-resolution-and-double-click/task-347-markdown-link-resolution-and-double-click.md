# #347 — markdown links: red misresolution investigated; double-click opens

State: ACTIVE
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## The request (user, 2026-07-30)

1. In markdown preview, links do not always resolve — different links in
   task reports/briefs render red (unresolved). Investigate why, fix.
2. Double-click on a link OPENS it — full mouse navigation, no keyboard
   needed.

## Rival hypotheses for the red links (rank, separate, do not assume)

a. Relative-base defect: task reports/briefs live deep
   (.invar/tasks/<state>/<n>-<slug>/) and use ../../../../-style relative
   links; preview may resolve against the workspace root or the wrong base
   directory instead of the FILE's directory.
b. Anchor links: links carrying #fragment (contract records, lattice style)
   may fail existence checks even when the file resolves.
c. Encoding: paths with URL-encoded characters (%2F appears in persisted
   pane ids; spaces in names) may not decode before the existence check.
d. State-move rot: links written while a task folder was in active/ break
   after the git mv to in-progress/completed — the red is TRUE and the
   defect is the lint/move tooling, not the preview. (land.sh already
   refreshes moved links — check coverage.)

Reproduce by DRIVING: open real red-link cases from completed task folders,
list which links are red and why, THEN classify. The red styling itself is
correct behavior for a truly-missing target — only fix resolution defects.

## Double-click open

- Route through the existing mouse pipeline (one handler path per event; hit
  tester shares the preview's row/geometry model).
- Target behavior: repo-relative file link opens the file in the editor
  (anchor scrolls to heading if present); external URL uses the existing
  open mechanism if one exists, else report what is missing.
- Single click stays as today (selection/caret); only double-click opens.
