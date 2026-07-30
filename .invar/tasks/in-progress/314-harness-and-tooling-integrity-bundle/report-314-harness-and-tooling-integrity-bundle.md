# BLOCKED — harness and tooling integrity bundle

The implementation is complete, but this branch is not READY. The enforced
commit gate ended with `GATE_EXIT=1`. Its only failure was a pre-existing
Prettier error in three task metadata files owned by other builders. The hook
blocked the final #314 commit.

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

## #297 — dispatch TASK.md links survive the worktree root

Task: [#297 (dispatch TASK.md links survive the worktree root)](../../active/297-dispatch-taskmd-links-break-from-root/task-297-dispatch-taskmd-links-break-from-root.md).

Commit: `aca2f6139d9a059ad46d11c16fc7eade69387345`

[dispatch.sh](../../../../scripts/fleet/dispatch.sh) now keeps the filed brief
in its task folder. It writes a root-relative worktree pointer to `TASK.md`.
The pointer includes `#invariants-in-scope`. Dispatch link-lints the pointer
from the worktree root. The dry run computes and prints the same target without
leaving its brief snapshot behind.

Positive control:

- RED: a dry-run brief with `[Missing record](missing-record.md)` exited 2. It
  reported `dead relative Markdown link 'missing-record.md'` and
  `dispatch: REFUSING — the brief has dead or bare document references`.

- GREEN: the #314 dry run exited 0. It printed
  `.invar/tasks/in-progress/314-harness-and-tooling-integrity-bundle/brief-314-2-harness-and-tooling-integrity-bundle.md#invariants-in-scope`
  as the exact task pointer.

`bash -n scripts/fleet/dispatch.sh` and `git diff --check` also passed.

## #314 — harness drives isolate workspace task configuration

Task: [#314 (harness drives isolate workspace task configuration)](../../active/314-harness-drives-must-isolate-workspace-task-config/task-314-harness-drives-must-isolate-workspace-task-config.md).

Commit: blocked before creation. The complete change remains staged.

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

The normal `git commit -m 'isolate harness folder-open tasks for #314'`
started the enforcing hook. No skip flag was used. The planted repository task
was still present.

The following checks passed:

- conventions and TypeScript

- invariant structure and references

- coverage and reactive-observation checks

- all unit tests

- all 62 parallel registered PTY smokes, including both repository-root smokes
  and the three task opt-ins

- all three serial checks, including behavioral contracts

- the five-session input-byte ordering check

The gate reported no retry-assisted pass. It failed only at the full Prettier
check:

```text
[warn] .invar/tasks/in-progress/300-eight-ui-nitpicks-bundled/meta.json
[warn] .invar/tasks/in-progress/308-markdown-view-only-mode-persistent/meta.json
[warn] .invar/tasks/in-progress/312-vue-sfc-block-syntax-and-routing/meta.json
Code style issues found in 3 files.
GATE_EXIT=1
```

Each file matches this branch's `HEAD`. Each difference is only a missing final
newline. Commit `e7fc088e` introduced those three missing newlines while it
backfilled agent identity. They belong to other builders. I did not change
them, hide them from Prettier, or bypass the gate.

Required unblock: the conductor must repair or land those three metadata
newlines, then ask this builder to run the enforcing commit again. A green
`GATE_EXIT=0`, the final #314 commit hash, and a clean tree remain owed.

## Bycatch

- Contract-layer gap: [`scripts/fleet`](../../../../scripts/fleet) has no
  fleet invariant record. Dispatch has durable guard behavior in shell and
  prose, but no `<domain>.invariants.md` record unifies it.

- Document drift:
  [project.fleet-operations.md](../../../../project.fleet-operations.md)
  still says dispatch writes records under `agent-dispatches/` and copies the
  full brief into worktree `TASK.md`.
  [dispatch.sh](../../../../scripts/fleet/dispatch.sh) now uses
  `.invar/tasks/in-progress/` and writes a root-relative pointer.

- Gate blocker: commit `e7fc088e` removed the final newline from the three
  metadata files listed in the gate section. This made the full Prettier gate
  red before this task changed any code.
