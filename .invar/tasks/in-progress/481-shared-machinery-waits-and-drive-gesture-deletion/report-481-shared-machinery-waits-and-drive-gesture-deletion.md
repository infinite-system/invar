## In plain words

The brief asks for five Quick Open test fixes that are already in `main`. I checked the six sites and drove all five tests again. The fixes still work, but one unrelated full-suite test hit its existing 5,000 ms timeout.

## Result

NO-CHANGE FINDING at `3083c9f70986a1b8f7be3d8a5a2b5ed16fa50a7b`.

The [filed round brief](brief-481-1-shared-machinery-waits-and-drive-gesture-deletion.md) assigns the same six Quick Open sites that task #480 (migrate the Quick Open idiom) already landed. The implementation commit is `ad6d50383d84292427a1fca33070038ddbd297c0`. Merge commit `04ea99abffcb4487b526989ce8d1642600c51db5` brought it into `main` before this branch started.

I made no code change and created no commit. The worktree is clean.

The scoped behavior is complete. The required full test run is not green because `StartScript.test.ts` timed out once. This report does not claim a clean gate.

## Files done and remaining

| State | Files |
| --- | --- |
| Done before this task started | [smoke-bracket-match-harness.ts](../../../../scripts/harness/smoke-bracket-match-harness.ts): 1 site. [smoke-git-blame-harness.ts](../../../../scripts/harness/smoke-git-blame-harness.ts): 2 sites. [smoke-image-preview-harness.ts](../../../../scripts/harness/smoke-image-preview-harness.ts): 1 shared helper site across 4 queries. [smoke-breadcrumb-harness.ts](../../../../scripts/harness/smoke-breadcrumb-harness.ts): 1 site. [smoke-diagnostics-harness.ts](../../../../scripts/harness/smoke-diagnostics-harness.ts): 1 site across 2 server arms. |
| Remaining in the filed round brief | None. |
| Explicitly reserved by the filed round brief | [tui-harness.sh](../../../../scripts/tui-harness.sh), [HarnessSmoke.ts](../../../../scripts/harness/HarnessSmoke.ts), [PtyTestDriver.ts](../../../../scripts/harness/PtyTestDriver.ts), and [Drive.ts](../../../../scripts/harness/Drive.ts). The brief says not to touch them in this round. |

## Existing implementation

Each site waits for `quickOpen.query` to equal the typed text. It then waits for `quickOpen.matches.0.path` to equal the intended file before Enter.

The image-preview helper accepts the expected path separately from the query. Its four calls cover `picture.png`, `sample.ts`, `photo.jpg`, and `data.bin`.

The later screen and status assertions remain in place. The graph sequences each action. The screen or status still proves the result.

The prior [task #480 READY report](../../completed/480-migrate-the-quick-open-idiom/report-480-migrate-the-quick-open-idiom.md) records one red positive control in every touched smoke. All five controls exited 1 before the correct expectations passed. I did not repeat those source plants because this task changed no check.

## Driven proof

`bun run drive --key Control+p --wait-for-text 'Go to File'` drove the default app through the real PTY. The final frame painted the Quick Open dialog and `sample.ts`. The status projection published `quickOpenOpen=true`, `quickOpenMatches=1`, and `quickOpenSelectedIdentifier="sample.ts"`.

All five affected smokes passed on current `HEAD`. The breadcrumb smoke passed at 10 and 100,000 lines. The diagnostics smoke passed with `tsgo` and `typescript-language-server`.

## Coverage

[project.coverage-deltas.md](../../../../project.coverage-deltas.md) already declares the three measured decreases from task #480 (migrate the Quick Open idiom):

- Bracket match: assertions 6 → 6, waits 6 → 5.
- Git blame: assertions 7 → 7, waits 11 → 9.
- Image preview: assertions 11 → 11, waits 11 → 10.

This task changed no assertion or wait count. The coverage ratchet inspected 392 files and found no undeclared decrease against `a9700d9`.

## Invariants

Scope came from the five smoke paths and the `quickOpen` graph terms. It includes [harness.invariants.md](../../../../scripts/harness/harness.invariants.md), [system.invariants.md](../../../../src/modules/system/system.invariants.md), and [project.invariants.md](../../../../project.invariants.md).

| Invariant | Verdict | Evidence |
| --- | --- | --- |
| Harness waits observe conditions not frame ordinals | Upheld | Every converted site awaits the exact query and first path before Enter. All five smokes passed. |
| Every wait names itself | Upheld | Each graph wait names its full path and expected value. |
| Async-published state is always awaited | Upheld | `GraphClient.Class.awaitValue` parks each query at a frame-settle boundary. |
| The composition graph reaches every installed contributor | Upheld | The existing graph root resolves Quick Open state. This task adds no membership list. |
| Coverage may fall but never silently | Upheld | Exact declarations exist for all three measured decreases. The ratchet passed. |

The final checker found 0 problems. No invariant record changed.

## Verification

- [smoke-bracket-match-harness.ts](../../../../scripts/harness/smoke-bracket-match-harness.ts): ALL-PASS.
- [smoke-git-blame-harness.ts](../../../../scripts/harness/smoke-git-blame-harness.ts): ALL-PASS.
- [smoke-image-preview-harness.ts](../../../../scripts/harness/smoke-image-preview-harness.ts): ALL-PASS across four queries.
- [smoke-breadcrumb-harness.ts](../../../../scripts/harness/smoke-breadcrumb-harness.ts): ALL-PASS at 10 and 100,000 lines.
- [smoke-diagnostics-harness.ts](../../../../scripts/harness/smoke-diagnostics-harness.ts): ALL-PASS for both server arms.
- `bun test`: FAIL. 2,352 tests passed and 1 failed across 353 files. The run made 72,111 expectations. `src/modules/app/StartScript.test.ts` timed out after 5,000 ms.
- `bun test src/modules/app/StartScript.test.ts`: PASS in 376 ms. The timeout did not reproduce in the one focused classification run.
- `bunx tsc --noEmit`: PASS.
- `bash scripts/conventions-gate.sh`: PASS. It reported the existing 20 legacy grammar violations.
- `bun scripts/check-coverage-ratchet.ts`: PASS. It inspected 392 files and found no undeclared decrease against `a9700d9`.
- Invariant checker `--all`: PASS for every record.
- Invariant checker `--refs`: PASS. 1,372 annotations, 266 lattice links, 0 problems.

I did not rerun the full suite after its timeout. A retry could hide the wait defect. I did not run `scripts/merge-gate.sh` or `scripts/behavioral-contracts.sh`, as the brief requires.

## PTY usability

- Easy: one default `bun run drive` command showed the dialog, selected file, and published Quick Open state.
- Confusing: the filed brief describes task #480 work, while the task file and worktree name describe shared machinery and Drive deletion.
- Missing: none for the Quick Open scope.

## Bycatch

- Not fixed: the full `bun test` run timed out in `src/modules/app/StartScript.test.ts` after 5,000 ms. A focused run passed in 376 ms, so the timeout did not reproduce a second time. I did not widen or retry the wait.
- Conductor-map conflict, not fixed: the [task file](task-481-shared-machinery-waits-and-drive-gesture-deletion.md) assigns shared machinery and Drive gesture deletion. The [filed round brief](brief-481-1-shared-machinery-waits-and-drive-gesture-deletion.md) assigns the already-landed Quick Open migration and forbids shared-machinery edits. I followed the filed brief because [TASK.md](../../../worktrees/481-shared-machinery-waits-and-drive-gesture-deletion/TASK.md) makes it the operative brief.

No bycatch received a code change.
