# Brief #336 round 2 — merge main and re-gate the combined tree

Main moved past your base while you worked: #335 landed (359ca6da), changing
scripts/harness/smoke-scrollbars-harness.ts, scripts/harness/smoke-terminal-harness.ts,
and scripts/tasks/tasks-status.ts. Disjoint from your files, but your green
was earned on a tree that no longer exists.

1. In your worktree: `git merge main`. Expect a clean merge (disjoint files).
   If any conflict appears, classify every difference against the merge BASE
   and report before resolving anything nontrivial.
2. Commit the merge. The commit hook runs the full gate on the combined tree.
3. Report the new verdict: append to your READY report a "## Merge round"
   section with the merge commit hash and the hook's GATE_EXIT line quoted.

END STATE: the report file in this folder is newer than this brief's filing
stamp and contains the merge commit hash plus the quoted gate verdict.

## Invariants in scope

Same set as round 1, unchanged by the merge: the media contract records you
already reviewed. Re-verify only if the merge touches media files (it should
not). Report "unchanged from round 1" if so.

## Bycatch expected

Report per the round-1 taxonomy. Include the section even if "None observed".
