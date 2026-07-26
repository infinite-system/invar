# Workspace — Invariants

Load-bearing rules for `src/modules/workspace/` (`WorkspaceSet`, `Workspace`, `FileTree`) and the
shared project/editor tab boundary. Stands on `project.invariants.md`.

## Reality-based invariants

_None specific to the workspace — it consumes the project reality invariants (bounded viewport;
a referenced resource stays alive) rather than adding its own._

## Chosen invariants

### Document identity survives document instance replacement

**Invariant:** If a logical open document is dehydrated and later rehydrated, then every document
lifecycle event carries the same stable `DocumentHandle`; contributions key document state by that
handle, never by one workspace-global active-document slot.

**Scope:** `OpenBufferSet`, `DocumentHandle`, `DocumentLifecycle`, the language-client document
sync contribution, and the source-control head-text contribution.

**Mechanism:** Each `BufferEntry` creates one `DocumentHandle` that outlives its replaceable editor
document. Hydration attaches the current document instance, deactivation detaches it, and
`DocumentLifecycle` broadcasts opened, became-active, and closed with the handle.

**Generates:** Per-document contribution state that survives flyweight replacement; one lifecycle
vocabulary shared by language sync and repository head tracking.

**Evidence:** `DocumentHandle.ts`; `DocumentLifecycle.ts`; `OpenBufferSet.ts`;
`GitDocumentState.ts`; `GitDocumentState.test.ts`; the compile-time unkeyed-projection rejection
in `GitWorkspace.test.ts`.

**Impossible if true:** The stale-head cross-document bug class: a head-text result stored in one
workspace-global active slot and then projected onto a different document after a tab switch.

**Verification:** `bun test src/modules/git/GitDocumentState.test.ts
src/modules/workspace/OpenBufferSet.test.ts`.

**Status:** established

**Last refined:** 2026-07-26

### Gutter marks come from document scoped contributions

**Invariant:** If a line mark is painted in the editor gutter, body, or overview, then it came from
one cached `GutterDecorations` snapshot for the visible document's stable handle.

**Scope:** The editor gutter contribution registry, repository diff marks, language diagnostics,
`EditorPaneRenderer`, `OverviewRuler`, and `ScrollbarSync`.

**Mechanism:** `Workspace` registers language diagnostics and plugins register their own
`GutterDecorationContribution`. `GutterDecorations.snapshotFor` combines them once per contribution
or document revision and returns the same snapshot identity until either changes; the gutter,
in-body underline, and overview renderers project that snapshot instead of recomputing marks.

**Generates:** One per-document decoration vocabulary for source-control changes and language
diagnostics; one recompute shared by the visible-row and whole-document projections.

**Evidence:** `GutterDecorations.ts`; `Workspace.ts` `languageDecorationsByLine`;
`GitDocumentState.ts`; `EditorPaneRenderer.ts`; `OverviewRuler.ts`; snapshot identity tests in
`GutterDecorations.test.ts` and `OverviewRuler.test.ts`.

**Impossible if true:** The gutter and overview computing separate line-mark maps; a contributor
returning marks without a document handle; unchanged marks causing a whole-document aggregation on
every frame.

**Verification:** `bun test src/modules/workspace/GutterDecorations.test.ts
src/modules/git/GitDocumentState.test.ts src/modules/ui/OverviewRuler.test.ts && bash
scripts/smoke-diagnostics.sh`.

**Status:** established

**Last refined:** 2026-07-26

### One mark has one reserved meaning

**Invariant:** If an editor mark occupies a reserved visual position, then its shape, meaning,
owner, and column match exactly one row in the reserved-mark table below.

**Scope:** Normal editor diff marks, language diagnostics, the gutter marker cell, code-body
underlines, and the editor vertical scrollbar overview column. `DiffView` has its own aligned-pane
overview and is outside this vocabulary.

**Components:**

| Mark | Meaning | Owner | Column |
| --- | --- | --- | --- |
| `▎` in `palette.added` | Line added against HEAD | Source-control plugin | Diff gutter |
| `▎` in `palette.modified` | Real line modified against HEAD | Source-control plugin | Diff gutter |
| `▎` in `palette.deleted` | Deleted block placed on the line below, or the final real line at end of file | Source-control plugin | Diff gutter |
| Underline in `palette.error` / `warning` / `info` (hint shares info color) | Diagnostic range and severity | Language diagnostics | Code body |
| `•` (`.` at ASCII tier) in the matching semantic color | Whole-document location of any diff or diagnostic mark | `GutterDecorations` contributors | Editor vertical scrollbar track |

All glyph tiers resolve the diff mark to `▎`; the overview pip resolves through
`Theme.glyph('overviewMark')`; diagnostic underlines are cell styles and need no glyph fallback.

**Mechanism:** `EditorLineDecoration` is a discriminated union. Only
`VersionControlLineDecoration` has a gutter projection; only `DiagnosticLineDecoration` has an
underline; both enter `OverviewRuler`. `EditorPaneRenderer` filters the union by owner before
painting the gutter.

**Generates:** A diff-only gutter; diagnostic-only body underlines; a recorded reservation check
before any future mark is added.

**Rejected alternatives:** Diagnostic marks in the diff gutter — a red diagnostic and a red
deletion occupied the same column and forced users to guess which meaning one mark carried.

**Evidence:** `src/modules/workspace/GutterDecorations.ts`; `src/modules/ui/EditorPaneRenderer.ts`;
`src/modules/git/GitDocumentState.ts`; `src/modules/workspace/GutterDecorations.test.ts`;
`scripts/harness/smoke-diagnostics-harness.ts`.

**Impossible if true:** A diagnostic glyph in the gutter; a deletion drawn as `_` or `▁`; one
gutter shape meaning both version control and language diagnostics.

**Verification:** `bun test src/modules/workspace/GutterDecorations.test.ts
src/modules/git/GitDocumentState.test.ts src/modules/ui/OverviewRuler.test.ts && bun
scripts/harness/smoke-diagnostics-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-26

### Workspace and file navigation are separate layers

**Invariant:** If the user navigates, then project/worktree navigation (the outer layer) and
file/buffer navigation (the inner layer) use distinct commands and never share one control;
switching the outer layer restores the inner layer's own state.

**Scope:** Workspace/worktree tabs vs file/editor tabs; the focus toggle between files pane and
editor.

**Mechanism:** `WorkspaceSet` owns the outer tab set; each `Workspace` owns its inner
`OpenBufferSet` and editor state. `Bootstrap.ts` resolves every live command and status read through
`WorkspaceSet.active`; `RootView.ts` mounts separate workspace and buffer `TabStrip` instances.

**Generates:** the two-tab-layer UI; separate `workspace.*` vs `editorTab.*` commands;
per-workspace state restoration on switch.

**Evidence:** `WorkspaceSet.ts`; `Bootstrap.ts` active-workspace reads; `RootView.ts`
`workspace-tab-strip` and `editor-tab-bar`; `WorkspaceSet.test.ts` state-restoration test;
`scripts/smoke-workspace-tabs.sh` switches roots and checks tree/git/editor projection.

**Impossible if true:** one shortcut that switches both layers depending on focus; switching a
workspace that loses that workspace's open file and cursor state.

**Verification:** `bun test src/modules/workspace/WorkspaceSet.test.ts && bash scripts/smoke-workspace-tabs.sh`

**Status:** provisional

**Last refined:** 2026-07-21

### N open workspaces do not cost N live GitWatchers

**Invariant:** If N project workspaces are open, then only the active workspace owns a live
`GitWatcher`; inactive workspaces keep resumable model state without filesystem watch handles.

**Scope:** `WorkspaceSet` activation, switching, closing, and disposal; the source-control
workspace contribution and its `GitWatcher`. Dirty editor buffers are governed separately by the
document flyweight record.

**Mechanism:** `WorkspaceSet.activate` calls generic workspace suspension before changing the
active index and generic resumption afterward. `GitWorkspace.suspended` disposes and clears its
watcher; `GitWorkspace.resumed` constructs one watcher for the newly active root.

**Generates:** one live project watcher; cold inactive workspace roots; watcher disposal on project
switch and close.

**Evidence:** `WorkspaceSet.ts`; `Workspace.ts` contribution lifecycle; `GitWorkspace.ts`;
`WorkspaceSet.test.ts` "N open workspaces keep exactly one live GitWatcher";
`scripts/smoke-workspace-tabs.sh` `liveGitWatcherCount` assertions.

**Impossible if true:** two open workspaces both reporting a live `GitWatcher`; an inactive root
retaining filesystem watch handles after a workspace-tab switch.

**Verification:** `bun test src/modules/workspace/WorkspaceSet.test.ts -t "N open workspaces keep exactly one live GitWatcher" && bash scripts/smoke-workspace-tabs.sh`

**Status:** provisional

**Last refined:** 2026-07-21

### Workspace activation is view-only

**Invariant:** If the active workspace changes, then its first frame is independent of repository
size: it does not await the `GitWatcher` walk or `GitRepository.refresh`, and activation ignore-query
subprocesses scale with retained directory depth rather than directory count.

**Scope:** `WorkspaceSet.activate`, generic workspace contribution resumption,
`GitWorkspace.activateResources`, the initial watch-set establishment in `GitWatcher`, and the
source-control status projection. Runtime-created directory events are outside the activation
counters.

**Components:**
- *The switched view paints first* — watcher traversal and repository refresh begin only after the
  synchronous activation path returns.
- *Ignore queries follow depth* — every breadth-first directory level contributes at most one bulk
  `git check-ignore -z --stdin` subprocess, regardless of that level's width.

**Mechanism:** `Bootstrap` supplies `WorkspaceSet.awaitNextViewPaint`, a promise resolved by the
renderer's next completed frame. `GitWorkspace.activateResources` gives that same barrier to
`GitWatcher` and awaits it before `GitRepository.refresh`. After the barrier,
`walkAndWatchByLevel` gathers all candidate children at one depth, awaits one bulk
`Processes.run` ignore query, prunes ignored directories, and yields before descending.

**Generates:** View-only workspace switching; asynchronous Git panel convergence; the
`gitWatcherActivationIgnoreQuerySubprocessCount`,
`gitWatcherActivationWatchedDirectoryCount`, and `gitWatcherActivationCompleted` harness fields.

**Rejected alternatives:** Keep every workspace watcher alive — makes switching cheap by violating
the one-live-watcher resource bound. Move the old walk to a worker — retains directory-count work
and forces watcher events across a message boundary.

**Evidence:** `src/modules/git/GitWorkspace.ts` (`activateResources`);
`src/modules/git/GitWatcher.ts` (`establishWatchSet`, `walkAndWatchByLevel`);
`src/modules/git/GitWatcher.test.ts` activation counters; the tiny-versus-wide fixture and
first-frame assertion in `scripts/harness/smoke-workspace-tabs-harness.ts`.

**Impossible if true:** Two repositories with the same retained directory depth launching
different numbers of activation ignore-query subprocesses solely because one has more
directories; the first switched frame reporting `gitWatcherActivationCompleted: true`; an ignored
subtree contributing watched directories.

**Verification:** `bun test src/modules/git/GitWatcher.test.ts
src/modules/workspace/WorkspaceSet.test.ts && bun
scripts/harness/smoke-workspace-tabs-harness.ts`

**Status:** established

**Last refined:** 2026-07-25

### Tab strip panning never activates tabs

**Invariant:** If a tab strip viewport pans through overflow, then its active tab stays unchanged
until a separate activation action targets a tab.

**Scope:** Both `TabStrip` instances: project workspace tabs and editor buffer tabs; horizontal and
vertical orientations.

**Mechanism:** `TabStrip.pan` mutates only `scrollOffset`; activation remains in
`WorkspaceSet.activate` or `Workspace.activateTab`. `RootView.ts` routes arrow controls only to pan.

**Generates:** overflow arrows that reveal hidden tabs without changing project or file context.

**Evidence:** `TabStrip.ts`; `TabStrip.test.ts` "panning changes only the viewport offset";
`scripts/smoke-tabs.sh`; `scripts/smoke-workspace-tabs.sh`.

**Impossible if true:** clicking an overflow arrow changes `activeWorkspaceIndex` or
`activeBufferIndex`; panning to a hidden tab opens it.

**Verification:** `bun test src/modules/ui/TabStrip.test.ts && bash scripts/smoke-tabs.sh && bash scripts/smoke-workspace-tabs.sh`

**Status:** provisional

**Last refined:** 2026-07-21

### The file tree costs only what is expanded and visible

**Invariant:** If the project tree is large, then only expanded directories are listed and only
the visible window is rendered — cost is O(expanded + viewport), never O(total files).

**Scope:** `FileTree` listing, expansion, and row materialization.

**Mechanism:** lazy directory reads cached in a `Map`, expansion tracked in a `Set`, flattened
rows as a plain getter, viewport-sliced at render. Realizes *Cost tracks the actively observed
set*.

**Generates:** lazy expansion; windowed tree rendering; flat cost as the repo grows.

**Evidence:** `FileTree.ts` — lazy `Set`/`Map`, viewport slice in `RootView.ts:143`; tested
("cost only on expand"). Upheld. Nit: collapsed-directory listings are not evicted from the
cache (minor unbounded growth).

**Impossible if true:** listing or materializing a row for every file in the project to show one
screen of the tree.

**Verification:** a test asserting listing calls happen only on expand and rendered rows are
bounded by sidebar height.

**Status:** provisional

**Last refined:** 2026-07-21

### N open tabs do not cost N live documents

**Invariant:** If N editor tabs are open, then the number of LIVE documents (with an in-memory text
buffer + undo history) is bounded by the active buffer plus any DIRTY background buffers — clean
background tabs are dehydrated to a light handle (path + cursor/scroll) and rehydrated on
activation. Memory cost tracks the actively-edited set, not the tab count.

**Scope:** `OpenBufferSet` — the editor-layer buffer set behind the tab bar; its open/focus,
dehydrate, and rehydrate discipline. Excludes workspace/project tabs (a separate layer).

**Mechanism:** Opening a file ADDS or FOCUSES a buffer (never replaces). On deactivation a clean
buffer is disposed to a handle; a dirty buffer stays live so unsaved edits survive. Activation
rehydrates the handle from disk + restores the saved cursor/scroll. Realizes *Cost tracks the
actively observed set*.

**Generates:** memory-safe many-tab sessions; the flyweight tab model; dirty-edit preservation
across tab switches.

**Evidence:** `src/modules/workspace/OpenBufferSet.ts` (flyweight + dispose discipline; the active
+ dirty-background live set); `Workspace.test.ts` (flyweight keeps live docs < tab count).

**Impossible if true:** every open tab holding a live document + undo stack regardless of activity;
a clean background tab consuming a full buffer; a dirty background tab losing its unsaved edits on
deactivation.

**Verification:** a test opening more tabs than the live-document budget and asserting the live-set
size stays bounded by active + dirty.

**Status:** provisional

**Last refined:** 2026-07-21
