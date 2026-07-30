# READY — harness and tooling integrity bundle

All three tasks are complete in separate commits. The final #314 commit passed
the enforcing hook with `GATE_EXIT=0`. The worktree is clean.

## #292 — Drive action status waits for paint

Task: [#292 (Drive action status waits for paint)](../../active/292-drive-action-status-waits-for-paint/task-292-drive-action-status-waits-for-paint.md).

Commit: `35027e0bf6725b6f799b1213d259bf8eb9031853`

[Drive](../../../../scripts/harness/Drive.ts) now waits for a changed painted
screen after an action reaches its requested status. The wait uses the
pre-action frame baseline. It does not use a fixed frame number or a wider
timeout.

[Drive.test.ts](../../../../scripts/harness/Drive.test.ts) holds the settings
paint after `settingsOpen=true` publishes. The test proves that the action does
not complete and that its next click target is still absent.

Positive control:

- RED: I temporarily removed the screen-change wait. The focused test failed at
  `holds status completion until the action paints its click target`. It
  expected `screenChangeWaitStarted` to be true and received false. The run had
  11 passes and 1 failure.

- GREEN: I restored the wait. `bun test scripts/harness/Drive.test.ts` had 12
  passes, 0 failures, and 34 expectations.

Real PTY evidence:

- `bun run drive --key 'Control+,' --wait-for-status 'settingsOpen=true'`
  opened and painted Settings.

- The same action passed with `--size 100000`.

The intermittent race did not reproduce in the live baseline. The held-paint
test reproduced its exact ordering.

No [#214 (panel chrome agent close intermittent)](../../active/214-panel-chrome-agent-close-intermittent/task-214-panel-chrome-agent-close-intermittent.md)
census class should retire from this change. #292 changes Drive action waits.
The #214 family records registered smoke waits and pool starvation.

## #297 — dispatch task-pointer links survive the worktree root

Task: [#297 (dispatch TASK.md links survive the worktree root)](../../active/297-dispatch-taskmd-links-break-from-root/task-297-dispatch-taskmd-links-break-from-root.md).

Commit: `aca2f6139d9a059ad46d11c16fc7eade69387345`

[dispatch.sh](../../../../scripts/fleet/dispatch.sh) now keeps the filed brief
in its task folder. It writes a root-relative worktree task pointer.
The pointer includes `#invariants-in-scope`. Dispatch link-lints the pointer
from the worktree root. The dry run computes and prints the same target without
leaving its brief snapshot behind.

Positive control:

- RED: a dry-run brief with a link to a deliberately absent record exited 2.
  It reported a dead relative Markdown link and
  `dispatch: REFUSING — the brief has dead or bare document references`.

- GREEN: the #314 dry run exited 0. It printed the next #314 filed brief
  sequence with `#invariants-in-scope` as the exact task pointer.

`bash -n scripts/fleet/dispatch.sh` and `git diff --check` also passed.

## #314 — harness drives isolate workspace task configuration

Task: [#314 (harness drives isolate workspace task configuration)](../../active/314-harness-drives-must-isolate-workspace-task-config/task-314-harness-drives-must-isolate-workspace-task-config.md).

Commit: `d371e80578e26f2a6e7edec01648344b58d5f301`

The structural audit used
[`ast-query.ts`](../../../../scripts/ast-query.ts) against
[`scripts/harness`](../../../../scripts/harness). Two registered PTY smokes
open the repository as their workspace:

- [horizontal extent](../../../../scripts/harness/smoke-horizontal-extent-harness.ts)

- [SDK extraction](../../../../scripts/harness/smoke-sdk-extraction-harness.ts)

The other registered PTY smokes use fixture roots. Three task-focused fixture
smokes must launch folder-open tasks, so they explicitly opt in:

- [tasks](../../../../scripts/harness/smoke-tasks-harness.ts)

- [reserved chord](../../../../scripts/harness/smoke-reserved-chord-harness.ts)

- [workspace tabs](../../../../scripts/harness/smoke-workspace-tabs-harness.ts)

[PtyTestDriver](../../../../scripts/harness/PtyTestDriver.ts) now suppresses
all folder-open task launch by default. [Bootstrap](../../../../src/modules/app/Bootstrap.ts)
passes that test setting into [Tasks](../../../../src/modules/tasks/Tasks.ts).
Task resolution, status, and manual commands remain available. Drive also
keeps the built-in task suppressed.

Positive controls:

- RED, real PTY: I planted a repository
  `.invar/tasks.json` with the marker `HARNESS_TASK_CONFIG_CONTROL_LAUNCHED`.
  `bun scripts/harness/smoke-horizontal-extent-harness.ts` timed out while
  looking for `vertical scrolling reveals contract shape: dims plus rgba`.
  Its final grid showed the planted task terminal and marker.

- RED, unit: I temporarily bypassed the new Tasks suppression branch.
  `bun test src/modules/tasks/Tasks.test.ts --test-name-pattern 'unrelated
  harness keeps configured tasks inert'` failed because
  `folderOpenCalls` contained `Repository Task` instead of remaining empty.

- GREEN, real repository drive: `bun run drive --open .` reported the planted
  label in `taskConfiguredLabels`, an empty `taskLaunchedLabels`, no task panel,
  and no marker.

- GREEN, original failure site:
  `bun scripts/harness/smoke-horizontal-extent-harness.ts` ended
  `ALL-PASS`.

- GREEN, legitimate task path:
  `bun scripts/harness/smoke-tasks-harness.ts` ended `ALL-PASS` and observed
  its `.vscode`, `.invar`, unsupported-input, built-in, and agent-pane cases.

- GREEN, scale parity: `bun run drive --size 10` and
  `bun run drive --size 100000` both painted their fixtures and reported empty
  `taskLaunchedLabels`.

The planted repository task file was gitignored. I removed it after the gate.

## Final gate

I merged the repaired `main` as
`34ceddd903bb97b551acda7dd795af18e8c0929c`. The merge had no conflicts. The
three metadata files that blocked the first attempt now end with a newline.

The normal `git commit -m 'isolate harness folder-open tasks for #314'`
started the enforcing hook. No skip flag was used.

The following checks passed:

- conventions, TypeScript, and the full Prettier check

- invariant structure and references

- coverage and reactive-observation checks

- all unit tests

- all 63 parallel registered PTY smokes

- all three serial checks, including behavioral contracts

- the five-session input-byte ordering check

The planted task positive control ran across all registered smokes during the
first full hook attempt. All 62 smokes in that revision passed. Only the
unrelated metadata format check blocked that attempt. The repaired final hook
then passed the updated 63-smoke registry from `main`.

The final gate reported no retry-assisted pass:

```text
merge-gate: ALL-PASS
GATE_EXIT=0
pre-commit: merge-gate GREEN — commit allowed.
```

The hook created commit
`d371e80578e26f2a6e7edec01648344b58d5f301`. `git status --short` produced no
output after the commit.

## Bycatch

- Contract-layer gap: [`scripts/fleet`](../../../../scripts/fleet) has no
  fleet invariant record. Dispatch has durable guard behavior in shell and
  prose, but no domain invariant record unifies it.

- Document drift:
  [project.fleet-operations.md](../../../../project.fleet-operations.md)
  still says dispatch writes records under `agent-dispatches/` and copies the
  full brief into the worktree task pointer.
  [dispatch.sh](../../../../scripts/fleet/dispatch.sh) now uses
  `.invar/tasks/in-progress/` and writes a root-relative pointer.

- FIXED OUTSIDE THIS BRANCH: commit `e7fc088e` removed the final newline from
  three metadata files. The conductor repaired and swept the metadata on
  `main`. Merge `34ceddd903bb97b551acda7dd795af18e8c0929c` brought that repair into
  this branch.

- The final input-byte check measured p50 `7.078 ms` against its report-only
  warning line of `6.406 ms`. All five ordering sessions passed. The gate
  classified the timing result as non-blocking.
