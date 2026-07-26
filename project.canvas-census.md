# Pure-Canvas Census — everything the host still knows

Product-owner direction (2026-07-26): *"Workspace still has references to diff state, and also
markdown … so Workspace decoupling has to continue to make Workspace a pure container for
different plugins"*, *"analyze Workspace holistically to make it pure canvas for plugins"*,
*"FileTree is also a separate plugin, so please decouple everything so everything is modular and
composes like legos"*.

This document turns "decouple everything" into a **finite, ordered list**. It is the inventory the
next builder reads instead of rediscovering the surface one domain at a time.

Baseline commit: `2751b32`. **Status: steps 1, 2 and 3 are DONE** (the editor-column occupant port
with its capability answers, the diff extraction, and the markdown extraction) — see
[Progress](#progress). Host files audited:
`src/modules/workspace/Workspace.ts` (922 lines), `src/modules/workspace/WorkspaceSet.ts`,
`src/modules/app/` (the app core the conventions gate's step-11 boundary covers), and
`src/modules/ui/` (the host chrome, *not* covered by step 11 today).

## How to read a row

Every site is classified by **KIND**:

| Kind | Meaning |
| --- | --- |
| `CONSTRUCT` | the host builds a domain object (`new X`, a `createX()` seam) |
| `STATE` | the host owns a reactive field/getter holding domain state |
| `METHOD` | the host implements domain behaviour |
| `GUARD` | host behaviour is conditioned on a domain's **mode** — the defect class |
| `TYPE` | a type-only import or an interface field naming a domain |
| `PROSE` | a comment or `// invariant:` annotation only — zero runtime coupling |

And by **verdict**: `SPECIFIC` (real coupling) or `GENERIC` (already a domain-neutral contract that
merely *reads* domain-shaped, with the evidence for that claim). Miscounting `GENERIC` as coupling
inflates the work; the counts below separate them.

A port is only listed as **justified** when **two independent customers** exist. One customer is
recorded as `GUESS` and must not be built.

## Contribution ports that exist today (task #34)

1. **Document lifecycle** — `DocumentLifecycle` + `DocumentHandle` (opened / becameActive / closed,
   keyed by a stable handle). Customers: language sync, source-control head text.
2. **Gutter decorations** — `GutterDecorations.byLine(handle)`. Customers: language diagnostics,
   source-control change marks.
3. **Status-bar segments** — `StatusBarSegments.register`. Customers: source control, core.
4. **Panes / popups** — `PaneContent` + `PanelHost` + `registerPrimaryDockContent`; plus
   `StatusProjectionContributions` and `CommandRegistry.registerAll` as the plugin's own command
   channel. Customers: terminal, agent, file tree, source-control panel, extensions panel.

Plus the plugin lifecycle itself: `WorkspacePlugin.attachWorkspace` →
`WorkspaceContribution{opened, settingsAttached?, suspended, resumed, disposed, tickScroll?,
tabDetail?, worktreeName?, projectName?}` and `ApplicationPlugin.activateApplication(context)`.

Ports 5 and 6, added 2026-07-26 by extraction step 1:

5. **Editor-surface capability answers** — `EditorSurfaceClaims` (workspace). Customers: the
   source-control comparison (answers "not presented"), a source|preview split (answers
   "presented"). Governed by the record *The editor surface answers capabilities, not plugin modes*.
6. **Editor-column occupant** — `EditorSurfaceContents` (ui) + `ApplicationPluginContext.
   editorSurfaceContents`. Customers: the source-control comparison today; the Markdown split is
   step 3's customer.

**Still no port for:** **default keybindings** (Gap C). Gap D was resolved without a port — see
below.

---

## Domain 1 — LANGUAGE / LSP (61 matching lines — the largest)

The biggest domain by far, and deeper than git ever was: the host does not merely *reference* the
language client, it **owns its lifecycle and implements six of its request paths**.

### Sites

| Line(s) | Kind | Site | Verdict |
| --- | --- | --- | --- |
| 17-23, 26-29 | TYPE | `LanguageClient`, `LanguageHover`, `LanguageLocation`, `TextDocumentModel`, `TextPosition`, `LanguageCompletionContext`, `LanguageCompletionList` | SPECIFIC — a value import of `LanguageClient`, not type-only |
| 128 | STATE | `languageClientInstance: LanguageClient.Model \| null` | SPECIFIC |
| 129-141 | CONSTRUCT | `createLanguageClient()` — builds the client, late-reads `typescriptServer` + `lspFileSizeLimitKb` | SPECIFIC |
| 142-146 | METHOD | `ensureLanguageClient()` — lazy activation | SPECIFIC |
| 48-52 | METHOD | registers itself on the document-lifecycle port | GENERIC *port use*, SPECIFIC *body* |
| 148-163 | METHOD | `openLanguageDocument` / `activateLanguageDocument` / `closeLanguageDocument` | SPECIFIC |
| 53-55, 165-211 | METHOD | `languageDecorationsByLine` — translates LSP severities into gutter glyph + underline | SPECIFIC |
| 216-221 | METHOD+GUARD | `syncActiveDocumentWithLanguageServer()` | SPECIFIC |
| 229-242 | METHOD+GUARD | `languageSizeNotice()` | SPECIFIC |
| 252-271 | METHOD+GUARD | `goToDefinition()` | SPECIFIC |
| 277-301 | METHOD | `rehopThroughImportSpecifier()` — a typescript-language-server behavioural workaround **inside the host** | SPECIFIC (the worst single site: a vendor quirk in host core) |
| 311-319 | METHOD+GUARD | `hoverAt()` | SPECIFIC |
| 321-335 | METHOD+GUARD | `completionAt()` | SPECIFIC |
| 337-339 | METHOD | `completionTriggerCharacters()` | SPECIFIC |
| 343-376 | METHOD+GUARD | `diagnosticsAt()` | SPECIFIC |
| 379-403 | METHOD | `jumpToLocation()` | GENERIC — pure "open a path + place the cursor"; only its `LanguageLocation` parameter type is domain-shaped |
| 550-551, 565-566 | METHOD | client disposal in `suspendOwnedResources` / `dispose` | SPECIFIC |
| 904-908 | TYPE | `HoverDiagnostic` interface | SPECIFIC |

### Verdict and the blocker

**`GENERIC`: 1 site (`jumpToLocation`). `SPECIFIC`: the rest.** Language is real coupling, and it is
the deepest.

**But it is currently CONTRACTED coupling, not drift.** `project.invariants.md` → *The host canvas
is complete without plugins* states the host canvas provides "workspaces, files, editing,
**language intelligence**, **Markdown**, panes, popups, commands, and status contributions". Both
LSP and Markdown are *named as host-canvas capabilities by a recorded invariant*.

So extracting language is **not a refactor decision, it is a contract renegotiation** and needs the
owner's word. Extracting Markdown (which the owner has now explicitly directed) already refines
that record; see [Contract consequences](#contract-consequences).

### Port needed

A **language-provider plugin** needs ports 1 (document lifecycle) and 2 (gutter decorations) —
both already exist and it is already their customer — plus a new **semantic-request port**:
the host must be able to ask "definition / hover / completion / diagnostics at this position"
without naming LSP.

Two customers? Today: **one** (`LanguageClient`). The `LanguageProvider.interface.ts` file exists,
which suggests the abstraction was anticipated — but a second provider does not exist.
→ **`GUESS` until a second provider (or a non-LSP intelligence source) exists.** Do not build the
semantic-request port speculatively; extract the *client lifecycle* first (ports 1 + 2 already
cover it) and leave the six request methods as the host's single provider until a second arrives.

---

## Domain 2 — FILE TREE (33 matching lines)

### Sites

| Line(s) | Kind | Site | Verdict |
| --- | --- | --- | --- |
| 3 | TYPE | `import { FileTree } from './FileTree'` (value import) | SPECIFIC |
| 65 | STATE | `tree = this.createTree()` | SPECIFIC |
| 84-86 | CONSTRUCT | `createTree()` seam | SPECIFIC |
| 539 | METHOD | `this.tree.open(root)` inside `open()` | SPECIFIC |
| 606-628 | METHOD | `impulseTreeScroll`, `impulseTreeHorizontalScroll`, `haltTreeScroll`, `haltTreeHorizontalScroll` | SPECIFIC — four host methods that exist only to forward momentum to one pane |
| 667-684, 694-695 | METHOD | the tree's two momentum lanes inside `tickScrollAnimations` | SPECIFIC |
| 702-711 | METHOD | `activate()` — `tree.activateSelected()` → `openFileInTab` | SPECIFIC |
| 524 | STATE | `worktreeName` — matches the grep on the word "tree" only | GENERIC — unrelated to `FileTree`; it is the source-control worktree label already fed by `WorkspaceContribution.worktreeName?()` |
| 41, 74, 673 | PROSE | comments | — |

### Verdict

**One `GENERIC` false positive (`worktreeName`); the rest is real.** The tree's *view* is already
decoupled — `src/modules/ui/FileTreePaneContent.ts` is a `PaneContent` citizen with
`id === 'files'`. What remains in the host is the **model** and its **two momentum lanes**.

### Port needed

`tickScrollAnimations` already calls `contribution.tickScroll?.(dtSeconds)` — **port 1-4 already
cover the tree's frame needs.** The blocker is different: the tree is the host's *default* primary
pane (`focus: 'files'`, `primaryPaneContentIdentifier = 'files'`, `focusFiles()`), and
`WorkspaceSet`/`Bootstrap`/`RootView` treat `'files'` as the fallback dock identity.

Two customers for a **"default dock content identity"** port? The source-control pane and the tree
pane both want to be a dock citizen, and the tree additionally wants to be the *fallback*.
`GitPlugin.primaryDockContentIdentifiers = ['git']` already exists as the registration half.
→ **JUSTIFIED**: extend the existing dock registration with a `fallback`/`defaultContent` flag
(customers: file-tree plugin declares it, source control declares it not). This is a one-field
extension of port 4, not a new port.

The four `impulseTree*` / `haltTree*` methods are pure forwarding and become the tree plugin's own
methods once `Bootstrap` routes wheel gestures to the focused dock content (`PaneContent.onWheel?`
already exists and is used by the terminal/agent — the tree's forwarding predates it).

---

## Domain 3 — DIFF (34 matching lines) — **owner-named, extract now**

### Sites — the state the host owns

| Line(s) | Kind | Site | Verdict |
| --- | --- | --- | --- |
| 80 | CONSTRUCT | `protected diffEditor = this.createEditor()` — the host builds an editor **for the diff view** | SPECIFIC |
| 406-408 | STATE | `get showingDiff()` | SPECIFIC |
| 456-458 | STATE | `get diffRequest()` | SPECIFIC |
| 459 | STATE | `protected diffRequestToken = 0` | SPECIFIC |
| 460-464 | METHOD | `showComparison(request)` | SPECIFIC |
| 494 | METHOD | `this.diffEditor.attachWordWrap(...)` in `attachSettings` | SPECIFIC |
| 468-474 | METHOD+GUARD | `get editor()` — routes to `diffEditor` while `showingDiff` | SPECIFIC — this is the *mechanism* the guards below compensate for |
| 916-922 | TYPE | `export interface DiffRequest` | SPECIFIC |
| 79, 90-91, 215, 426, 715, 737, 915 | PROSE | comments | — |

### Sites — the GUARDS (the real coupling)

Eight host methods condition generic behaviour on the diff **mode**:

| Line | Host method | What it does while a diff shows | The question it is really asking |
| --- | --- | --- | --- |
| 217 | `syncActiveDocumentWithLanguageServer()` | `return` | is the active tab's document the live subject? |
| 230 | `languageSizeNotice()` | `return null` | same |
| 253 | `goToDefinition()` | `return false` | same |
| 312 | `hoverAt()` | `return null` | same |
| 325 | `completionAt()` | `return {items:[],isIncomplete:false}` | same |
| 347 | `diagnosticsAt()` | `return []` | same |
| 417 | `activeFileIsMarkdown` | `false` | same |
| 430 | `activeFileIsImage` | `false` | same |

Plus 4 more `showingDiff.value = false; diffRequest.value = null` **writes** at 776-777, 829-830,
838-839 (`openFileInTab`, `activateTab`, `cycleTab`) — the host *dismissing* a plugin's surface.

### The collapse

**All eight guards ask one question**, and it is not "is a diff showing":

> **Does the active tab's document remain the subject of the editor column?**

- A read-only comparison answers **no** — the visible text is not the active buffer.
- A Markdown source|preview split answers **yes** — the real editor is embedded in its left pane.
- A future plugin surface answers for itself; the host never learns its name.

**8 GUARDs → 1 capability question.** That is the reduction. The same question also collapses six
identical mode checks outside `Workspace.ts`:

| File:line | Site | Same question? |
| --- | --- | --- |
| `ui/EditorPane.ts:52` | suppress bracket-match highlight | yes |
| `ui/EditorPaneRenderer.ts:66` | `return null` — yield the gutter/body paint | yes |
| `app/AppStatusProjection.ts:242` | `matchingBracketLine → -1` | yes |
| `app/AppStatusProjection.ts:257` | `matchingBracketColumn → -1` | yes |
| `ui/TabBar.ts:380-382` | breadcrumb pointer controls off | yes |
| `ui/RootView.ts:1346-1354` | blank the tab strip + breadcrumb | yes |

**14 mode checks → 1 question.** Writing `if (activePaneIsDiff || activePaneIsMarkdownPreview)`
anywhere would re-introduce the defect with more names in it.

### Consumers of the diff state outside the host

`showingDiff`: `ui/EditorPane.ts:52`, `ui/EditorPaneRenderer.ts:66`, `ui/RootView.ts:1283,1348`,
`ui/TabBar.ts:382`, `ui/EditorContentMount.ts:92`, `app/AppStatusProjection.ts:166,242,257`,
`app/Bootstrap.ts:1074,1510,2069,2104`, `git/GitWorkspace.ts:230`, plus the status field asserted by
`scripts/smoke-diff-overview.sh`, `scripts/smoke-git-log.sh`, `scripts/behavioral-contracts.sh`,
`scripts/harness/smoke-diff-overview-harness.ts`, `scripts/harness/smoke-git-log-harness.ts`.

`diffRequest`: `ui/EditorContentMount.ts:62`, `app/Bootstrap.ts:2105`.
`showComparison`: **only** `git/GitWorkspace.ts:461,504` — i.e. the producer is already the plugin;
the host is merely the mailbox.

### Where it belongs

`GitWorkspace` (the source-control workspace contribution) already computes both sides of every
comparison (`openCommitFileDiff`, `openChangeAtRow`) and then hands them to the host. Moving
`showingDiff` / `diffRequest` / `diffRequestToken` / `showComparison` / `diffEditor` into
`GitWorkspace` removes the mailbox. `GitWorkspace.ts:230` (`activeLineBlame`) then reads its own
state instead of the host's — one fewer host round trip.

---

## Domain 4 — MARKDOWN (13 matching lines) — **owner-named, extract now**

### Sites

| Line(s) | Kind | Site | Verdict |
| --- | --- | --- | --- |
| 409-413 | STATE | `get markdownPreviewPaths()` — per-path preview mode | SPECIFIC |
| 415-421 | STATE+GUARD | `get activeFileIsMarkdown` — extension test `=== '.md'` **in host core** | SPECIFIC |
| 438-443 | STATE | `get showingMarkdownPreview` | SPECIFIC |
| 445-453 | METHOD | `toggleMarkdownPreview()` | SPECIFIC |
| 785-817 | METHOD | `resolveFileReference(reference)` | **GENERIC** — see below |
| 819-825 | METHOD | `openFileReference(reference)` | **GENERIC** |
| 74, 782-784 | PROSE | comments + the `// invariant: A file reference opens from rendered Markdown` annotation | — |

### The `resolveFileReference` verdict — evidence

`resolveFileReference` contains **no markdown**: it strips a `#`/`?` fragment, rejects any
`scheme:` URL, decodes percent-escapes, and confirms the target exists inside the workspace
confinement boundary (`Files.confineToRoot`) relative to the root *and* to the active document's
directory. That is the host's own **path-confinement** behaviour. Only the doc comment and the
`// invariant:` annotation name Markdown.

Customers: `ui/EditorContentMount.ts:122` (markdown split) — **one**. So it is *not* a port; it is
a generic host method with a single caller today. Correct action: **keep it, reword the comment,
move the `// invariant:` annotation to the markdown module's own call site** (the record lives in
`markdown.invariants.md` and its scope names `MarkdownRenderable`, `MarkdownSplitView`, *and* the
workspace resolver — the annotation belongs where the markdown behaviour is).

Counting it as coupling would inflate the markdown work by ~35 lines of code that has nothing to
do with markdown.

**Real markdown coupling: 4 sites (`markdownPreviewPaths`, `activeFileIsMarkdown`,
`showingMarkdownPreview`, `toggleMarkdownPreview`) — not 13 lines.**

### Consumers outside the host

- `activeFileIsMarkdown`: `ui/TabBar.ts:88`, `ui/TabBarRenderer.ts:351,473,663`,
  `commands/CommandDefaults.ts:205` (`when:`)
- `showingMarkdownPreview`: `ui/TabBar.ts:89`, `ui/TabBarRenderer.ts:475,664`,
  `ui/EditorContentMount.ts:93`, `app/AppStatusProjection.ts:171`
- `toggleMarkdownPreview`: `ui/TabBar.ts:303`, `commands/CommandDefaults.ts:206,286`,
  `app/Bootstrap.ts:1077,1330`
- `markdownPreviewPaths`: `app/Bootstrap.ts:820` (a reactive touch)
- and the **29 `previewFocused` guards** in `Bootstrap.ts` listed under Domain 4b below.

### Domain 4b — the `previewFocused` fan-out (the markdown equivalent of the diff guards)

`app/Bootstrap.ts` asks `view.activeMarkdownSplitView()?.previewFocused` at **29 sites**: every
`editor.*` movement/edit action either routes to the preview (`moveUp`, `moveDown`, `pageUp`,
`pageDown`, `jumpUp`, `jumpDown`, `escape`, `selectAll`) or is suppressed
(`moveLeft/Right`, `lineStart/End`, `wordLeft/Right`, `documentStart/End`, `newline`, `backspace`,
`delete`, `deleteToLineStart`, `deletePreviousWord`, `cut`, `paste`, `undo`, `redo`), plus the
raw-`^A` divert (2055-2065), the typed-character default (2129-2141) and the paste fallback
(2198-2199).

**All 29 ask one question:** *does the plain source editor own the keyboard right now?*
The routed-either-way subset asks a second: *does the focused surface consume this key itself?* —
which is exactly `PaneContent.handleKey(key): boolean`, a port that **already exists** for dock
contents (`Bootstrap.ts:1734-1758`) and has never been offered to the editor column.

`app/Bootstrap.ts:2067-2111` is the same defect for diff: a 45-line inline `switch (key.name)` over
the diff view, ending in the host mutating plugin state directly
(`showingDiff.value = false; diffRequest.value = null`).

**29 + 1 block → 2 questions** (`activeDocumentIsKeyboardTarget`, `handleKey`).

---

## Domain 5 — IMAGE (5 matching lines)

| Line(s) | Kind | Site | Verdict |
| --- | --- | --- | --- |
| 11 | TYPE | `import { ImageDecoders }` (value import) | SPECIFIC |
| 428-436 | STATE+GUARD | `get activeFileIsImage` — `!showingDiff && hasDocument && ImageDecoders.supports(ext)` | SPECIFIC |
| 423-427 | PROSE | comment + `// invariant:` annotation | — |

Smallest domain. Structurally identical to `activeFileIsMarkdown` (its own comment says so:
`image.invariants.md:127` — "`Workspace.activeFileIsImage` mirrors `activeFileIsMarkdown`"), so it
is the **third customer** of whatever answers "does the active buffer's own content type govern the
render". Its render side is already `RootView` + `ImagePreview`; only the routing predicate is in
the host. Note: image is a *content-type router*, not an editor-column occupant — when extracted it
may split the single capability question in two (`presentsActiveDocument` vs
`providesLanguageIntelligence`); do not pre-split for it.

---

## Domain 6 — the remaining bulk is CORE, not coupling

Counted for completeness so nobody mistakes size for debt:

| Word set | Lines | Verdict |
| --- | --- | --- |
| `editor\|buffer\|tab` | 204 | **CORE** — the canvas *is* buffers, tabs and an editor |
| `navigat\|Location\|history` | 67 | **GENERIC** — `NavigationHistory` behind a `createNavigationHistory()` seam; `Location` is `{documentPath,line,column}`, no domain in it |
| `momentum\|scroll` | 61 | **GENERIC** — one `Momentum` engine + `flingMomentum` from settings; the only domain-shaped part is *which* surfaces it drives (tree, editor), covered by Domain 2 |
| `settings\|Settings` | 23 | **GENERIC** — `attachSettings` fans out to `contribution.settingsAttached?()` (port exists) |

---

## Port gaps

Four ports the remaining extractions need. Two were justified and are now BUILT; two are not.

### Gap A — editor-column surface occupant — **BUILT 2026-07-26** (`ui/EditorSurfaceContents.ts`)

Today `ui/EditorContentMount.ts` hard-codes `mounted: 'editor' | 'diff' | 'markdown'`, imports
`DiffView` and `MarkdownSplitView` directly, owns both lifecycles, keys both identities, hard-codes
the precedence rule "diff wins over markdown" (line 92-106), and exposes `diffView` /
`markdownSplitView` getters that 15 `RootView` sites and 15 `Bootstrap` sites read **by name**.
`RootView` constructs two named `BoxRenderable` containers (`diff-container`,
`markdown-container`, lines 280-294) for them.

Customers: **DiffView** (source control) and **MarkdownSplitView** (markdown). A latent third is
`ImagePreview`. → build it.

Shape (subset of the existing `PaneContent` contract, which is the precedent — *don't invent a new
vocabulary*): `identifier`, `active()`, `create(context)` given a definite-size container plus
`{renderer, theme, settings, findBar, keybindings, tooltip}`, then `update()`, `tick(dt)`,
`handleKey(key)`, `findTarget()`, `copySelection()`, `caret()`, `dispose()`, and the capability
answers below. `ApplicationPluginContext` is built *before* `buildRootView`, so the registry must
be created early and the surface **created lazily at mount time** with a view-supplied context.

### Gap B — capability answers about the visible editor surface — **BUILT 2026-07-26** (`workspace/EditorSurfaceClaims.ts`)

Two questions, both derived from guard sites only — nothing invented:

1. `activeDocumentIsPresented` — collapses the 8 `Workspace` guards + 6 identical ui/app checks.
   Diff answers `false`, markdown split answers `true`.
2. `activeDocumentIsKeyboardTarget` — collapses the 29 `Bootstrap` `previewFocused` guards.
   Diff answers `false`, markdown split answers `!previewFocused`.

Markdown answering `true` to (1) is *not* a redundant customer: it is the proof that occupying the
editor column does **not** imply suppressing language intelligence — precisely the conflation
`showingDiff` hid. A single-customer version of this port would be `isDiff` renamed.

Shipped as a workspace-level registry rather than folded into Gap A, because the host's own guards
live in `Workspace` (the model layer) and must not reach into `ui/`. The occupant answers the
questions; `EditorSurfaceClaims` is where it answers them.

Question 2's second customer is still pending: only the comparison answers it today (it omits the
member and inherits question 1's answer). The 29 `Bootstrap` sites that will be its real consumer
land with step 3. **This is the one place in the port whose second answer is owed**, and it is owed
by design, not overlooked — see step 3 below.

### Gap C — plugin default keybindings — **JUSTIFIED (2 customers)**

`keybindings/KeybindingDefaults.ts:273-293` holds the default bindings for `diff.previousChange`,
`diff.nextChange`, `markdown.togglePreview`, `markdown.openHoveredReference` in host core;
`ApplicationPluginContext` has no `keybindings` member at all. Note the *existing* git plugin got
away without this only because its commands are reached from its pane, not from a default chord.
Customers: source control (2 diff chords) and markdown (2 chords). → one-field extension:
expose `keybindings` on `ApplicationPluginContext` (or a `defaultKeybindings` array on
`ApplicationPlugin`).

### Gap D — editor-title action cluster — **RESOLVED 2026-07-26 without a new port**

`ui/TabBarRenderer.ts:351` reserves 3 cells and `471-495` paints the Markdown preview toggle, with
a comment that already calls itself *"Extensible right-side action cluster … exactly where future
editor-view actions can join it"*. `ui/TabBar.ts:301-304` wires the click straight to
`toggleMarkdownPreview()` and `336-345` hard-codes the tooltip + `markdown.togglePreview` hint.

Customers today: **markdown only.** So no new port was built. Instead the EXISTING command contract
gained two optional fields — `editorTitleIcon` (a key into the theme's action-icon set, so the glyph
follows the glyph-level ladder) and `toggled` — plus `CommandRegistry.editorTitleActions()`, which
returns icon-bearing commands filtered by the same guard `all()` uses. `TabBarRenderer` paints one
padded cell per returned command and `TabBar` dispatches the click by `commandId`.

The distinction that makes this legitimate: **a new PORT needs two customers because it is a new
concept the host must learn; extending a contract that already has many customers is a FIELD
ADDITION, and the bar for that is only "does it fit the existing concept".** A command that can be
surfaced as a clickable affordance is still just a command, and it keeps the toggle a single action
— one id, one guard, one binding hint — rather than a button and a command that can drift apart.

**The diff view's "Open current" does NOT fit these fields, and was left alone.**
`diff.invariants.md` → *Base and current stay unambiguous* requires that affordance to be
"positioned with the right pane" and makes "Open current appearing over the base pane" impossible-if-
true. The editor-title row is one strip across the whole column with no pane association, so moving
it there would break the record that makes base and current readable. It stays in `DiffView`'s own
header.

### Not a gap — already generic

- `StatusBarSegmentContext.markdownPreviewFocused` (`ui/StatusBarSegments.ts:35`) is a **domain
  name smuggled into a generic port**, read by `ui/CoreStatusBarSegments.ts:22-23` and passed
  through `ui/StatusBar.ts:325-338`. Fix without a new port: replace it with
  `focusedSurfaceTitle: string | null` — the branch immediately below it
  (`primaryDockHost.activeContent?.title`) already does exactly that generically.
- `ui/EditorPaneRenderer.ts` gutter marks are already domain-neutral
  (`gutterDecorations.byLine` + `'added'|'modified'|'deleted'` colours). Only its `// invariant:`
  annotation names diff.
- `ui/HoverCard.ts:67` (`markdown: 'markdown', diff: 'diff'`) is a fence-language → highlighter-id
  map for LSP hover markup. **Unrelated.** Do not touch.

---

## Contract consequences

`project.invariants.md` → **The host canvas is complete without plugins** currently asserts the host
canvas provides "workspaces, files, editing, language intelligence, **Markdown**, panes, popups,
commands, and status contributions".

Extracting Markdown makes that sentence false as written. This is a **refines**, not a violation:
the record's *mechanism* ("shipped domain capabilities may be default plugins but may not require
host-core knowledge") already anticipates the move — only the enumeration is stale. Markdown must
be struck from the list, and if language is ever extracted, so must "language intelligence".

`src/modules/diff/diff.invariants.md:218` names `Workspace.showingDiff` in the *Scope* of
**Diff selection reuses shared drag behavior**; `src/modules/markdown/markdown.invariants.md:227`
names `Workspace.showingMarkdownPreview` in the Scope of **A Markdown file offers a live source
preview split** and `:268` names `Workspace.resolveFileReference`. All three Scopes must be
restated against the new owners as part of the extraction that moves them.

---

## Extraction order

Ordered by **what unblocks what**, not by size.

### 1. Gap A + Gap B — the editor-column occupant port with capability answers — **DONE**

**First, because every later step reads its answers.** Nothing else could be moved cleanly while
`EditorContentMount` hard-coded three contents and `Bootstrap` routed keys by view name.
Landed as `workspace/EditorSurfaceClaims.ts` (2 capability questions) and
`ui/EditorSurfaceContents.ts` (identity-keyed occupant with update / tick / handleKey / findTarget /
copySelection / observePaintSignals / dispose), the member set derived from the sites that previously
reached a view by name.

### 2. DIFF → source-control plugin — **DONE**

**Second, because its state has exactly one producer** (`GitWorkspace`, already the plugin) and its
14 mode checks all collapse to Gap B's question 1. Lowest risk-per-line of the two owner-named
domains. Moves: `diffEditor`, `showingDiff`, `diffRequest`, `diffRequestToken`, `showComparison`,
`DiffRequest`, the 4 dismissal writes, the `Bootstrap` diff key block, the `CommandDefaults`
`diff.*` entries (via the existing `registerAll` port), the `AppStatusProjection` `diff*` fields
(via the existing `StatusProjectionContributions` port), and `DiffRequest`'s type.
Needs Gap C for the two diff chords.

### 3. MARKDOWN → new markdown plugin — **DONE**

**Third: same port, but 29 extra guard sites and Gap D unresolved.** The port it needs now exists
and has a worked example (`git/GitComparisonSurface.ts` + `git/GitComparisonContent.ts`); the split
becomes a second occupant that answers `activeDocumentIsPresented: true` and
`activeDocumentIsKeyboardTarget: !previewFocused`, which is what supplies question 2's second answer
and collapses the 29 `previewFocused` guards. Moves
`markdownPreviewPaths`, `activeFileIsMarkdown`, `showingMarkdownPreview`, `toggleMarkdownPreview`,
the `markdown.*` commands and chords, the `markdown*` status fields, and
`StatusBarSegmentContext.markdownPreviewFocused` → `focusedSurfaceTitle`.
**Keeps** `resolveFileReference` / `openFileReference` in the host as generic path confinement.
Requires the *The host canvas is complete without plugins* record to be refined.

### 4. IMAGE → image plugin

**Fourth, because it is one predicate** and it is the site that will tell you whether Gap B's
question 1 must split into "presents the active document" vs "provides language intelligence".
Cheap, and it validates the port with a third customer.

### 5. FILE TREE → file-tree plugin

**Fifth: no new port needed** (the view is already a `PaneContent` citizen; `tickScroll?` and
`onWheel?` already exist), but it needs the *fallback dock content* flag and it touches
`focus: 'files'` / `primaryPaneContentIdentifier` defaults in `Workspace`, `WorkspaceSet`,
`Bootstrap` and `RootView` — a wide, shallow change. Do it after the editor column is generic so
both docks use one vocabulary.

### 6. LANGUAGE → language plugin — **BLOCKED, needs the owner**

**Last, and gated on a contract decision, not on effort.** It is the largest (18 sites, 6 request
methods, a vendor workaround) and the only one a recorded invariant currently *assigns to the
host*. Ports 1 and 2 already carry its lifecycle; the six request methods need a semantic-request
port that has **one** customer today, so building it now would be a guess. Extract the client
lifecycle behind the existing ports; leave the request methods until either the owner renegotiates
*The host canvas is complete without plugins* or a second intelligence provider exists.

## Scoreboard

| Domain | Matching lines | Real coupling sites | New port needed | Status |
| --- | --- | --- | --- | --- |
| git | 0 | 0 | — | **done** (task #34) |
| diff | **0** | **0** | Gap A+B **built** | **done** 2026-07-26 |
| markdown | **0** | **0** | Gap A+B built; Gap D resolved by field addition | **done** 2026-07-26 |
| image | 5 | 1 predicate | Gap A+B (reuse) | after diff/markdown |
| file tree | 33 | 8 (model + 2 momentum lanes) | dock-fallback flag | after the editor column |
| language | 61 | 18 | semantic-request port = **GUESS** | **blocked on the owner** — a contract renegotiation |

Guard collapse: **14 diff mode checks → 1 capability question**; **29 markdown mode checks → the
second question**. Both done: 43 mode checks became 2 questions.

## Progress

**2026-07-26 — steps 1 and 2 landed.**

- `Workspace.ts`: zero `diff` references (was 27 lines). `src/modules/app`: zero (was 27 across
  `Bootstrap.ts` + `AppStatusProjection.ts`), so the `comparison` domain graduated from the
  shrinking allowlist to the gate's zero-tolerance list.
- 8 host guards + 6 chrome/paint checks now read one capability question.
- `diffEditor` deleted: it and `emptyEditor` were two identical document-less editors, and "empty" is
  the whole of either's behaviour.
- `showingDiff` / `diffRequest` / `diffRequestToken` / `showComparison` / `DiffRequest` moved to
  `GitWorkspace` (already the sole producer); `Bootstrap`'s 45-line inline diff key switch became
  `GitComparisonContent.handleKey`; the `diff.*` commands and `diff*` status fields moved to
  `GitPlugin` through the ports that already existed; `void settings.diffSplitRatio.value` became
  `observePaintSignals()`.
- markdown residue in host core: 13 (`Workspace.ts`) + 60 (`Bootstrap.ts`) + 13
  (`AppStatusProjection.ts`), all held by the ratchet.

**2026-07-26 — step 3 landed, and the boundary check widened.**

- `Workspace.ts` and `src/modules/app`: zero `markdown` references (was 86 lines across three
  files). Markdown ships as a default plugin (`MarkdownPlugin`, `MarkdownWorkspace`,
  `MarkdownPreviewSurface`, `MarkdownPreviewContent`).
- The 29 `previewFocused` guards became `activeDocumentIsKeyboardTarget`, which is what supplied that
  question's second answer. Movement still arrives through REBINDABLE commands, not a raw-key
  intercept, so a remapped chord still drives the preview.
- `EditorContentMount` lost its hard-coded three-way branch entirely: `'editor' | 'surface'`, with
  the source renderable handed to whichever surface embeds it.
- `StatusBarSegmentContext.markdownPreviewFocused` → `focusedSurfaceTitle`, answered by the content.
- `resolveFileReference` stayed in the host, as the census argued: generic path confinement.
- The gate's boundary paths now include `src/modules/keybindings`, which held **19** plugin names
  while the check reported PASS. They are allowlisted, not tolerated; their extraction is issue #100.
- Remaining host-core plugin names, all allowlisted and all in the keybinding DEFAULTS: 13
  source-control chords + the `'git'` keybinding context, 2 diff chords, 3 markdown chords.
