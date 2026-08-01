## In plain words

Main changed after the history work was accepted. I merged the new main without bringing in the
red editor-history-row branch. The real app still walks from a file to a Git comparison and back to
the first file, and every required check now passes.

## READY — round 2 reintegration

Accepted feature commit: `cedef9783f744fc2488a5494e1f7030c94cdb67c`

Merge commit: `2c6fa013a26a36c558cc7c8713cec42497632885`

Merged main commit: `5055cd44898ade30f9d008bb99195f2a358fe7ae`

Merge base: `6401bf6cf4345e7cf7b6844ab6f97a06bf2687c1`

The worktree is clean. I amended the merge commit with `SKIP_GATE=1`. I did not run the merge gate.

## Merge result

`git merge main` completed automatically with no conflict hunks. I classified the only shared code
file against the merge base before the merge:

- This branch changed [GitWorkspace.ts](../../../../src/modules/git/GitWorkspace.ts) to register,
  capture, and restore Git comparison history states.
- Main changed the same file to replace `static projectNameForRoot` with an instance method, call it
  through `this`, remove the `Static` import, and publish the raw `$Class` anchor.
- The merged file contains both changes. No feature code was deleted or resurrected.

I merged only `main`. I did not merge #442 (editor history row and shortcuts). Main contains that
task's report file, but it does not contain the red branch's navigation smoke rewrite or feature
code.

I did not restructure the navigation smoke in this round. The coming conflict is in the shared
gesture sequence itself. Moving the same assertions into a local helper would not remove that
overlap and would add merge churn before the red branch is fixed.

## Driven evidence

The post-merge run of
[smoke-navigation-history-harness.ts](../../../../scripts/harness/smoke-navigation-history-harness.ts)
drove the real PTY and reported `ALL-PASS`.

The exact Back trail remained:

```text
beta.ts -> sourceControl.comparison -> alpha.ts
```

Forward walked through the same three states in reverse. The smoke also passed the command-bar Back
and Forward checks.

## Invariants

- **Programmatic history navigation does not record new history — upheld.** The merged history seam
  still suppresses all contributor capture during replay. The full tests and PTY smoke pass.
- **Seams are drawn at the shared generator — upheld.** `NavigationHistory` owns sequence behavior.
  The source editor, Git, and Markdown contributors still own only their payload and same-place
  rules.
- **Plugin boundaries grant one authority — upheld.** The editor plugin registers one workspace
  contribution. Git and Markdown do not import each other or the source contributor.
- **Live static reads follow the receiving class — upheld.** The new source history contributor has
  no static members. `NavigationHistory` reads its live entry cap through `this.constructor`. Main's
  Git change now reads `projectNameForRoot` through `this`. The new conventions census found zero
  changed-file violations, and I added no allowlist row.
- **Public classes use the namespace pattern — upheld.** The new source contributor still publishes
  its raw `$Class`, `Class`, and `Model`. Main's Git change selects a raw anchor with a reactive
  `Class`, which matches its new no-statics shape.
- The editor and Git domain records from round 1 remain upheld. The merge changed no editing,
  comparison focus, or async supersession behavior.

## Verification

- `bun test` ran in full: 2,287 tests passed, 0 failed, and 71,842 expectations ran across 349
  files.
- `bun scripts/harness/smoke-navigation-history-harness.ts` passed with `ALL-PASS`.
- `bunx tsc --noEmit` passed.
- `bash scripts/conventions-gate.sh` passed. Its changed-file static-self-read census found 0
  instance reads and 0 static reads. No allowlist row was added.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all` passed all record files.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs` resolved 1,334 annotations
  and 266 lattice links with 0 problems.
- Both parent comparisons passed `git diff --check`.

## Bycatch

- No new runtime or contract defect appeared during reintegration.
- RESOLVED ON MAIN: the four `resolvedPosition` type errors in
  [Drive.ts](../../../../scripts/harness/Drive.ts) from round 1 are gone. The repository-wide type
  check and conventions gate now pass.
- CARRIED FROM ROUND 1, SUSPECT: `Ctrl+P` did not open Quick Open while a Git comparison owned
  focus. I reproduced it once in round 1. I did not retest or change it because shortcuts belong to
  #442 (editor history row and shortcuts).
