# #378 — task records cite builder worktree paths that die at landing

State: ACTIVE
Priority: architecture-hygiene
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Bycatch from #347 (census, reproduced twice)

15 dead links across task records; 11 point into
.invar/worktrees/<slug>/... — removed when the task lands, dead exactly
when the citation matters. Examples: report-284:85, report-312:41,44,
report-339:63,168, report-308:21,30.

## Work

1. lint-task-links.ts refuses worktree-path citations at write time
   (ends the class).
2. Sweep and repair the 15 existing dead links (repo-relative targets).
3. Decide the lint-vs-app authority question: the lint reports 26 "moved"
   links the preview resolves fine through TaskStatePath — align the lint
   with TaskStatePath or state why stricter is right.
