# Workspace — Invariants

Load-bearing rules for `src/modules/workspace/` (`WorkspaceSet`, `Workspace`) and the
shared project/editor tab boundary. Stands on `project.invariants.md`.

## Reality-based invariants

_None specific to the workspace — it consumes the project reality invariants (bounded viewport;
a referenced resource stays alive) rather than adding its own._

## Chosen invariants

### Language services coexist by document

**Invariant:** If several language services are installed, then the host keeps one
`LanguageProviderRouter` and selects the newest registered service that supports the subject
document; a service for one extension cannot shadow a peer that supports another extension.

**Scope:** Host-facing language requests and `DocumentLanguageService` registrations. Structure
and syntax use their own consumer-owned sources through the same registry.

**Mechanism:** The router enumerates `document-language-service` registrations newest first and
calls the selected service through the provider-neutral language contract. Each service owns its
client and lifecycle. The router owns neutral values when no service supports the document.

**Generates:** `DocumentLanguageService`; `LanguageProviderRouter`; one permanent host-facing
`language` provider per workspace; per-service registration and withdrawal.

**Rejected alternatives:** Resolving only the newest `language` provider, which lets an unrelated
service shadow TypeScript; putting language-extension rules in the router, which couples the host
to provider policy.

**Evidence:** `DocumentLanguageService.interface.ts`; `LanguageProviderRouter.ts`; `Workspace.ts`;
`../lsp/LspWorkspaceProvider.ts`; `LanguageProviderRouter.test.ts`.

**Impossible if true:** Installing a service for `.alt` makes TypeScript hover stop working;
uninstalling one service disposes a peer client; the router checks a concrete language extension.

**Verification:** `bun test src/modules/workspace/LanguageProviderRouter.test.ts
src/modules/lsp/LspWorkspaceProvider.test.ts`.

**Status:** provisional

**Last refined:** 2026-07-29

### Document identity survives document instance replacement

**Invariant:** If a logical open document is dehydrated and later rehydrated, then every document
lifecycle event and replacement view use the same stable `DocumentHandle`; document-adjacent state
stays on that handle, and contributions key document state by it rather than by one
workspace-global active-document slot.

**Scope:** `OpenBufferSet`, `DocumentHandle`, `DocumentFoldState`,
`SourceTextView.attachFoldState`, `DocumentLifecycle`, the language-client document sync
contribution, and the source-control head-text contribution.

**Mechanism:** Each `BufferEntry` creates one `DocumentHandle` that outlives its replaceable editor
document. Hydration attaches the current document instance, deactivation detaches it, and
`DocumentLifecycle` broadcasts opened, became-active, and closed with the handle. The handle owns
the document-line fold set, and `Workspace.createBufferSet` attaches that same set to every
replacement `SourceTextView`.

**Generates:** Per-document contribution state and collapsed fold regions that survive flyweight
replacement; one lifecycle vocabulary shared by language sync and repository head tracking.

**Evidence:** `DocumentHandle.ts`; `DocumentLifecycle.ts`; `OpenBufferSet.ts`;
`DocumentFoldState.interface.ts`; `Workspace.ts` (`attachFoldState`);
`OpenBufferSet.test.ts` (`document fold state survives rehydration and is dropped on close`);
`GitDocumentState.ts`; `GitDocumentState.test.ts`; the compile-time unkeyed-projection rejection
in `GitWorkspace.test.ts`.

**Impossible if true:** The stale-head cross-document bug class: a head-text result stored in one
workspace-global active slot and then projected onto a different document after a tab switch. A
collapsed region disappearing when a clean view is dehydrated and rebuilt is also impossible.

**Verification:** `bun test src/modules/git/GitDocumentState.test.ts
src/modules/workspace/OpenBufferSet.test.ts`.

**Status:** established

**Last refined:** 2026-07-29

### One provider creates every workspace buffer view

**Invariant:** If a workspace holds a buffer, then that buffer is a DOCUMENT plus a VIEW: the
document lives on the buffer's stable `DocumentHandle` and answers every language request, and the
view came from this workspace's single injected `SourceTextViewProvider`. The host never names,
constructs, or asserts the class behind that provider.

**Scope:** `Workspace` buffer creation and disposal, the empty document-less view, the six
language-intelligence requests, the content-type router, and the global word-wrap and code-folding
attachments. `OpenBufferSet`'s flyweight discipline is governed separately by *N open tabs do not
cost N live documents*.

**Components:**
- *Documents answer document questions* — sync, hover, completion, diagnostics, go-to-definition,
  the image router, and reference resolution read `buffers.activeDocumentHandle.document`. Only the
  CARET fallback of go-to-definition reads the view, because a caret is view state.
- *One creator* — `createBufferSet`'s `createBuffer` seam is the sole source of a buffer view, and
  it records what it made in `viewsByLiveBuffer`. Every later seam reads that map, so no site has
  to assert what a buffer is.
- *Lazy provider* — the provider resolves on first use, so a workspace built only to carry
  contributions (source control, language, file tree) needs no view at all.
- *One releaser* — `releaseSourceTextViews` releases every view the provider made, through the
  buffer set's own dehydration, plus the empty view, and leaves the documents and the open tabs
  alone. One creator needs one release path, or withdrawing the pane that shows these views leaves
  live views behind — the orphaned-pane defect #114 found for runtimes, one layer down. A released
  tab rebuilds its view on its next activation, so the release is reversible and an uninstalled
  editor can be reinstalled.
- *A release goes through the buffer set, not around it* — the release never disposes a buffer view
  directly. The set owns hydration state, and an entry left pointing at a disposed buffer is a tab
  that can never be shown again. For the same reason a DIRTY entry keeps its buffer: unsaved edits
  live in the view and nowhere else, which is the rule the eviction path already obeys.
- *A release keeps the provider* — the provider carries the per-workspace contribution registry that
  OTHER contributions attached to (`InlineRewriteWorkspace` registers into it). Dropping it on the
  withdrawal of one pane would silently unregister contributions that pane does not own.

**Mechanism:** `WorkspaceOptions.createSourceTextViews` supplies the provider, lazily, on first
use; `src/modules/editor/EditorSourceTextViews` is the one implementation, and `Bootstrap` is the
one place that names it. `Workspace.editor` returns the `SourceTextView` seam, so a host site that
needs more than the contract fails to compile instead of reaching through it.

**Generates:** A workspace that serves language requests with no view built; a source-text view
that is replaceable per workspace; the conventions-gate rule that `src/modules/workspace/` never
imports `../editor/`.

**Rejected alternatives:** Cast `buffers.activeBuffer` to the editor at each use — the rule "this
seam is the sole creator" then lives only in a comment beside five casts, and the language requests
depend on a view to answer a document question. Keep constructing the view in the workspace and
only move the type — the construction IS the coupling.

**Evidence:** `Workspace.ts` (`sourceTextViews`, `createSourceTextView`, `viewsByLiveBuffer`,
`languageRequestDocument`); `SourceTextView.interface.ts`;
`src/modules/editor/EditorSourceTextViews.ts` + `EditorSourceTextViews.test.ts`;
`Workspace.test.ts` ("language requests read the document on the handle, never a view", "a
workspace with NO view provider is legal until a view is actually needed", "one creator, one
disposer", "one releaser frees every view the provider made"); conventions-gate rule 1.53.

**Impossible if true:** A host file naming `Editor`; a language request answered through a view; a
buffer view the workspace did not create or does not release; two contribution registries in one
workspace.

**Verification:** `bun test src/modules/workspace/Workspace.test.ts
src/modules/editor/EditorSourceTextViews.test.ts && bash scripts/conventions-gate.sh`

**Status:** provisional

**Last refined:** 2026-07-29

### Gutter marks come from document scoped contributions

**Invariant:** If a line mark is painted in the editor gutter, body, or overview, then it came from
one cached `GutterDecorations` snapshot for the visible document's stable handle.

**Scope:** The editor gutter contribution registry, repository diff marks, language diagnostics,
`EditorPaneRenderer`, `OverviewRuler`, and `ScrollbarSync`.

**Mechanism:** Providers and contributors register their own
`GutterDecorationContribution`. `GutterDecorations.snapshotFor` combines them
once per contribution or document revision and returns the same snapshot
identity until either changes; the gutter, in-body underline, and overview
renderers project that snapshot instead of recomputing marks.

**Generates:** One per-document decoration vocabulary for source-control changes and language
diagnostics; one recompute shared by the visible-row and whole-document projections.

**Evidence:** `GutterDecorations.ts`;
`src/modules/lsp/LspWorkspaceProvider.ts` (`byLine`);
`GitDocumentState.ts`; `EditorPaneRenderer.ts`; `OverviewRuler.ts`; snapshot identity tests in
`GutterDecorations.test.ts` and `OverviewRuler.test.ts`.

**Impossible if true:** The gutter and overview computing separate line-mark maps; a contributor
returning marks without a document handle; unchanged marks causing a whole-document aggregation on
every frame.

**Verification:** `bun test src/modules/workspace/GutterDecorations.test.ts
src/modules/git/GitDocumentState.test.ts src/modules/ui/OverviewRuler.test.ts && bash
`scripts/harness/smoke-diagnostics-harness.ts`.

**Status:** established

**Last refined:** 2026-07-26

### The editor surface answers capabilities, not plugin modes

**Invariant:** If host behaviour depends on what occupies the editor surface, then the host asks the
occupying contribution a CAPABILITY question it can answer without being named — never "which plugin
surface is showing"; and a contribution that occupies the surface releases its own state, which the
host never writes.

**Scope:** `EditorSurfaceClaims` and every host site whose behaviour changed while a transient
surface was up: the six language-intelligence requests, the content-type router
(`Workspace.activeFileIsImage`, and the markdown plugin's own `previewToggleAvailable`),
`Workspace.editor`, the source-editor paint and chrome (`EditorPaneRenderer`, `EditorPane` bracket
match, the buffer tab strip and breadcrumb, `AppStatusProjection` bracket fields), and
editor-context key routing in `Bootstrap`. Excludes what the surface itself paints, which is
`EditorSurfaceContents`' business, and which marks it may paint there, which is *One mark has one
reserved meaning*.

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
caught as a real recursion when the Markdown claim first tried it); a surface that embeds the real
editor losing completions, hover, or diagnostics; a newly contributed surface requiring an edit to
any language-request guard.

**Verification:** `bun test src/modules/workspace/EditorSurfaceClaims.test.ts
src/modules/workspace/Workspace.test.ts src/modules/git/GitComparisonContent.test.ts && bash scripts/conventions-gate.sh`

**Status:** provisional

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
| `foldOpen` theme slot | The line starts an expanded foldable region | Editor host | Number-gutter edge |
| `foldClosed` theme slot | The line starts a collapsed foldable region | Editor host | Number-gutter edge and folded-line indicator |

All glyph tiers resolve the diff mark to `▎`; the overview pip resolves through
`Theme.glyph('overviewMark')`; diagnostic underlines are cell styles and need no glyph fallback.

**Mechanism:** `EditorLineDecoration` is a discriminated union. Only
`VersionControlLineDecoration` has a gutter projection; only `DiagnosticLineDecoration` has an
underline; both enter `OverviewRuler`. `EditorPaneRenderer` filters the union by owner before
painting the gutter.

**Generates:** A diff-only diff column; fold controls at the number-gutter edge; diagnostic-only
body underlines; a recorded reservation check before any future mark is added.

**Rejected alternatives:** Diagnostic marks in the diff gutter — a red diagnostic and a red
deletion occupied the same column and forced users to guess which meaning one mark carried.

**Evidence:** `src/modules/workspace/GutterDecorations.ts`; `src/modules/ui/EditorPaneRenderer.ts`;
`src/modules/git/GitDocumentState.ts`; `src/modules/theme/ThemeIcons.ts`;
`src/modules/workspace/GutterDecorations.test.ts`; `scripts/harness/smoke-diagnostics-harness.ts`;
`scripts/harness/smoke-code-folding-harness.ts`.

**Impossible if true:** A diagnostic glyph in the gutter; a fold control in the diff column; a
deletion drawn as `_` or `▁`; one gutter shape meaning both version control and language
diagnostics.

**Verification:** `bun test src/modules/workspace/GutterDecorations.test.ts
src/modules/git/GitDocumentState.test.ts src/modules/ui/OverviewRuler.test.ts
src/modules/theme/ThemeIcons.test.ts && bun scripts/harness/smoke-diagnostics-harness.ts && bun
scripts/harness/smoke-code-folding-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-26

### Workspace and file navigation are separate layers

**Invariant:** If the user navigates, then project/worktree navigation (the outer layer) and
file/buffer navigation (the inner layer) use distinct commands and never share one control;
switching the outer layer restores the inner layer's own state.

**Scope:** Workspace/worktree tabs vs file/editor tabs.

**Mechanism:** `WorkspaceSet` owns the outer tab set; each `Workspace` owns its inner
`OpenBufferSet` and editor state. `Bootstrap.ts` resolves every live command and status read through
`WorkspaceSet.active`; `RootView.ts` mounts separate workspace and buffer `TabStrip` instances.

**Generates:** the two-tab-layer UI; separate `workspace.*` vs `editorTab.*` commands;
per-workspace state restoration on switch.

**Evidence:** `WorkspaceSet.ts`; `Bootstrap.ts` active-workspace reads; `RootView.ts`
`workspace-tab-strip` and `editor-tab-bar`; `WorkspaceSet.test.ts` state-restoration test;
`scripts/smoke-workspace-tabs.sh` switches roots and checks contributed-pane/editor projection.

**Impossible if true:** one shortcut that switches both layers depending on focus; switching a
workspace that loses that workspace's open file and cursor state.

**Verification:** `bun test src/modules/workspace/WorkspaceSet.test.ts && bash scripts/smoke-workspace-tabs.sh`

**Status:** provisional

**Last refined:** 2026-07-21

### Each workspace owns one panel world

**Invariant:** If more than one workspace is open, then each workspace owns one independent
bottom-panel content set. Selecting a workspace projects only that set. A hidden workspace keeps
its terminal processes, agent sessions, task processes, scrollback, transcript, layout, visibility,
and focus selection alive. Selecting it again restores that exact world.

**Scope:** `WorkspaceSet` activation, opening, closing, and disposal; the bottom `PanelHost`;
runtime-created panes, declared task panes, and agent panes in `Bootstrap`. Dock GEOMETRY — both
docks' visibility and width, the right dock's content, and the bottom panel's height — is scoped by
*Layout slot sizes are workspace scoped* (`src/modules/layout/layout.invariants.md`), which reaches
the dock hosts through their own workspace contribution. Dock MEMBERSHIP stays shared: a dock's
contents are singleton views that project whichever workspace is active.

**The complete workspace-scoped set.** Every row travels with the workspace; nothing else does.
Each row names the module that owns it, so a new scoped value is a new contribution rather than a
new line in a central snapshot.

| State | Owner | Scoped by |
| --- | --- | --- |
| Bottom-panel pane membership, order, visibility, focus, expansion, active pane, split layout, focused cell, spaces, pane-list expansion | `PanelHost` | `PanelContentSet` per workspace |
| Terminal, agent, and task pane sessions with their scrollback and transcripts | `PaneRuntimes` | the same content set |
| Primary-dock visibility and width; right-dock visibility, content, and width; bottom-panel height | `LayoutSlots` | `WorkspaceLayout` contribution |
| Which content the primary dock shows, and whether focus is the editor or the primary pane | `Workspace` | `focus`, `primaryPaneContentIdentifier` |
| Open editor tabs, active tab, cursor, selection, scroll offsets, folds, dirty buffers | `OpenBufferSet`, `DocumentHandle` | per-workspace instances |
| File-tree expansion, selection, and scroll | `FileTreeWorkspace` | per-workspace contribution |
| Source-control model state and its watcher | `GitWorkspace` | per-workspace contribution |
| Language-client documents and diagnostics | `LspWorkspaceProvider` | per-workspace contribution |

**Application preferences are NOT workspace state** and stay shared by every workspace: theme, glyph
and graphics tier, word wrap, indent guides, reduced motion, scroll physics, scrollbar thickness,
activity-bar visibility on either side, sidebar position, panel alignment, both dock vertical spans,
workspace-tab position, panel content order, activity-bar order, panel tab cycling, and every agent
and narration setting. Transient overlays — find, go to line, quick open, the command palette, the
settings panel, context menus, popups, and the quit confirmation — are application-modal by design
and are dismissed rather than carried.

**Components:**
- *Isolation* — a pane identifier owned by workspace A is never registered or visible in workspace
  B's selected content set.
- *Restoration* — A to B to A restores A's exact registered identifiers and panel projection state.
- *Local creation* — Add, terminal toggle, agent toggle, and task launch register only in the
  selected workspace's content set. Instance labels start locally at Terminal or Agent in each
  workspace, while their opaque identifiers remain application-unique.
- *Retained hidden sessions* — changing workspaces changes projection ownership without disposing
  any pane in the world that becomes hidden.
- *Owned disposal* — closing a workspace activates a surviving neighbour and then disposes only the
  closed workspace's content set. Runtime withdrawal releases that runtime's panes from every
  workspace world. App disposal releases every remaining world.

**Mechanism:** `WorkspaceSet` publishes synchronous active-workspace and disposed-workspace
lifecycle events. `Bootstrap` maps each `Workspace` to one `PanelContentSet`, selects that set before
the new workspace calls its contributors, and disposes it after workspace close. `PanelHost` keeps
one stable reactive projection while snapshotting and restoring each content set's registry, order,
visibility, focus, expansion, active identifier, split layout, and focused cell. `PaneRuntimes`
allocates instance numbers per workspace scope.

**Generates:** Parallel terminal and agent worlds; task panes that do not double when another folder
opens; A to B to A scrollback and transcript restoration; workspace-local Add behavior; bounded
workspace-close cleanup without disturbing a surviving world.

**Evidence:** `src/modules/workspace/WorkspaceSet.ts`; `src/modules/ui/PanelHost.ts`;
`src/modules/ui/PaneRuntimes.ts`; `src/modules/app/Bootstrap.ts`;
`src/modules/workspace/WorkspaceSet.test.ts`; `src/modules/ui/PanelHost.test.ts`;
`src/modules/ui/PaneRuntimes.test.ts`; `scripts/harness/smoke-workspace-tabs-harness.ts`;
`scripts/harness/smoke-workspace-layout-isolation-harness.ts` (the geometry rows of the table).

**Impossible if true:** Opening B shows A's task or terminal identifiers; creating Terminal in B
adds it to A; returning to A loses its terminal output or agent transcript; a workspace switch kills
a hidden shell; closing A disposes a pane owned by B; terminal plugin withdrawal leaves a terminal
alive in an inactive workspace world; a row of the table above scoped by a host branch instead of by
the owning module's own contribution.

**Verification:** `bun test src/modules/workspace/WorkspaceSet.test.ts
src/modules/ui/PanelHost.test.ts src/modules/ui/PaneRuntimes.test.ts
src/modules/terminal/TerminalPlugin.test.ts && bun
scripts/harness/smoke-workspace-tabs-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-29

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

### N open tabs do not cost N live documents

**Invariant:** If N editor tabs are open, then live clean documents are bounded by the two most
recently active buffers, dirty background buffers remain live outside that budget, and reactivating
either recent buffer performs zero full-document reads.

**Scope:** `OpenBufferSet` — the editor-layer buffer set behind the tab bar; its open/focus,
dehydrate, and rehydrate discipline. Excludes workspace/project tabs (a separate layer).

**Components:**
- *Recent interaction window* — `MAXIMUM_RECENTLY_ACTIVE_HYDRATED_DOCUMENTS` keeps the two-entry
  compare-and-edit working set live, so switching within it never calls `createBuffer`.
- *Bounded storage* — adding a third clean document evicts the least-recent entry to its
  path-and-position handle; suspending a workspace dehydrates its clean recent entries.
- *Dirty retention* — unsaved buffers remain live even after they leave the recent window.

**Mechanism:** `OpenBufferSet.retainRecentlyActive` updates a constant-size most-recent list and
calls `dehydrateIfClean` only for entries that leave it. `activate` reuses a live entry and calls
`hydrate` only on a cache miss. `createBuffer` is the sole path to `Editor.openFile`, so zero
creations means zero full-document reads.

**Generates:** Free alternation between the two most recent files; memory-safe many-tab sessions;
the flyweight tab model; dirty-edit preservation across tab switches.

**Rejected alternatives:** Keep only the active document hydrated — every clean tab round trip
re-runs `TextDocument.loadFromFile`, making a tab-switch interaction scale with file size. Keep every
tab hydrated — memory scales with tab count.

**Evidence:** `src/modules/workspace/OpenBufferSet.ts`;
`src/modules/workspace/OpenBufferSet.test.ts` (10-line and 500,000-line switch cycles both read zero
documents; the one-document positive control reads six);
`src/modules/workspace/Workspace.test.ts` (four clean tabs retain two live documents);
`scripts/harness/smoke-bounded-list-popup-harness.ts` (103 clean tabs retain two live documents);
real PTY drives over the 100,000-line and 500,000-line shared fixtures.

**Impossible if true:** every open tab holding a live document + undo stack regardless of activity;
a reactivation within the two-document recent window calling `createBuffer` or
`TextDocument.loadFromFile`; live clean document count growing beyond two; a dirty background tab
losing its unsaved edits on deactivation.

**Verification:** `bun test src/modules/workspace/OpenBufferSet.test.ts
src/modules/workspace/Workspace.test.ts`; drive the 100,000-line and 500,000-line shared fixtures,
open two files, and alternate with `Control+Tab` while `bufferLiveCount` remains 2.

**Status:** established

**Last refined:** 2026-07-28
