# READY — folder-open task launch hygiene

## Status

READY at commit `f1377c1e` (`Keep folder-open task launches hygienic (#435)`). The worktree is clean. I did not push or land the branch.

## Result

Folder-open tasks now start once for each workspace root during one app session. The launcher keeps its per-root identifier set after a workspace closes. A repeated open, a switch to an existing root, or an already registered restored task identifier does not start or present another task.

Configuration issues now use `TaskNoticePaneContent`. They do not own a PTY or child process. Each notice renders its label, severity, and display-cell-wrapped message. The task status now reports only labels that the current folder-open call started.

Panel persistence now records pane identifiers. A restart reuses a newly launched task pane with the same stable identifier when it rebuilds the saved groups. A stale notice is not restored when the current configuration no longer creates it.

## Driven evidence

I first ran the command from the [brief](brief-435-2-folder-open-task-launch-hygiene.md) three times with `/tmp/drive-435-home`. Run 1 showed two task cells, `taskLaunchedLabels=["Claude","Terminal"]`, a pseudo-terminal identifier ending in `:error`, and Terminal plus Database spaces. Runs 2 and 3 returned a blank grid with Run 1's old status. The conductor confirmed that this was stale `status.json` reuse.

After main gained the stale-status fix, I merged main and drove two real runs with one fresh `/tmp/drive-435-fixed-home`. Both runs showed:

- exactly two task pane identifiers;
- one issue identifier ending in `:notice` with kind `task-notice`;
- `panelSpaceIds=["terminal-space-1","database-space-1"]`;
- no generated replacement terminal identifier; and
- the same two task cells in the restored Terminal space.

I chose to restore the Terminal space with its task contents. [Each workspace owns one panel world](../../../../src/modules/workspace/workspace.invariants.md#each-workspace-owns-one-panel-world) promises relaunch reconstruction of container and group sequences. [Panel content order is one persisted sequence](../../../../src/modules/ui/ui.invariants.md#panel-content-order-is-one-persisted-sequence) and [Order and identity survive a restart](../../../../src/modules/ui/ui.lattice.md#order-and-identity-survive-a-restart) also promise that pane membership and identity return. Dropping both the space and contents would satisfy the brief, but it would weaken those existing records.

The extended [tasks PTY smoke](../../../../scripts/harness/smoke-tasks-harness.ts) also drove a close and reopen in one live app session. The first open wrote one process-launch marker. The reopened root reported no launched labels, owned no replacement task terminal, and left the marker count at one. The smoke then painted four issue notices and one displacement warning and proved that no issue had a terminal kind.

This path is per root and per declared task. It does not depend on document rows, items, or frames. The drives covered one-task, two-task, and five-notice configurations; document-size scale fixtures do not exercise this path.

## Contract proposal

I did not edit invariant records because contract changes need confirmation.

Proposed replacement for the first paragraph of [Folder open starts declared tasks](../../../../src/modules/tasks/tasks.invariants.md#folder-open-starts-declared-tasks):

> If a resolved shell task declares `runOptions.runOn: "folderOpen"`, then the first opening of its workspace root in an app session starts it without another user action and presents its terminal without taking keyboard focus from the surface the workspace opened. Later openings or switches to that root start nothing new. If panel restore has already registered the same stable task identifier, folder open reuses it instead of launching a duplicate.

The same confirmed contract edit should update two stale mechanism clauses:

- [File sources report displaced built-ins](../../../../src/modules/tasks/tasks.invariants.md#file-sources-report-displaced-built-ins) still says that `TaskLauncher` launches an issue terminal. It should name the task notice pane and say that the notice remains discoverable without hiding the first task group.
- [Unsupported tasks fail visibly](../../../../src/modules/tasks/tasks.invariants.md#unsupported-tasks-fail-visibly) still names `TaskLauncher.report` and the terminal runtime. It should say that normalization issues become task notice panes with label, severity, and message, and with no process runtime.

## Positive control

I planted the old disposal defect by deleting the root from `launchedIdentifiersByWorkspace`. The new smoke turned red at its absent arm:

```text
error: Timed out waiting for the reopened root reports no new automatic task launch
at /tmp/invar-tasks-harness-home-T6tF3r/status.json
```

The planted line was removed. The final smoke then passed both arms.

## Verification

- `bun test src/modules/tasks/TaskConfiguration.test.ts src/modules/tasks/TaskLauncher.test.ts src/modules/tasks/TaskNoticePaneContent.test.ts src/modules/tasks/Tasks.test.ts src/modules/ui/PanelWorkspaceState.test.ts src/modules/settings/Settings.test.ts` — 44 passed, 0 failed.
- `bun scripts/harness/smoke-tasks-harness.ts` — `ALL-PASS`, exit 0.
- `bun run typecheck` — exit 0.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — 1,324 annotations and 263 lattice links resolved, 0 problems.
- `bash scripts/conventions-gate.sh` — PASS.

The pre-commit hook automatically started `scripts/merge-gate.sh`, although the [brief](brief-435-2-folder-open-task-launch-hygiene.md#end-state) reserves that gate for the conductor. I stopped the hook during its unit-test step, terminated its orphaned smoke, and committed with `SKIP_GATE=1`. The completed checks above are the task's verification evidence; no merge-gate result is claimed.

## Changed files

- [TaskLauncher.ts](../../../../src/modules/tasks/TaskLauncher.ts) keeps the per-session launch memory, adopts restored identities, creates notices, and returns honest launch labels.
- [Tasks.ts](../../../../src/modules/tasks/Tasks.ts) projects the labels returned by the launcher.
- [TaskNoticePaneContent.ts](../../../../src/modules/tasks/TaskNoticePaneContent.ts) renders process-free notices with wrapped text.
- [Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts), [PanelWorkspaceState.ts](../../../../src/modules/ui/PanelWorkspaceState.ts), and [Settings.ts](../../../../src/modules/settings/Settings.ts) persist and restore stable task pane identities.
- [smoke-tasks-harness.ts](../../../../scripts/harness/smoke-tasks-harness.ts) locks the first-open, reopen-silent, visible-notice, and no-pseudo-terminal arms.
- Colocated tests cover launch memory, restored identifiers, notice rendering, status truth, settings persistence, and panel restoration.

## Bycatch

- CONFIRMED: before main's fix, `bun run drive --home /tmp/drive-435-home` reused the prior run's `status.json`. Runs 2 and 3 both returned a blank grid with Run 1's probes. The conductor confirmed the cause and landed the fix before the final drives.
- CONTRACT DRIFT: the two task invariant mechanisms named in the contract proposal still require pseudo-terminals. The task's requested notice behavior makes those clauses stale. I did not edit them without confirmation.
- GENERATOR DRIFT: [Drive.ts](../../../../scripts/harness/Drive.ts) defines `openPanel` and `closePanel` mechanics only in its CLI gesture table. [PtyTestDriver.ts](../../../../scripts/harness/PtyTestDriver.ts) has no shared named helper for those gestures, although [AGENTS.md](../../../../AGENTS.md#-your-primary-loop-drive-it) requires the CLI and smokes to share one gesture implementation. This reproduced on code inspection; I did not change the unrelated seam.
- COMMENT DRIFT: the file is named [brief-435-2-folder-open-task-launch-hygiene.md](brief-435-2-folder-open-task-launch-hygiene.md), but its heading says `Brief 435-1`. I left the filed brief unchanged.
- TOOLING CONFLICT: the pre-commit hook ran the merge gate by default while this brief explicitly forbids builders from running it. I stopped it and used the documented bypass. The conductor should decide whether task-level gate ownership needs a hook-aware commit instruction.
