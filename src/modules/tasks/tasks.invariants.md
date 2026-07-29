# Workspace Tasks — Invariants

Load-bearing rules for `src/modules/tasks/`, its workspace lifecycle, and its
terminal-process launch adapter. The task shape is compatible with
`.vscode/tasks.json`; Invar adds no agent-specific process policy.

## Reality-based invariants

### Unsupported variables fail before the shell

**Invariant:** If a task contains a supported `${...}` variable, then
configuration resolution replaces it from that task's workspace, active
document, or app environment before the shell starts. If a file variable has
no active document, or the variable is unsupported, then resolution stops that
task and names the refused variable before any shell starts.

**Scope:** Variable substitution in task `command` and `args`. Ordinary shell
variables that do not use the `${...}` task-variable form remain shell input.
Supported variables are `${workspaceFolder}`, `${workspaceFolderBasename}`,
`${file}`, `${fileBasename}`, `${fileDirname}`, `${fileExtname}`,
`${relativeFile}`, `${cwd}`, `${pathSeparator}`, `${userHome}`, and
`${env:NAME}`. `${input:...}` and `${command:...}` remain unsupported.

**Mechanism:** `TaskConfiguration.substituteTaskVariables` resolves the
supported schema from its explicit workspace root and active document, plus
the app `Environment`. Undefined environment variables resolve to an empty
string, which matches VS Code. The method throws a configuration issue for a
missing file context or an unsupported variable. `TaskLauncher.report` renders
that issue through a dedicated terminal.

**Generates:** Config-origin errors instead of shell-dependent `bad
substitution` messages or literal dollar-brace commands.

**Evidence:** `src/modules/tasks/TaskConfiguration.test.ts` `environment
variables resolve from the app environment and undefined values become empty`,
`predefined variables use the selected workspace root and active document`,
`each file variable refuses resolution without an active document`, and `input
and command variables stay outside the supported boundary`;
`scripts/harness/smoke-tasks-harness.ts` `unsupported inputs report visibly`.

**Impossible if true:** A task process receives an unresolved
`${workspaceRoot}` string; a file variable reaches a shell without an active
document; `${input:...}` or `${command:...}` reaches a shell; an unsupported
variable disappears without a visible error naming it.

**Verification:** `bun test src/modules/tasks/TaskConfiguration.test.ts && bun
scripts/harness/smoke-tasks-harness.ts`

**Status:** established

**Last refined:** 2026-07-29

## Chosen invariants

### One task source controls each workspace

**Invariant:** If task configuration is resolved for a workspace, then exactly
one source controls it: `.invar/tasks.json`, otherwise `.vscode/tasks.json`,
otherwise the built-in default.

**Scope:** Whole-file source selection for one workspace root. Tasks from
different files are never merged.

**Mechanism:** `TaskConfiguration.resolve` checks the two paths in precedence
order and returns immediately for the first existing path.

**Generates:** Existing VS Code repositories work without migration; an Invar
override is complete and readable; source identity is published by
`Tasks.statusSnapshot`.

**Evidence:** `src/modules/tasks/TaskConfiguration.test.ts` `.invar wins
outright and JSONC preserves VS Code compatibility`;
`scripts/harness/smoke-tasks-harness.ts` drives both source states.

**Impossible if true:** Labels from `.invar/tasks.json` and
`.vscode/tasks.json` appear in the same resolved workspace; the built-in task
runs while either file exists.

**Verification:** `bun test src/modules/tasks/TaskConfiguration.test.ts && bun
scripts/harness/smoke-tasks-harness.ts`

**Status:** established

**Last refined:** 2026-07-27

### File sources report displaced built-ins

**Invariant:** If a file task source supersedes the built-in source, then one
visible task report names every displaced built-in while the file tasks remain
selected.

**Scope:** `.invar/tasks.json` and `.vscode/tasks.json` source selection. The
no-file built-in source does not report a displacement.

**Mechanism:** `TaskConfiguration.reportDisplacedBuiltIns` derives one issue
from the built-in task labels. `TaskLauncher.launchFolderOpen` launches the
issue terminal but leaves the first configured task group presented, so its
`Displaced: <labels>` heading remains visible in the terminal list without
hiding the selected file tasks.

**Generates:** A named warning at first file-source adoption; unchanged
whole-file replacement; contributor-owned built-in labels instead of
host-owned task-name checks.

**Evidence:** `src/modules/tasks/TaskConfiguration.test.ts` `file sources name
each displaced built-in exactly once`; `scripts/harness/smoke-tasks-harness.ts`
drives the no-file and file-source states through real PTYs.

**Impossible if true:** A file source removes a built-in while `taskErrors`
and the terminal list name no displacement; the report merges the built-in
task into the selected file source; the report hides the configured
folder-open task group.

**Verification:** `bun test src/modules/tasks/TaskConfiguration.test.ts
src/modules/tasks/TaskLauncher.test.ts && bun
scripts/harness/smoke-tasks-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-28

### Folder open starts declared tasks

**Invariant:** If a resolved shell task declares
`runOptions.runOn: "folderOpen"`, then opening its workspace starts it without
another user action and presents its terminal without taking keyboard focus
from the surface the workspace opened.

**Scope:** Shell tasks, workspace contribution lifecycle, and the no-file
built-in. Manual task reruns remain registered commands. `problemMatcher` is
accepted and deliberately ignored because diagnostics parsing is outside this
capability. PTY fixtures for unrelated subsystems explicitly disable only the
built-in convenience through `TasksOptions.builtInDefaultEnabled`; the tasks
smoke enables and verifies it.

**Mechanism:** `Tasks.opened` resolves once, registers `Tasks: Run <label>`,
then calls `TaskLauncher.launchFolderOpen`.
`TaskTerminalLaunchPort.present` receives `transferFocus=false` for automatic
folder-open work and `true` for a manually invoked task command. The built-in is
exactly
`claude --dangerously-skip-permissions --continue || claude
--dangerously-skip-permissions`: `||` is deliberate because a missing resumable
session must start fresh; a pipe would connect two processes instead.

**Generates:** Workspace-declared agents, development servers, and shells start
on open; a missing `claude` remains a legible shell failure in the terminal.

**Evidence:** `src/modules/tasks/Tasks.test.ts`;
`src/modules/tasks/TaskLauncher.test.ts`;
`scripts/harness/smoke-tasks-harness.ts` observes `.vscode`, `.invar`, and both
branches of the built-in resume-or-fresh command in real PTYs;
`scripts/harness/smoke-reserved-chord-harness.ts` opens a file beside an
automatic task and drives `Ctrl+,` into Settings.

**Impossible if true:** A folder-open task waits for a manual command; the
built-in silently leaves an empty pane after `--continue` has no session; an
automatic task terminal and the newly opened editor both claim the next
keystroke.

**Verification:** `bun test src/modules/tasks/Tasks.test.ts
src/modules/tasks/TaskLauncher.test.ts && bun
scripts/harness/smoke-tasks-harness.ts && bun
scripts/harness/smoke-reserved-chord-harness.ts`

**Status:** established

**Last refined:** 2026-07-28

### Each task owns one terminal

**Invariant:** If a shell task launches, then one terminal owned by the
existing terminal runtime receives its command, arguments, environment,
workspace root, and label.

**Scope:** `TaskLauncher`, the task adapter in `Bootstrap`, `TerminalFactory`,
`OpenPtyBackend`, and `PanelHost`. The native power-user agent pane is a
separate content kind and remains unchanged.

**Mechanism:** Every task configuration index gets a stable unique pane
identifier and its label becomes the pane heading. `presentation.panel:
"dedicated"` therefore maps to one task per terminal, while equal
`presentation.group` values are presented as cells in one panel split.
`OpenPtyBackend` remains the sole task process owner.

**Generates:** Dedicated labeled terminals, side-by-side task groups, normal
terminal output and lifecycle behavior, and coexistence with the native agent
pane.

**Evidence:** `src/modules/terminal/TerminalFactory.test.ts` `task identity and
process options cross the existing terminal seam`;
`scripts/harness/smoke-tasks-harness.ts` drives the grouped split and native
agent coexistence.

**Impossible if true:** Two dedicated tasks share one emulator or child
process; task code owns a second PTY runtime; opening a terminal task replaces
the native agent pane.

**Verification:** `bun test src/modules/terminal/TerminalFactory.test.ts
src/modules/terminal/OpenPtyBackend.test.ts && bun
scripts/harness/smoke-tasks-harness.ts`

**Status:** established

**Last refined:** 2026-07-27

### Unsupported tasks fail visibly

**Invariant:** If a resolved task uses an unsupported type or compound
`dependsOn`, then Invar reports that definition as unsupported instead of
skipping it.

**Scope:** Unsupported `process`, `npm`, missing task types, and compound
dependencies. Supported `shell` tasks in the same selected file may still
launch.

**Mechanism:** `TaskConfiguration.normalizeTask` returns named issues and
`TaskLauncher.report` launches each issue through the same terminal runtime
with a dedicated error heading.

**Generates:** Partial compatibility with explicit boundaries; actionable
errors at the surface where task output normally appears.

**Evidence:** `src/modules/tasks/TaskConfiguration.test.ts`;
`src/modules/tasks/TaskLauncher.test.ts`;
`scripts/harness/smoke-tasks-harness.ts` plants a `process` task as the positive
control and observes the error in status and terminal cells.

**Impossible if true:** An unsupported task is absent from both running
terminals and reported errors; an error omits the task label or unsupported
type.

**Verification:** `bun test src/modules/tasks/ && bun
scripts/harness/smoke-tasks-harness.ts`

**Status:** established

**Last refined:** 2026-07-27

### Task launch accepts process contributions

**Invariant:** If a task process needs a launch-time capability, then an
ordered `TaskProcessLaunchContributor` may contribute environment and
arguments before the terminal runtime executes it.

**Scope:** The process launch boundary between normalized task configuration
and `TaskTerminalLaunchPort`. No contributor is installed by the tasks
capability itself.

**Mechanism:** `TaskLauncher.launch` folds contributors over copied arguments
and environment, then sends the combined request through its terminal port.
This is the named MCP injection point for the future bridge: MCP attaches here,
not in Claude-specific code and not after process creation.

**Generates:** Agent-neutral capability injection; one future seam for
workspace-scoped MCP environment and arguments; task configuration remains
portable.

**Evidence:** `src/modules/tasks/TaskLauncher.test.ts` `the future MCP
injection point contributes environment and arguments`;
`src/modules/terminal/OpenPtyBackend.test.ts` proves both values reach the
shell.

**Impossible if true:** MCP launch data requires recognizing a Claude command;
a contributor runs after `Bun.spawn`; contributed environment or arguments
stop at the task adapter.

**Verification:** `bun test src/modules/tasks/TaskLauncher.test.ts
src/modules/terminal/OpenPtyBackend.test.ts`

**Status:** established

**Last refined:** 2026-07-27
