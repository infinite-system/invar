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

**Invariant:** If a line mark is painted in the editor gutter or as an underline, then it was
contributed for the visible document's stable handle through `GutterDecorations`.

**Scope:** The editor gutter contribution registry, repository diff marks, language diagnostics,
and `EditorPaneRenderer`.

**Mechanism:** `Workspace` registers language diagnostics and plugins register their own
`GutterDecorationContribution`; the renderer requests the combined projection using only
`Workspace.activeDocumentHandle`.

**Generates:** One per-document decoration vocabulary for both source-control changes and language
diagnostics; deterministic priority when marks share a line.

**Evidence:** `GutterDecorations.ts`; `Workspace.ts` `languageDecorationsByLine`;
`GitDocumentState.ts`; `EditorPaneRenderer.ts`.

**Impossible if true:** The renderer reaching into either a repository-specific diff map or an
LSP-specific diagnostics map; a contribution returning marks without a document handle.

**Verification:** `bun test src/modules/workspace/GutterDecorations.test.ts
src/modules/git/GitDocumentState.test.ts && bash scripts/smoke-gutter-diff.sh`.

**Status:** established

**Last refined:** 2026-07-26

### The editor surface answers capabilities, not plugin modes

**Invariant:** If host behaviour depends on what occupies the editor surface, then the host asks the
occupying contribution a CAPABILITY question it can answer without being named — never "which plugin
surface is showing"; and a contribution that occupies the surface releases its own state, which the
host never writes.

**Scope:** `EditorSurfaceClaims` and every host site whose behaviour changed while a transient
surface was up: the six language-intelligence requests, the two content-type routers
(`activeFileIsMarkdown`, `activeFileIsImage`), `Workspace.editor`, the source-editor paint and
chrome (`EditorPaneRenderer`, `EditorPane` bracket match, the buffer tab strip and breadcrumb,
`AppStatusProjection` bracket fields), and editor-context key routing in `Bootstrap`. Excludes what
the surface itself paints, which is `EditorSurfaceContents`' business.

**Components:**
- *Presentation* — `activeDocumentIsPresented`: is the active tab's document still the text on
  screen? A comparison answers no; a source|preview split answers YES, because the real editor is
  embedded in its left pane.
- *Keyboard ownership* — `activeDocumentIsKeyboardTarget`: does the active tab's editor own the keys
  and the caret? Omitted answers the same as presentation. Its two consumers are the comparison
  (which omits it and so takes the keyboard with the text) and the Markdown split (which answers by
  which of its own panes has focus) — the second was IDENTIFIED before the question was added and
  landed with the Markdown extraction. Were a future refactor to leave it with one consumer again,
  fold it back into presentation rather than keep a question only one surface can answer.

**Mechanism:** Contributions register an `EditorSurfaceClaim` on `Workspace.editorSurfaces`. Both
aggregate getters default to TRUE with no claim up, so a plugin-free canvas keeps every capability.
Host guards read the aggregate; dismissal (`openFileInTab`, `activateTab`, `cycleTab`, a surface's
own Escape) calls `releaseOccupying()`, and each claim tears down its own transient state.

**Generates:** One question where fourteen `showingDiff` mode checks stood; a surface that occupies
the column WITHOUT suppressing language intelligence (impossible to express while the question was
"is a diff showing"); a document-less editor shared by the empty state and any presenting surface,
replacing two identical empty editors; plugin state the host cannot write.

**Rejected alternatives:** Keep the mode flag and rename it (`activePaneIsDiff ||
activePaneIsMarkdownPreview`) — the same defect with more names, and every new surface edits every
caller. Split presentation and language intelligence into separate questions now — no current
customer distinguishes them, so it would be a port with no second answer; the image router will be
the site that decides it.

**Evidence:** `EditorSurfaceClaims.ts`; `EditorSurfaceClaims.test.ts` (the embedding claim reported
as presented while occupying, the omitted-answer default, release touching only occupying claims);
`MarkdownWorkspace.ts` + `MarkdownWorkspace.test.ts` (the embedding claim in the real tree: presented
while occupying, keyboard answer following the focused pane, and a release that keeps its per-tab
state because the claim is DERIVED from the active tab rather than stored);
`Workspace.ts` (the six language guards, both content-type routers, `get editor`, the three
dismissal sites); `Workspace.test.ts` "opening a real file releases a contributed surface";
`GitWorkspace.ts` (the comparison claim); `GitComparisonContent.test.ts` (Escape releases the claim
rather than mutating host state).

**Impossible if true:** A host guard naming a plugin's surface; a plugin's transient state written
by the host; a claim whose occupancy is computed FROM the aggregate it feeds (self-referential, and
caught as a real recursion when the Markdown claim first tried it); a surface that embeds the real editor losing completions, hover, or diagnostics; a
newly contributed surface requiring an edit to any language-request guard.

**Verification:** `bun test src/modules/workspace/EditorSurfaceClaims.test.ts
src/modules/workspace/Workspace.test.ts src/modules/git/GitComparisonContent.test.ts && bash scripts/conventions-gate.sh`

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
