# Brief #322 follow-up — merge main and re-gate the combined tree

Your READY report is received and reviewed. Good work: the seam fix,
both positive controls, and the contract answers all hold. One step
remains before landing.

Main moved while you worked: #323 (quit confirmation dialog) landed and
touched three of your files (AppStatusProjection.ts, its test, and
smoke-overlay-dialog-harness.ts). Your green gate ran on a tree without
those changes, so it does not cover the combined tree.

The conductor started `git merge main` in your worktree. It stopped on
one conflict: `src/modules/app/AppStatusProjection.test.ts`.

## Work

1. Classify every difference against the merge BASE
   (`git merge-base HEAD MERGE_HEAD` before you resolve), never
   ours-vs-theirs alone: "we added it" and "they deleted it" look
   identical without the base. Keep BOTH sides' assertions — #323 added
   quit-confirmation status fields; you changed surface-truth fields.
   They are disjoint concerns in one file.
2. Resolve, then run the focused test file, then commit the merge.
3. Re-run your one verification pass on the COMBINED tree (the enforcing
   commit hook on the merge commit is exactly that). GATE_EXIT=0
   required.
4. Update your report in place is NOT allowed — append a new section
   `## Round 2 — combined-tree merge` to the report file with the merge
   commit hash and the new GATE_EXIT line.

## Invariants in scope

Same three records as your round-1 answers; re-affirm they hold on the
combined tree in the new report section.

## Bycatch expected

Same standing order as round 1. New section may read "None observed".

## End state (mechanically checkable)

The report file contains a `## Round 2 — combined-tree merge` section
naming a merge commit whose hook printed GATE_EXIT=0, and the worktree
is clean.
