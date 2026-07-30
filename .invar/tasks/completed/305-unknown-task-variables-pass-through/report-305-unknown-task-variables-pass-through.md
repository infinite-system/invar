# READY — unknown task variables pass through

Task: [unknown task variables pass through](task-305-unknown-task-variables-pass-through.md)

Commit: `91add7843d21100b2c8f0effb65beefbd8a3bae8`

Status: The #305 change is committed. The enforcing hook passed with
`GATE_EXIT=0`. I did not bypass the gate.

## Outcome

[TaskConfiguration](../../../../src/modules/tasks/TaskConfiguration.ts) now
returns the original regex match for unknown `${...}` expressions. The shell
therefore receives shell parameter expansions unchanged.

The resolver still replaces the known task schema. It still refuses
`${input:...}`, `${command:...}`, and file variables without an active
document before launch.

[TaskConfiguration tests](../../../../src/modules/tasks/TaskConfiguration.test.ts)
cover unknown expressions in commands and arguments. They also cover allowed
names near the refused prefixes.

The existing [tasks PTY smoke](../../../../scripts/harness/smoke-tasks-harness.ts)
now exports `LOCAL_DIR=/some/prefix/realized`. Its task contains
`${LOCAL_DIR#/some/prefix}`. The real shell prints
`SHELL_EXPANDED=/realized`.

## VS Code decisions

VS Code handles an unknown variable with this fallback:

> `return replacement.id;`

Source: [VS Code variableResolver.ts, lines 292–297](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/configurationResolver/common/variableResolver.ts#L292-L297)

The returned identifier is the original `${...}` expression. Invar now
follows that behavior.

VS Code's file-path resolver throws when no editor supplies a path. See
[VS Code variableResolver.ts, lines 114–120](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/configurationResolver/common/variableResolver.ts#L114-L120).
Invar therefore keeps the loud missing-document refusal.

## Driven evidence

Before the change, the default PTY drive published this error:

`Unsupported task variable: ${LOCAL_DIR#/some/prefix}`

It published no launched task.

After the change, the same drive showed `EXPANDED=/realized` in the task
terminal. `taskLaunchedLabels` contained `unknown-shell-expansion`. No
variable error named the shell expression.

The default 10-line and 100,000-line drives both exited 0. Each launched its
folder-open task and reached a settled editor.

## Contract

[Task variables resolve pass through or refuse](../../../../src/modules/tasks/tasks.invariants.md#task-variables-resolve-pass-through-or-refuse)
now records three distinct classes:

- Known variables resolve before launch.
- Unknown expressions pass through byte-for-byte.
- Missing file context, `${input:...}`, and `${command:...}` refuse before
  launch.

The test polarities are:

| Class | Required case | Opposite case |
|---|---|---|
| Known | Workspace and environment variables resolve. | Unknown neighbors remain unchanged. |
| Unknown | Command and argument expressions pass through. | Known expressions in the same task still resolve. |
| Input | `${input:target}` refuses. | `${inputMode:target}` passes through. |
| Command | `${command:selectTarget}` refuses from an argument. | `${commander:selectTarget}` passes through. |
| File | All file variables resolve with an active document. | Each refuses without an active document. |

The positive control temporarily resolved `${input:target}`. The focused
contract failed with one unexpected runnable task:

`Received: "planted-input-resolution"`

I removed the plant. The focused contract then passed.

## Verification

- `bun test src/modules/tasks/TaskConfiguration.test.ts`: 11 passed, 0
  failed.
- `bun scripts/harness/smoke-tasks-harness.ts`: `ALL-PASS`.
- `bunx prettier --check` on all touched files: passed.
- Invariant checker: 0 problems, 1,151 annotations resolved, 221 lattice
  links resolved.
- `bun run drive --size 10`: exit 0.
- `bun run drive --size 100000`: exit 0.
- Enforcing hook: unit tests passed, the tasks smoke passed, and behavioral
  contracts passed.
- Enforcing hook final result: `GATE_EXIT=0`.

Commit `91add7843d21100b2c8f0effb65beefbd8a3bae8` contains:

- [TaskConfiguration.ts](../../../../src/modules/tasks/TaskConfiguration.ts)
- [TaskConfiguration.test.ts](../../../../src/modules/tasks/TaskConfiguration.test.ts)
- [smoke-tasks-harness.ts](../../../../scripts/harness/smoke-tasks-harness.ts)
- [tasks.invariants.md](../../../../src/modules/tasks/tasks.invariants.md)

## Unblock and integration

The first hook run returned `GATE_EXIT=1`. The horizontal-extent smoke failed
twice in that run and once more in isolation.

I created a detached scratch worktree at unchanged dispatch commit
`b8b2aabd`. The same smoke failed at the same condition there. This proves the
blocker predated #305.

The conductor traced the failure to the tracked `.invar/tasks.json`. Its
folder-open task ran inside every PTY drive. Main commit `0803e2f7` removed
the file from tracking and added the isolation contract.

I fast-forwarded this branch to `0803e2f7`. The
`git ls-files .invar/tasks.json` command returned no path, and the file was
absent. The next enforcing hook passed the horizontal-extent smoke and the
full gate.

I removed the scratch worktree. I did not use `SKIP_GATE`.

## Bycatch

- The horizontal-extent smoke stops at lines 42–51 after Alt-wheel reaches
  `scrollLeft=31`. It never shows `dims plus rgba`. It reproduced three times
  on the task tree and once at unchanged commit `b8b2aabd`. Main commit
  `0803e2f7` removed the tracked task configuration that caused it. The final
  gate passed this smoke.
- The shortcut-help smoke missed `Ctrl+Shift+H` once in the full pool. Its
  immediate isolated run passed. I did not reproduce it a second time.
- The horizontal-extent frames showed task terminals trying to source a
  missing temporary-home `.profile_env`. This appeared in the task tree and
  the unchanged scratch worktree. Main commit `0803e2f7` removed the task
  launch that exposed it during unrelated drives.
- The final gate's panel-chrome smoke timed out once. Its allowed quiet retry
  passed.
- The invariant checker skipped the ignored 11 MB
  `artifacts/home/.cache/bun/@t@/ec49c70a3f7e4fb8.pile` annotation scan
  because the file exceeds 2 MB.
