# Tasks Dashboard — Module Invariants

The tasks dashboard: the durable task system (`.invar/tasks/`) as a right-dock pane with the
three CLI lenses (LIVE / ACTIVE / DONE), an optional cycling overview, and selection that opens
each task's own record file. This contract governs `src/modules/tasks-dashboard/`. It stands on
the root `project.invariants.md` — in particular *Plugin boundaries grant one authority*, *The
host canvas is complete without plugins*, and *Cost tracks the actively observed set*.

This module has its OWN record rather than extending `src/modules/tasks/tasks.invariants.md`:
the `tasks` module governs process launching (TaskLauncher and its contributor seam); this
module consumes the task-record folders through the CLI readers. The generators differ, so the
seam rule places them in separate contracts.

Invariants are unnumbered — the name is the identifier, matched byte-for-byte by `// invariant:`
annotations. Chosen invariants stand on reality invariants, never the reverse.

## Reality-based invariants

### Task truth lives in the folders the CLI reads

**Invariant:** If a fact about a task is shown (its state, standing, round, duration, agent
identity, priority, or landing), then that fact derives from the `.invar/tasks/` folder tree and
its `meta.json` stamps — an external record that any process may move or rewrite between reads —
and never from state the pane retains between reads.

**Scope:** Every task fact displayed by `src/modules/tasks-dashboard/`.

**Renegotiable at:** the task-system boundary — a database-backed task store would change the
read mechanics, but the store would still be external and mutable between reads, so re-reading
rather than retaining would still be the law.

**Mechanism:** The folder tree is the fleet's shared ground truth: dispatch scripts, the
conductor, and builders all move folders and write stamps concurrently with any pane session.
A retained copy is stale the moment a landing moves a folder.

**Generates:** The refresh-on-stamp-change design; the `records` cache being nothing but the
last read, always replaced whole; the absent-tree degrade.

**Evidence:** `scripts/tasks/tasks-status.ts` (the readers and their header comment);
`src/modules/tasks-dashboard/TasksDashboardOverview.ts` (`refresh`, `probeStamp`).

**Impossible if true:** A pane that edits its cached records in place; a task fact computed
from anything but the current folder read.

**Verification:** `bun test src/modules/tasks-dashboard/TasksDashboardOverview.test.ts`.

**Status:** provisional

**Last refined:** 2026-07-29

## Chosen invariants

### The CLI lenses are the dashboard's one generator

**Invariant:** If the dashboard needs a task fact, then it obtains it by importing the exported
readers of `scripts/tasks/tasks-status.ts` — `readTaskRecords`, `builderStanding`,
`startedAtMilliseconds`, `landingStamp`, `completedStateAttachment`, `agentIdentity`,
`formatDuration`, `PRIORITY_ORDER`, `tasksTreeStamp` — and it re-implements no reader: no second
folder parser, no second readiness rule, no second duration formula. The pane adds only what a
terminal cannot: ivue reactivity, selection, and opening files.

**Scope:** All of `src/modules/tasks-dashboard/`. The readers themselves live with the CLI in
`scripts/tasks/tasks-status.ts`, whose entry point is guarded by `import.meta.main` so importing
executes nothing.

**Components:**
- *One readiness rule* — READY versus building is `builderStanding`, the same round-anchor rule
  the `tasks:live` lens prints; the pane cannot drift from the terminal.
- *One duration vocabulary* — `formatDuration` renders both the CLI's and the pane's clocks.
- *The seam grows at the generator* — a fact the pane needs and the CLI does not yet expose is
  added as an export in `tasks-status.ts`, never re-derived pane-side (`taskFileName` on
  `TaskRecord` is the precedent).

**Mechanism:** Stands on *Task truth lives in the folders the CLI reads* and the root seam rule
(*Seams are drawn at the shared generator*). The user named the CLI lenses as the primitive for
this module; a second parser would let the two views of the same folders disagree.

**Generates:** The exports and `import.meta.main` guard in `scripts/tasks/tasks-status.ts`; the
import list at the top of `TasksDashboardOverview.ts`.

**Rejected alternatives:** Shelling out to `bun run tasks:live` and scraping ANSI — pays a
process per refresh and parses paint, not facts. Embedding the `tasks:watch` PTY widget — the
user named that an interim only; it polls redraws where the pane is reactive.

**Evidence:** `scripts/tasks/tasks-status.ts` (exports, `builderStanding`, `landingStamp`);
`src/modules/tasks-dashboard/TasksDashboardOverview.ts` (the single import site).

**Impossible if true:** A folder-walking loop, a `State:`/`Priority:` line parser, a readiness
comparison, or a duration formatter defined inside `src/modules/tasks-dashboard/`.

**Verification:** `grep -rn "readdirSync\|State:\|Priority:" src/modules/tasks-dashboard/*.ts
--include='*.ts' | grep -v test | grep -v invariant` names no parser; and
`bun test src/modules/tasks-dashboard/TasksDashboardOverview.test.ts`.

**Status:** provisional

**Last refined:** 2026-07-29

### The tasks dashboard is a pane content citizen

**Invariant:** If the tasks dashboard is installed, then it is an ordinary contribution: a
manifest row (`tasks-dashboard`) registering one right-dock pane content (`tasks`), its
keybindings, its commands, its contributed setting, and its status projection through the same
`ApplicationContributionContext` seams every citizen uses — zero host edits — and uninstalling
it stops the overview's heartbeat and withdraws all of it while a reinstall rebuilds all of it
from the same context.

**Scope:** `TasksDashboardPlugin`, `TasksDashboardPaneContent`, and their registration through
`DefaultPlugins`. Install, uninstall, and reinstall of the Tasks Dashboard extension.

**Components:**
- *A cells citizen* — the pane returns a `StyledText` from `render`; it owns no renderable and
  declares no native surface.
- *Withdrawal is total* — `disposeApplication` disposes the overview (its heartbeat timer), the
  commands, and the status projection; the host unregisters the pane, keybindings, and setting
  scoped to the activation.
- *The projection is absent, not stale* — with the plugin uninstalled the `tasks*` status keys
  are gone.
- *Reinstall rebuilds* — a second activation registers a fresh pane and a live projection; no
  state is retained between lives.

**Mechanism:** Stands on *Plugin boundaries grant one authority* and *The host canvas is
complete without plugins*. The plugin holds every registration's disposer and calls them in
`disposeApplication`; `ApplicationContributions` reverses the host-scoped registrations.

**Generates:** The manifest entry in `DefaultPlugins`; the Extensions toggle; the
uninstall/reinstall smoke arms; the `tasks*` status keys.

**Rejected alternatives:** A host-mounted tasks view — re-couples the host to a plugin domain,
the exact edit the contributor precedent forbids.

**Evidence:** `src/modules/tasks-dashboard/TasksDashboardPlugin.ts`;
`src/modules/tasks-dashboard/TasksDashboardPaneContent.ts`;
`src/modules/plugins/DefaultPlugins.ts`;
`src/modules/tasks-dashboard/TasksDashboardPlugin.test.ts`;
`scripts/harness/smoke-tasks-dashboard-harness.ts` (the uninstall/reinstall arms).

**Impossible if true:** A production file in `src/modules/ui`, `src/modules/app`, or
`src/modules/workspace` naming the tasks-dashboard module; a disabled Tasks Dashboard leaving a
pane, binding, command, setting, timer, or status key behind; a reinstall that cannot rebuild
the pane.

**Verification:** `grep -rln "modules/tasks-dashboard/" --include='*.ts' src/modules/app
src/modules/workspace src/modules/ui | grep -v '\.test\.'` prints nothing;
`bun test src/modules/tasks-dashboard/TasksDashboardPlugin.test.ts`; and
`bun scripts/harness/smoke-tasks-dashboard-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-29

### An absent task tree is stated, never blank

**Invariant:** If the pane has no task rows to show, then it states why — no `.invar/tasks/`
directory in this workspace, or the current lens is genuinely empty (`IN-PROGRESS: none.`,
`ACTIVE: none.`, `COMPLETED: none.`, the CLI's own wording) — and a workspace without a task
tree shows the stated affordance, never an empty pane and never a crash.

**Scope:** `TasksDashboardOverview` (`available`), `TasksDashboardPaneRenderer` (the stated
affordances). Every workspace, most of which have no `.invar/tasks/`.

**Mechanism:** Stands on *Task truth lives in the folders the CLI reads*: absence of the tree
is itself a folder fact, read on every refresh. The renderer maps each rows-absent state to a
named headline; there is no code path that returns an empty body for an installed pane.

**Generates:** The `available` ref; the absent-tree headline and hint; the per-lens empty
lines; the degrade arm of the smoke.

**Rejected alternatives:** Hiding the pane when the tree is absent — conceals the affordance
and makes the chord look broken; the stated-degrade precedent (structure's unsupported-file
pane) exists to prevent exactly that.

**Evidence:** `src/modules/tasks-dashboard/TasksDashboardOverview.ts` (`refresh`);
`src/modules/tasks-dashboard/TasksDashboardPaneRenderer.ts` (`render`, `emptyLensLine`);
`src/modules/tasks-dashboard/TasksDashboardPaneRenderer.test.ts` (the degrade cases).

**Impossible if true:** A blank installed tasks pane; a crash on a workspace without
`.invar/tasks/`; an empty lens indistinguishable from a broken one.

**Verification:** `bun test src/modules/tasks-dashboard/TasksDashboardPaneRenderer.test.ts` and
the absent-tree arm of `bun scripts/harness/smoke-tasks-dashboard-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-29

### Selection opens the record through the workspace open seam

**Invariant:** If a task row is activated (Enter, Space, or a click), then its
`task-<n>-<slug>.md` opens through the existing workspace contract — `openFileInTab`, focus
returned to the editor, the right dock blurred — the same seam every other opener uses; and
with no selectable row, or a folder without a task file, the gesture is a no-op, never a crash.

**Scope:** `TasksDashboardPlugin.openSelectedRecord`, the `tasks.open` command, and the pane's
pointer-down path. Group headings are never activatable.

**Mechanism:** Stands on *Plugin boundaries grant one authority*: the plugin asks the workspace
to open its own tab through public members; it opens no parallel path. The file name comes from
the reader's `taskFileName` field, so the pane never guesses at naming conventions.

**Generates:** `openSelectedRecord`; the Enter/Space bindings and the pointer-down activation;
the `tasksSelectedFile` status key a smoke asserts.

**Rejected alternatives:** A dashboard-owned buffer opener — two openers would drift on focus
and history semantics, the same reason the structure pane jumps through the view contract.

**Evidence:** `src/modules/tasks-dashboard/TasksDashboardPlugin.ts` (`openSelectedRecord`);
`src/modules/tasks-dashboard/TasksDashboardPaneContent.ts` (`onPointerDown`);
`src/modules/tasks-dashboard/TasksDashboardPlugin.test.ts` (the open assertions).

**Impossible if true:** A second file-opening implementation in the tasks-dashboard module; a
crash from activating an empty lens; a group heading that opens anything.

**Verification:** `bun test src/modules/tasks-dashboard/TasksDashboardPlugin.test.ts` and the
driven open in `bun scripts/harness/smoke-tasks-dashboard-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-29
