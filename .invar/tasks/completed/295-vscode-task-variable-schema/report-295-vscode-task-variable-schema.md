# READY — VS Code task variable schema #295

Task: [VS Code task variable schema](task-295-vscode-task-variable-schema.md)

Commit: `61514d54d0b6f1c93dbd9e3db19ff90fd8f1f447`

## Outcome

[TaskConfiguration](../../../../src/modules/tasks/TaskConfiguration.ts) now
resolves the requested VS Code variable set at one substitution seam.

The seam accepts an explicit workspace root and active document path. Tests
use two distinct workspace roots. This keeps per-workspace data out of global
state. The separate secondary-workspace wiring task still owns the caller
wiring.

[Environment](../../../../src/modules/system/Environment.ts) supplies the app
environment and user home. [Files](../../../../src/modules/system/Files.ts)
supplies path operations and the platform path separator.

The refusal message now names the full supported set. `${input:...}`,
`${command:...}`, unknown variables, and file variables without an active
document still fail before a shell starts.

## VS Code undefined environment decision

The official VS Code resolver reaches this return when an environment value
is absent or is not a string:

> `return '';`

Source: [VS Code variableResolver.ts, lines 169–177](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/configurationResolver/common/variableResolver.ts#L169-L177)

Invar therefore replaces an undefined `${env:NAME}` with an empty string.
This follows VS Code instead of applying the louder unsupported-variable rule
to that supported case.

## Driven evidence

Before the change, a real PTY drive with `LOCAL_DIR=/tmp/local-dir` published
`Unsupported task variable: ${env:LOCAL_DIR}`. It launched no task.

After the change, the same drive showed `ENV_VALUE=/tmp/local-dir` in the task
terminal. It published no variable error.

| Variable class | Resolving case | Opposite case |
|---|---|---|
| Environment | A defined value reached the real shell. | An undefined value became an empty string in unit and PTY coverage. |
| Workspace predefined | Two roots produced their own folder, basename, current directory, separator, and home values. | The two-root test prevents a global-root result from passing. |
| File predefined | `${file}`, `${fileBasename}`, `${fileDirname}`, `${fileExtname}`, and `${relativeFile}` resolved from the supplied active document. | Each variable produced a named issue when the active document was absent. |
| Refused | Unknown, input, and command variables produced named issues before launch. | A planted `${input:target}` resolution made the boundary test fail with one unexpected runnable task. |

The real [tasks smoke](../../../../scripts/harness/smoke-tasks-harness.ts)
observed workspace, environment, and context-free predefined values in two
shells. It also rendered five planted errors for unsupported type, unknown
variable, missing file context, input variable, and command variable.

## Contract

[Unsupported variables fail before the shell](../../../../src/modules/tasks/tasks.invariants.md#unsupported-variables-fail-before-the-shell)
now records the supported schema, active-document refusal, empty undefined
environment value, and the input and command boundary.

The positive control temporarily resolved `${input:target}`. The focused
contract test failed with `1 fail`, because the input task became runnable.
I removed the plant before verification.

## Verification

- `bun test`: 1,943 passed, 0 failed.
- `bun test src/modules/tasks/TaskConfiguration.test.ts`: 10 passed, 0 failed.
- `bun scripts/harness/smoke-tasks-harness.ts`: `ALL-PASS`.
- `bunx tsc --noEmit`: exit 0.
- Invariant checker: 0 problems, 1,140 annotations resolved, 221 lattice links resolved.
- `bash scripts/conventions-gate.sh`: `PASS`.
- The commit hook ran the full merge gate: `ALL-PASS`.

The full gate passed one panel-split smoke only on its allowed quiet retry.
The gate recorded one retry.

## Bycatch

- The panel-split smoke timed out during the commit gate. Its quiet retry passed. I did not reproduce it a second time.
- The worktree-root [TASK.md](../../../../.invar/worktrees/295-vscode-task-variable-schema/TASK.md) used a contract link relative to the external task folder. The invariant checker rejected it. I corrected the ignored local dispatch copy to use its real root-relative target.
- The input-byte timing gate reported p50 `9.748 ms` against the report-only warning level `6.406 ms`. All five ordering sessions passed. I did not run a second timing series.
