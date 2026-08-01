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

### Fleet paths derive from the workspace, never the bundle

**Invariant:** If the dashboard resolves a fleet artifact path (a task worktree, gate registry
facts), then the fleet repository root derives from the active workspace root at call time —
never from `import.meta.dir` or any other build-location constant.

**Scope:** Every fleet path the tasks-dashboard module resolves.

**Renegotiable at:** the build system — a bundler that preserved source-relative paths in
compiled binaries would remove the forcing fact, but the workspace would still be the truer
origin, since the app can run against any checkout.

**Mechanism:** In a bun-compiled binary `import.meta.dir` is the bundle's virtual root
(`/$bunfs/root`), so any path joined from it exists nowhere on disk. Source runs mask the
defect because `import.meta.dir` then points into the real checkout — which is why probes
stayed green while the built app failed. The workspace root is real in both forms.

**Generates:** The `fleetRepositoryRoot` dependency wired in
`TasksDashboardPlugin.createOverview` from `fleetRepositoryRootForWorkspace`; the worktree
marker strip so a worktree-opened workspace still resolves the main checkout.

**Evidence:** `scripts/tasks/tasks-status.ts` (`fleetRepositoryRootForWorkspace` and the
warning comment over `INVAR_FLEET_REPOSITORY_ROOT`);
`src/modules/tasks-dashboard/TasksDashboardPlugin.ts` (`createOverview`).

**Impossible if true:** A "Worktree is missing" miss in the compiled binary while the same
click succeeds from source on the same checkout; a fleet path containing `$bunfs`.

**Verification:** Compile a probe importing `fleetRepositoryRootForWorkspace` and confirm it
returns the workspace checkout, not a `$bunfs` path (driven 2026-08-01, worktree-opener fix).

**Status:** provisional

**Last refined:** 2026-08-01

## Chosen invariants

### Dashboard motion exists only while observed

**Invariant:** If no live task motion and no running gate is painted, then a motion tick causes
no paint; if the pane itself is not painted, then it has no task-tree read, data timer, or motion
timer. Selected, registered, and retained are not observed. While painted, each steady data tick
reads fleet facts only for painted task rows, lists sessions at most once for those rows, and
rebuilds only changed painted rows. While visible,
building, exploring, and gate motion use the exact exported CLI watch ramps and glyph frames,
and they step on the exported wall-clock cadence, so the pane and the CLI watch show the same
motion step at the same moment however often either repaints.

**Scope:** `TasksDashboardOverview` clocks and `TasksDashboardPaneRenderer` motion paint.

**Mechanism:** `RegisteredDockContent.isPainted` derives from the same side-dock state the root
view paints: the host is visible and its exact active content is the contribution. The pane starts
and stops both ivue-owned intervals from that predicate. A constant four-directory stamp guards
full task-tree reads. Worktree mtimes guard fleet reads, and the current row window selects fleet
and session facts. The motion tick advances only when a painted row or gate needs it. The renderer indexes the
tables exported by `scripts/tasks/tasks-status.ts` at the step
`tasksMotionStepAtElapsed(elapsedMilliseconds)` returns. The step is a pure function of elapsed
time, never of a paint ordinal: a paint count made motion SPEED a hostage of the frame rate,
which ran the CLI watch ten times too fast at 60 fps (#348).

**Evidence:** `src/modules/tasks-dashboard/TasksDashboardOverview.ts` (`startObservation`,
`animationElapsedMilliseconds`); `src/modules/tasks-dashboard/TasksDashboardPaneRenderer.ts`;
`scripts/tasks/tasks-status.ts` (`tasksMotionStepAtElapsed`); and
`src/modules/tasks-dashboard/TasksDashboardOverview.test.ts`.

**Impossible if true:** A timer for a collapsed dock, inactive tab, or inactive workspace; a
steady visible tick that scans every task folder; a held READY row that repaints; a pane-local
copy of a watch ramp or glyph sequence; a motion step derived from a frame or paint ordinal.

**Verification:** `bun test src/modules/tasks-dashboard` and the hidden-path, 500-folder
painted-window, positive-control, and motion arms of
`bun scripts/harness/smoke-tasks-dashboard-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-30

### Fleet extras name their repository scope

**Invariant:** If the active workspace is the main Invar checkout, then live task rows may show
the fleet's gate glance, line delta, and exploring/building phase. In every other workspace the
pane states that those extras describe the main checkout only and does not read or imply
workspace-local fleet facts.

**Scope:** Fleet-only rows and fields in `TasksDashboardOverview`.

**Mechanism:** `INVAR_FLEET_REPOSITORY_ROOT` resolves the main checkout even when the app code
runs from a task worktree. The overview compares resolved workspace roots before calling either
fleet reader.

**Evidence:** `scripts/tasks/tasks-status.ts` (`INVAR_FLEET_REPOSITORY_ROOT`,
`readTaskFleetFacts`, `readFleetGateGlance`) and
`src/modules/tasks-dashboard/TasksDashboardOverview.ts` (`refreshFleetFacts`).

**Impossible if true:** A fixture or unrelated project displaying main-checkout deltas as its
own; a fleet reader running for an unrelated active workspace.

**Verification:** `bun test src/modules/tasks-dashboard/TasksDashboardOverview.test.ts` and
the scoped fixture arm of `bun scripts/harness/smoke-tasks-dashboard-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-29

### Tasks stay hidden by default

**Invariant:** If the reader has not enabled `tasksDashboardShowByDefault` and has not invoked a
show gesture, then installing or booting the plugin leaves the dock exactly as found. If the
setting is enabled, the policy may reveal Tasks only into an empty dock and never takes keyboard
focus.

**Scope:** Tasks dashboard application activation and its contributed default-visibility
setting.

**Mechanism:** The contributed boolean defaults to false. The plugin uses `reveal` for its
default, records whether that policy opened the dock, and takes back only its own unfocused
reveal when the setting turns off.

**Evidence:** `src/modules/tasks-dashboard/TasksDashboardPlugin.ts`
(`applyDefaultVisibility`); `src/modules/tasks-dashboard/TasksDashboardPlugin.test.ts`; and
the boot arm of `scripts/harness/smoke-tasks-dashboard-harness.ts`.

**Impossible if true:** A fresh install opening Tasks; an automatic reveal stealing keyboard
focus; turning the setting off hiding a dock the reader opened.

**Verification:** `bun test src/modules/tasks-dashboard/TasksDashboardPlugin.test.ts` and
`bun scripts/harness/smoke-tasks-dashboard-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-29

### The CLI lenses are the dashboard's one generator

**Invariant:** If the dashboard needs a task fact, then it obtains it by importing the exported
readers of `scripts/tasks/tasks-status.ts` — `readTaskRecords`, `builderStanding`,
`startedAtMilliseconds`, `landingStamp`, `completedStateAttachment`, `agentIdentity`,
`formatDuration`, `PRIORITY_ORDER`, `tasksTreeStamp`, the fleet-fact readers, the exported
motion tables, and the exported motion cadence (`tasksMotionStepAtElapsed`) — and it
re-implements no reader or watch vocabulary: no second folder parser, no second readiness rule,
no second duration formula, no copied colour or glyph ramp, and no second motion cadence. The
pane adds only what a terminal cannot: ivue reactivity, selection, and opening files.

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

**Last refined:** 2026-07-30

### The tasks dashboard is a pane content citizen

**Invariant:** If the tasks dashboard is installed, then it is an ordinary contribution: a
manifest row (`tasks-dashboard`) registering one right-dock pane content (`tasks`), its
keybindings, its commands, its contributed settings, and its status projection through the same
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

### Each dashboard lens has one stable row shape

**Invariant:** If the Live lens paints a task, then its title owns the first row and its
standing owns the second row; if Active or Done paints a task, then all task text and actions
stay on one truncated row. Active section names start with a capital letter.

**Scope:** `TasksDashboardOverview.taskRows`, `buildLiveRows`, `buildActiveRows`,
`buildDoneRows`, and `TasksDashboardPaneRenderer.renderRow`. Every pane width and task count.

**Mechanism:** `taskRows` adds a detail row only for Live. `renderRow` reserves the pinned
action cells and sends the remaining text through `WrapText.clipToWidth` with the active
theme's one-cell ellipsis.

**Generates:** Two-row Live items; one-row Active and Done items; capitalized Active section
headers; one shared grapheme-safe truncation path.

**Rejected alternatives:** A detail row for every lens — it doubles the Active and Done
height without adding status information. Direct string slicing — it can split a grapheme or
leave row actions outside their hit geometry.

**Evidence:** `src/modules/tasks-dashboard/TasksDashboardOverview.test.ts` (row kinds and
section names); `src/modules/tasks-dashboard/TasksDashboardPaneRenderer.test.ts` (two-row Live
and one-row truncated lenses); `scripts/harness/smoke-tasks-dashboard-harness.ts` (default-width
PTY projection and large-tree arm).

**Impossible if true:** Live status on the title row; an Active or Done item consuming a
second row; a lower-case Active section name; a clipped task name without the theme ellipsis.

**Verification:** `bun test src/modules/tasks-dashboard/TasksDashboardOverview.test.ts
src/modules/tasks-dashboard/TasksDashboardPaneRenderer.test.ts` and
`bun scripts/harness/smoke-tasks-dashboard-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-29

### Dashboard controls state their selection and next action

**Invariant:** If a lens is selected, then its label and exactly one cell on both sides keep
the theme selection background across focus and live theme changes; if automatic lens cycling
is stopped or running, then the cycle control shows and explains the action that the next
activation performs.

**Scope:** `TasksDashboardPaneRenderer.renderTabLine`, `lensTabs`, `hitTestTabLine`, and
`tooltipForTabLineTarget`; `TasksDashboardPaneContent.tooltipAt` and the tab-line
pointer-down path.

**Mechanism:** `lensTabs` is the single paint and hit geometry. `renderTabLine` resolves
selected and hovered backgrounds from the current palette and resolves cycle glyphs from
`TaskActionIconSet`; `PaneContent.tooltipAt` routes the same hit target to the shared tooltip
host. Stopping cycling changes only `cycling` and keeps the current lens.

**Generates:** Persistent padded lens selection; theme-derived tab tones; start and stop
glyphs; `Start automatic lens cycling` and `Stop automatic lens cycling` tooltips; stop on
the current lens.

**Rejected alternatives:** A literal play glyph or colour in the renderer — it bypasses the
theme capability ladder. A tasks-owned tooltip surface — it would duplicate the shared
display-only tooltip host.

**Evidence:** `src/modules/tasks-dashboard/TasksDashboardPaneRenderer.test.ts` (geometry,
palette chunks, and tooltip polarities); `src/modules/tasks-dashboard/TasksDashboardPaneContent.test.ts`
(start and stop activation); `scripts/harness/smoke-tasks-dashboard-harness.ts` (FrameProbe
padding and live theme switch).

**Impossible if true:** A selected lens shown only by foreground colour; a selected
background that omits either padding cell; a theme switch that keeps the old selection tone;
a running control that still advertises start; a second click that cannot stop cycling.

**Verification:** `bun test src/modules/tasks-dashboard/TasksDashboardPaneRenderer.test.ts
src/modules/tasks-dashboard/TasksDashboardPaneContent.test.ts` and
`bun scripts/harness/smoke-tasks-dashboard-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-29

### Task actions use the workspace and runtime seams

**Invariant:** If a task action is activated, then task, brief, and report files open through
`openFileInTab`, the worktree opens through `WorkspaceSet.open`, and a builder session opens
through the terminal `PaneRuntime` as `tmux attach -t <session>`. A missing file, worktree, or
session states itself in the action row; it never crashes and never silently does nothing.

**Scope:** `TasksDashboardPlugin.performRowAction`, the `tasks.open` command, and the pane's
pointer-down path. Group headings are never activatable.

**Mechanism:** Stands on *Plugin boundaries grant one authority*: the plugin asks the workspace
to open its own tab through public members; it opens no parallel path. The file name comes from
the reader's `taskFileName` field, so the pane never guesses at naming conventions.

**Generates:** `performRowAction`; the Enter/Space bindings; the session, workspace, task,
brief, and report hit regions; their tooltips; and the stated missing-artifact row.

**Rejected alternatives:** A dashboard-owned buffer opener — two openers would drift on focus
and history semantics, the same reason the structure pane jumps through the view contract.

**Evidence:** `src/modules/tasks-dashboard/TasksDashboardPlugin.ts` (`performRowAction`);
`src/modules/tasks-dashboard/TasksDashboardPaneContent.ts` (`onPointerDown`);
`src/modules/tasks-dashboard/TasksDashboardPlugin.test.ts` (the open assertions).

**Impossible if true:** A second file-opening implementation in the tasks-dashboard module; a
crash from activating an empty lens; a group heading that opens anything.

**Verification:** `bun test src/modules/tasks-dashboard/TasksDashboardPlugin.test.ts` and the
driven open in `bun scripts/harness/smoke-tasks-dashboard-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-29
