# Workspace and in-file Find/Replace design

Design only. No runtime implementation rides with this document. The design
covers two surfaces. Workspace Search lives in the left dock. In-file
Find/Replace extends the existing editor `FindBar`.

## In plain words

The current app can find and replace text in one open file. It has no workspace
Search pane, and its current Replace All bypasses the editor's undo recorder.
This design gives each surface one clear job and makes every bulk change safe to
inspect, confirm, and undo.

Workspace replacement stores only the text it removes and inserts. It never
keeps a second copy of each file. Before replace or undo, it checks the live text
again and skips any item that changed.

## Decision summary

1. Add a Search activity item directly after File Tree.
2. Show its results in the left-dock pane slot that File Tree uses.
3. Keep `Ctrl+F` and `Ctrl+H` on the separate in-editor `FindBar`.
4. Use `Ctrl+Shift+F` for workspace find.
5. Use `Ctrl+Shift+R` for workspace replace. `Ctrl+Shift+H` stays Shortcut Help.
6. Reuse one query compiler, but do not share the two surface controllers.
7. Use `TextInputModel.Class` for every query, replacement, include, and exclude field.
8. Use `Dialog.Class`, painted by `OverlayLayer`, for every consent or warning dialog.
9. Store reverse patches in a bounded workspace transaction history.
10. Verify exact text and context before every replace, undo, and redo.

The new design follows all six chapters of the
[Invar UI design doctrine](.claude/skills/ui-design/SKILL.md).

## 1. Evidence from the current app

I drove the default app at 220 by 60 cells. The activity bar reported this order:
`files`, `git`, `structure`, `tasks`, `monitoring`, `extensions`. The Search item
must enter after `files`.

`Ctrl+P` opened Quick Open in the shared overlay. `Ctrl+F` opened a five-row
`Find` bar in the editor. `Ctrl+H` changed the same bar to `Find / Replace` and
added its replacement field.

The live graph showed `FindBar.focusedInput` as a `TextInputModel`. The current
`FindInBuffer` also owns `caseSensitive`, `wholeWord`, and `useRegex` state. Only
the case control is visible today.

The current in-file Replace All path is not safe. `FindInBuffer.replaceAll()`
calls `TextDocument.replaceAll()` directly. That mutation does not emit the line
change event that the editor sends to `UndoStore`.

I reproduced the result twice through the PTY. I replaced 21 `task` matches
with `workitem` in `project.tasks.md`, closed the bar, and pressed `Ctrl+Z`.
Reopening Find still showed `task` with `no results` on both runs.

The comment above that call says the editor can capture one undo step. The
current call path cannot do that. This finding shapes the in-file milestone.

## 2. One feature, two surfaces

| Concern | Workspace Search | In-file Find/Replace |
| --- | --- | --- |
| Home | Left dock pane slot | Existing editor `FindBar` overlay |
| Scope | Active workspace | One bound text target |
| Open chord | `Ctrl+Shift+F` | `Ctrl+F` |
| Replace chord | `Ctrl+Shift+R` | `Ctrl+H` |
| State owner | One `WorkspaceSearchWorkspace` per workspace | Existing target-keyed `FindBar` engines |
| Results | File groups and match rows | Highlights and one current match |
| Undo owner | `WorkspaceReplacementHistory` | The editor `UndoStore` |
| Disk access | Ripgrep plus confined file access | None |
| Open buffers | Search and edit the live document | Edit the bound live document |

The boundary follows
[Seams are drawn at the shared generator](project.invariants.md#seams-are-drawn-at-the-shared-generator).
The two views look related, but they do not generate the same state or undo
history. Sharing one controller would force each view to suppress the other's
core behavior.

The shared generators are narrow:

- `TextSearchPattern` compiles case, whole-word, regex, and replacement rules.
- `TextInputModel.Class` owns every editable field.
- `TextPatch` describes a verified text change.
- Shared UI classes own buttons, dialogs, scrolling, selection, and copy.

## 3. VS Code and JetBrains study

The [VS Code search documentation](https://code.visualstudio.com/docs/editing/codebasics#_search-across-files)
shows a left-side Search view. It has query and replacement rows, three query
toggles, include and exclude fields, file groups, counts, and replace controls.
It also supports a default-excludes and ignore-files switch.

VS Code streams ripgrep JSON through a child process in
[`ripgrepTextSearchEngine.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/search/node/ripgrepTextSearchEngine.ts).
Its common search service sets a default result cap in
[`search.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/search/common/search.ts).

VS Code applies resource text edits through its bulk edit service in
[`replaceService.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/search/browser/replaceService.ts).
Its search view owns confirmation, selected matches, and file groups in
[`searchView.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/search/browser/searchView.ts).
The replace service builds resource edits, applies them through one bulk edit
service, and then saves its text-file models. This confirms the value of one
workspace edit owner. Invar does not copy the automatic-save choice.

The [JetBrains project search guide](https://www.jetbrains.com/help/idea/finding-and-replacing-text-in-project.html)
uses separate project find and project replace commands. Its
[Find tool window guide](https://www.jetbrains.com/help/idea/find-tool-window.html)
shows grouped results, preview, filters, and selected replacement.
Those public pages do not describe JetBrains undo storage. This design makes no
claim about its internal patch representation.

### Parity decisions

| Element | Decision for Invar | Reason |
| --- | --- | --- |
| Left-side Search view | Adopt | It matches the required File Tree pane swap. |
| `Aa`, `ab`, `.*` toggles | Adopt | The query generator already models all three. |
| Include and exclude globs | Adopt | They bound large workspace searches without a new picker. |
| Workspace ignores plus `.gitignore` | Adopt, on by default | It matches user expectations and ripgrep's native path. |
| File-grouped results and counts | Adopt | The group is the stable unit for preview and action. |
| Inline old to new preview | Adopt | The dock can show the pending change before consent. |
| Dismiss one match | Adopt | It gives a direct, reversible selection gesture. |
| Replace All confirmation | Adopt | Invar adds exact drift and undo counts. |
| Search editor document | Defer | It is a third state owner with no current requirement. |
| Automatic save after replace | Reject | Open documents must keep their normal dirty state. |
| Whole-file preview snapshots | Reject | They break the flyweight undo requirement. |

### Research priors, judged

| Prior | Verdict | Design result |
| --- | --- | --- |
| Reverse patch per match | Adopt | Store path, exact text slices, contexts, and state in one arena. |
| Context hash at each stage | Refine | Use the hash only to reject quickly. Exact bytes decide safety. |
| Counted consent in both directions | Adopt | Replace, Undo, and Redo use `Dialog.Class` with drift names. |
| Open buffers use the document model | Adopt | Live documents replace ripgrep's disk results and receive batch edits. |
| Closed files patch on disk | Adopt with a limit | Confine, verify, replace atomically per file, and read back. |
| Ripgrep through `Processes` | Adopt | Stream one generation and cancel stale generations. |
| Reuse Quick Open | Partial | Reuse process and input seams. Do not reuse fuzzy result ranking. |

## 4. Workspace Search surface

### 4.1 Contribution and placement

Add `WorkspaceSearchContributor` beside the other default contributors. It
implements both `ApplicationContributor` and `WorkspaceContributor`.

The application contribution registers `WorkspaceSearchPaneContent` through
`registerPrimaryDockContent`. Its content identifier is `search`. Its title is
`Search`. Its activity icon comes from a new theme icon slot named
`workspaceSearch`.

`WorkspaceSearchContributor` follows `FileTreeContributor` in
`DefaultPlugins.create()`. Fresh profiles therefore get `files`, then `search`.
The activity item swaps the active left-dock content through `PanelHost`. It
does not open a bottom panel or a second sidebar.

Existing profiles already persist an activity order. A one-time settings
migration must insert an unseen `search` identifier directly after `files`.
It must preserve every other relative position.

That migration refines the current rule that unseen contributions append. The
implementation brief must ask for approval to refine
[Activity bar order is one persisted sequence](src/modules/ui/ui.invariants.md#activity-bar-order-is-one-persisted-sequence).
Without that refinement, existing users would get Search at the end.

The active item continues to control the visible dock through
[The active activity item determines its dock content](src/modules/ui/ui.invariants.md#the-active-activity-item-determines-its-dock-content).

### 4.2 Dock layout

The default 32-column left dock uses this compact shape:

```text
╭─ Search ─────────────────────╮
│ [ query                  ] Aa │
│ [ replacement            ] .* │
│ [ files to include       ] ab │
│ [ files to exclude       ]    │
│ Use ignores: on               │
│  18 results in 5 files       │
│ ▾ src/app.ts              6  │
│   14  oldValue              x │
│       → newValue              │
│   29  oldValue              × │
│       → newValue              │
│ ▸ src/model.ts            4  │
│                              │
│ [ Replace All ] [ Undo ]     │
╰──────────────────────────────╯
```

The renderer truncates long paths from the left and keeps the basename. It
truncates preview text at the dock edge. The full text remains selectable and
available in a hover card.

The replacement row stays visible in workspace find mode. An empty replacement
means deletion. `Ctrl+Shift+R` opens the pane and focuses this row.

### 4.3 Buttons and toggles

This surface follows
[UI doctrine chapter 1, Buttons](.claude/skills/ui-design/SKILL.md#1-buttons).

Each control stores one half-open cell range. Paint, hover, click, tooltip, and
keyboard focus use that same range. Every button has rest, hover, pressed, and
disabled states. The three query toggles also have a visible on state.

Every label has one key-width of internal padding. Text labels are `Aa`, `ab`,
`.*`, `Replace All`, `Undo`, and `Redo`. Dismiss uses the theme's `close` icon
slot. The renderer does not hardcode a Nerd Font glyph.

`Aa` toggles case. `ab` toggles whole word. `.*` toggles regular expressions.
The default-excludes control is a toggle. Its tooltip reads `Use workspace
excludes and .gitignore`.

`Replace All` enables only when at least one selected match is safe to verify.
`Undo` and `Redo` reflect the active workspace transaction history. The Search
activity button toggles the left dock when Search is already active.

### 4.4 Text inputs

This surface follows
[UI doctrine chapter 4, Text inputs](.claude/skills/ui-design/SKILL.md#4-text-inputs).
It also binds to
[Editable text fields share one input model](project.invariants.md#editable-text-fields-share-one-input-model).

These four fields are separate `TextInputModel.Class` instances:

1. Search query.
2. Replacement text.
3. Files to include.
4. Files to exclude.

All four fields use `KeybindingDefaults.textInputBindings('workspaceSearch')`.
They get pointer and keyboard selection, `Alt+Left`, `Alt+Right`,
`Alt+Backspace`, `Alt+Delete`, `Home`, `End`, Select All, and Copy.

They paint with the shared caret and selection machinery. Placeholder text is
a hint, not a field value. The placeholders are `Search`, `Replace`, `Files to
include`, and `Files to exclude`.

`Tab` and `Shift+Tab` move among the four fields, toggles, and result list.
`Enter` starts the current search now. Edits also schedule a new generation
after 120 milliseconds without another edit. The model publishes `queued`
during that interval. A generation token cancels and discards every older
process result.

Include and exclude fields accept comma-separated glob expressions. Paths use
workspace-relative forward slashes. Include globs form an allow set. Exclude
globs then remove items from that set.

The default-excludes toggle starts on. In that state, ripgrep applies
`.gitignore` and workspace exclusion settings. Turning it off passes the one
backend option that disables both sources.

### 4.5 Results, scrolling, selection, and copy

This surface follows
[UI doctrine chapter 5, Scroll areas](.claude/skills/ui-design/SKILL.md#5-scroll-areas)
and
[UI doctrine chapter 6, Copy text](.claude/skills/ui-design/SKILL.md#6-copy-text-capability--universal).

`WorkspaceSearchResultTree` renders file group rows and match preview rows.
Each file row shows its selected match count. Each match uses two visual rows.
The first shows the line number and old text. The second shows `→` and the new
text.

The tree uses `ScrollableTextViewport.Class`. Wheel, keys, scrollbar drag, and
animation write through that one position. A direct key or thumb action halts
current momentum first. The thumb uses the same result extent as the content.

The visible result text uses `TextSelectionModel.Class` and
`SelectionDragBehavior.Class`. Pointer drag includes the release cell and can
autoscroll at an edge. `Ctrl+C` sends selected text through `Clipboard.Class`
and OSC 52. The surface shows the shared `Copied N chars` flash.

Copy serializes the selected visible rows. It includes workspace-relative
paths, line numbers, old text, and replacement previews. Collapsed rows are not
silently added to the copied text.

Clicking a file caret expands or collapses that group. Clicking a match opens
the file through the workspace buffer provider, selects the match, and reveals
it. Clicking `×` dismisses one match from the pending action. A dismissed match
stays visible with a dimmed state until the next search.

The search stops at 20,000 matches. The final row then says `Results limited to
20,000 matches. Narrow the search to see more.` This copies VS Code's bounded
result shape and prevents an unbounded reactive tree.

### 4.6 Search state and process ownership

Each `Workspace` owns one `WorkspaceSearchWorkspace`. Switching workspaces
restores that workspace's query, filters, results, selection, and history.

The model publishes these flow states to the graph:

```text
idle
queued
searching
ready
verifyingReplace
awaitingReplaceConsent
applying
applied
verifyingUndo
awaitingUndoConsent
undoing
undone
verifyingRedo
awaitingRedoConsent
redoing
failed
```

It also publishes the query generation, result count, selected count, file
count, drifted count, failed count, and active transaction identifier. Drive
tests wait on these values. They never wait for a timer or a frame number.

`WorkspaceSearchBackend` launches `rg` only through `Processes.Class.spawn`.
This preserves
[External tools share one launch policy](src/modules/system/system.invariants.md#external-tools-share-one-launch-policy).
It streams `--json` output and stops the process when a later generation wins.

The backend confines the working directory to the workspace root. Every path
from ripgrep passes `Files.Class.confineToRoot` before a read or write. This
preserves
[File access is confined to a single root](src/modules/system/system.invariants.md#file-access-is-confined-to-a-single-root).

Literal mode uses ripgrep's fixed-string option. Regex mode passes the query as
a regular expression. Case and whole-word options map directly. The process
receives an argument array, never a shell command string.

Ripgrep spans are candidate evidence, not mutation authority. For every path
with a ripgrep hit, the backend reads that file once and runs the shared
`TextSearchPattern`. Those local matches become the canonical spans and capture
groups used by preview and replacement.

`TextSearchPattern` accepts the single-line regular-expression subset supported
by both ripgrep and the local matcher. It rejects look-around, backreferences in
the query, and any other construct without identical meaning. Replacement text
supports the current `$&`, numbered capture, named capture, prefix, and suffix
forms.

This second match pass prevents JavaScript and ripgrep regex differences from
silently changing replacement spans. A compatibility corpus must run every
accepted pattern through both compilers. Any different span is a test failure.

### 4.7 Open-buffer search truth

Ripgrep sees disk state. An open document can contain newer unsaved text.
Workspace Search must not show the disk copy as truth for that path.

After parsing ripgrep results, the search model asks `OpenBufferSet` for every
attached `DocumentHandle`. It searches each live document with the shared
`TextSearchPattern`. It then replaces ripgrep's results for those paths.

The live document stays the source of truth until it detaches. The search never
writes a live document through `Files.Class`. This preserves stable document
identity and avoids overwriting unsaved work.

## 5. In-file Find/Replace surface

### 5.1 Extend `FindBar`, do not create another bar

The existing `FindBar.Class` remains the one in-editor surface. `Ctrl+F` opens
find mode. `Ctrl+H` opens replace mode. Each bound pane keeps its own engine by
target identifier.

Add visible whole-word and regex toggles beside the current case toggle. Bind
`Alt+C`, `Alt+W`, and `Alt+R` in the `find` context. Each toggle re-runs the
query at once.

The bar follows
[UI doctrine chapter 1, Buttons](.claude/skills/ui-design/SKILL.md#1-buttons)
and
[UI doctrine chapter 4, Text inputs](.claude/skills/ui-design/SKILL.md#4-text-inputs).
Its query and replacement fields remain `TextInputModel.Class` instances. The
new controls reuse the current shared button geometry.

The in-file bar owns no file globs, no file groups, and no workspace history.
The workspace pane owns no editor highlights until the user opens a result.
Closing either surface does not close or reset the other.

### 5.2 Repair the mutation boundary

`FindInBuffer` must stop mutating `TextDocument` directly. It should return
ordered `TextEdit` values for Replace Current and Replace All.

Extend `FindBarTarget` with this operation:

```text
applyTextEditsAsUndoStep(edits, metadata) -> applied count
```

The target owns cursor placement, selection, document mutation, and undo
capture. `FindBar` owns only query state and intent. This matches the existing
rule that `revealMatch` leaves scrolling and selection with the pane.

The target applies all Replace All edits from the end of the document toward
the start. It captures one `UndoStore` state with line deltas. It never calls
`TextDocument.replaceAll()` with a whole-document array.

This repair restores
[Undo records deltas not whole-document snapshots](src/modules/editor/editor.invariants.md#undo-records-deltas-not-whole-document-snapshots).

### 5.3 In-file bulk consent

Replace Current stays immediate after exact match verification. Replace All
always uses `Dialog.Class`. It reports the count before mutation.

The resulting `UndoStore` state carries `bulkItemCount` and the label
`Replace All in file`. Undo and redo of that state also use `Dialog.Class`.
Ordinary one-edit undo and redo keep their current direct path.

This flow follows
[UI doctrine chapter 3, Flows](.claude/skills/ui-design/SKILL.md#3-flows).
Escape returns to the unchanged `FindBar`. Mutation happens only after consent.
The bar publishes `verifying`, `awaitingConsent`, `applying`, and `ready`.

## 6. Shared dialog family and exact copy

Every item in this section uses the existing `Dialog.Class`. `OverlayLayer`
paints that one shared component. This is the same component and styling as
the existing close and quit confirmation. No surface prints a `y/N` prompt.

This design follows
[UI doctrine chapter 2, Dialogs](.claude/skills/ui-design/SKILL.md#2-dialogs),
[One dialog component serves confirms and prompts](design.invariants.md#one-dialog-component-serves-confirms-and-prompts),
and
[Input overlays share one modal slot](src/modules/ui/ui.invariants.md#input-overlays-share-one-modal-slot).

Each button uses one key-width of padding. The safe button holds initial focus.
Escape runs the safe action. Detail text uses `ScrollableTextViewport`,
`TextSelectionModel`, and `SelectionDragBehavior`, so every listed path can be
selected and copied.

### 6.1 Workspace Replace All

Title: `Replace across files`

Copy without drift:

```text
Replace 20 items across 6 files?

Open files will have unsaved changes. Closed files will change on disk.
```

Copy with drift:

```text
2 of 20 items changed since this search and will be skipped.

src/app.ts:14
src/model.ts:29

Replace 18 safe items across 5 files?

Open files will have unsaved changes. Closed files will change on disk.
```

Buttons: `Replace`, `Cancel`. `Cancel` has initial focus.

### 6.2 Workspace undo

Title: `Undo workspace replace`

Copy without drift:

```text
Undo will revert 20 items across 6 files.

Open files will have unsaved changes. Closed files will change on disk.
```

Copy with drift:

```text
2 of 20 items changed since replacement and will be skipped.

src/app.ts:14
src/model.ts:29

Undo will revert 18 safe items across 5 files.

Open files will have unsaved changes. Closed files will change on disk.
```

Buttons: `Undo`, `Cancel`. `Cancel` has initial focus.

### 6.3 Workspace redo

Title: `Redo workspace replace`

Copy without drift:

```text
Redo will replace 20 items across 6 files.

Open files will have unsaved changes. Closed files will change on disk.
```

Copy with drift:

```text
2 of 20 items changed since undo and will be skipped.

src/app.ts:14
src/model.ts:29

Redo will replace 18 safe items across 5 files.

Open files will have unsaved changes. Closed files will change on disk.
```

Buttons: `Redo`, `Cancel`. `Cancel` has initial focus.

### 6.4 One workspace match drifted

Title: `Match changed`

```text
This item changed since the search and will not be replaced.

src/app.ts:14

Refresh the search to find its new location.
```

Buttons: `Refresh`, `Cancel`. `Cancel` has initial focus.

### 6.5 In-file Replace All

Title: `Replace all in this file`

```text
Replace 20 items in src/app.ts?

The editor will record one undo step.
```

Buttons: `Replace`, `Cancel`. `Cancel` has initial focus.

### 6.6 In-file Replace All undo

Title: `Undo Replace All`

```text
Undo will revert 20 items in src/app.ts.
```

Buttons: `Undo`, `Cancel`. `Cancel` has initial focus.

### 6.7 In-file Replace All redo

Title: `Redo Replace All`

```text
Redo will replace 20 items in src/app.ts.
```

Buttons: `Redo`, `Cancel`. `Cancel` has initial focus.

### 6.8 Undo record too large

This is an alert, not consent. It still uses `Dialog.Class`.

Title: `Replace is too large`

```text
This replace needs more than 64 MiB of undo text.

No files changed. Narrow the search and try again.
```

Button: `Close`. `Close` has initial focus. Escape closes the dialog.

## 7. Workspace replace flow

This flow follows
[UI doctrine chapter 3, Flows](.claude/skills/ui-design/SKILL.md#3-flows).
It has one cancel spine. Every Escape before step 8 returns to the unchanged
result tree.

1. Freeze the selected, non-dismissed result identifiers.
2. Read each live document or confined disk file once for this attempt.
3. Re-locate each match with exact text and context.
4. Classify every item as `SAFE`, `DRIFTED`, `DISMISSED`, or `FAILED`.
5. Build the dialog copy from those classifications.
6. Wait for explicit consent through `Dialog.Class`.
7. Re-read and re-verify each file group at its mutation boundary.
8. Apply safe edits from the end of each file toward the start.
9. Verify the inserted text after each file group.
10. Publish applied, skipped, drifted, and failed counts.
11. Add one transaction to `WorkspaceReplacementHistory`.

The flow does not promise all-file atomicity. A process can fail after earlier
files changed. The transaction records only successful items, so Undo can
reverse that applied subset.

Closed-file writes need a new `Files.Class.replaceIfUnchanged` operation. It
must confine the path, compare the expected bytes, write a temporary sibling,
and rename it over the target. It then reads the result back.

The operation can hold one current file value while it builds the replacement.
It releases that value after the file group. It never adds that transient file
value to undo history.

There is a residual external-writer race between the last comparison and the
rename. Portable filesystem APIs do not provide a cross-process compare and
swap. The post-write check detects a lost result, but cannot recover text that
another process wrote in that interval.

## 8. Reverse-patch transaction design

### 8.1 Patch record

One applied match produces this logical record:

```text
WorkspaceTextPatch
  path
  searchGeneration
  baselineByteOffset
  appliedByteOffset
  removedTextSlice
  insertedTextSlice
  beforeContextSlice
  afterContextSlice
  state
```

The four text values point into a transaction `TextArena`. The arena stores
UTF-8 slabs and interns repeated replacement text. Each patch stores slice
offsets, not four JavaScript string copies.

The before and after contexts hold up to 64 bytes each. The exact bytes are
the authority. A hash is only a fast rejection key. A hash match never proves
that an item is safe.

The transaction stores no whole-file before or after image. Its memory cost
tracks removed text, inserted text, bounded context, and patch metadata. This
extends the delta principle instead of cloning file state.

### 8.2 Match relocation

Absolute offsets are hints. An unrelated edit above a match can shift them.
Verification first checks the expected offset. If that fails, it searches for
the exact `before + subject + after` sequence in the current file.

One exact candidate is safe and gets a new offset. Zero candidates mean drift.
More than one candidate is ambiguous and also means drift. Verification never
guesses among duplicate contexts.

Replace verifies `removedTextSlice`. Undo verifies `insertedTextSlice`. Redo
verifies `removedTextSlice` again. Neighboring transaction patches are checked
as one file group against one source revision.

### 8.3 Encoding and line endings

Ripgrep byte offsets are UTF-8 offsets. Disk patches use UTF-8 byte slices.
Open-document patches convert those offsets through `TextCoordinates` before
calling the view edit seam.

The patch builder preserves the file's existing line endings. Binary files and
invalid UTF-8 matches become `FAILED` results with a visible reason. The
backend never decodes base64 ripgrep payloads as text by accident.

### 8.4 History bounds

`WorkspaceReplacementHistory` keeps at most 20 transactions and at most 64
MiB of arena text per workspace. It evicts the oldest complete transaction
first.

A single new transaction may not exceed 64 MiB. The design blocks it before
mutation and shows the alert in section 6.8. This keeps every accepted action
undoable.

The result cap and the history byte cap are independent. A small count can
still remove a large text range.

## 9. Open-buffer and editor undo coherence

This is the main architecture corner. One text change must have one undo
authority. Duplicating patch text in the workspace history and every editor
history would break the flyweight goal.

Add a generic `WorkspaceUndoCoordinator` in the workspace host. It coordinates
opaque multi-document transaction references. It does not know Search query
state or replacement rules.

When workspace replacement changes a live document, its editor `UndoStore`
records only this reference:

```text
ExternalUndoReference
  providerIdentifier = workspace-search
  transactionIdentifier
  documentIdentifier
```

The reference contains no removed or inserted text. The workspace transaction
arena owns that text once.

If local `Ctrl+Z` reaches the reference, `UndoStore` does not move it. It asks
`WorkspaceUndoCoordinator` to request the transaction undo. Search then opens
the shared count dialog. After confirmation, the coordinator removes or moves
the matching reference in every live editor history.

Later local edits stay above the reference. They must be undone first in that
editor. Edits in another file can make only that file's transaction items
drift. The global undo dialog reports and skips them.

The Search dock also exposes `Undo` and `Redo`. The Command Palette gains
`Search: Undo Last Workspace Replace` and `Search: Redo Workspace Replace`.
All three routes reach the same coordinator.

Open-document edits go through a new batch method on `SourceTextView`. They
become normal dirty document changes and are not saved automatically. Closed
files change on disk through the confined `Files` operation.

If a live document closes, later undo resolves the same `DocumentHandle` path.
It uses a newly attached document when present. Otherwise it verifies and
patches disk.

When a document attaches, the coordinator inserts references for its still-live
workspace transactions in chronological order. A new view therefore reaches
the same global undo elements without copying their text.

## 10. Integration census

| Existing seam | Current site | Design use | Judgment |
| --- | --- | --- | --- |
| Application contribution | [`ApplicationContributor.interface.ts`](src/modules/app/ApplicationContributor.interface.ts) | Register Search commands and primary dock content. | Reuse. |
| File Tree contribution | [`FileTreeContributor.ts`](src/modules/filetree/FileTreeContributor.ts) | Copy the per-workspace contributor shape, not its tree model. | Reuse shape only. |
| Default plugin order | [`DefaultPlugins.ts`](src/modules/plugins/DefaultPlugins.ts) | Put Search after File Tree on fresh profiles. | Extend. |
| Activity and dock host | [`ApplicationContributions.ts`](src/modules/app/ApplicationContributions.ts) and [`PanelHost.ts`](src/modules/ui/PanelHost.ts) | Swap File Tree and Search in one left-dock slot. | Reuse. |
| Existing in-file view | [`FindBar.ts`](src/modules/search/FindBar.ts) | Keep separate state and add controls plus batch edits. | Extend in place. |
| Search semantics | [`FindInBuffer.ts`](src/modules/search/FindInBuffer.ts) | Extract shared pattern and replacement compilation. | Distill generator. |
| Quick Open process path | [`QuickOpen.ts`](src/modules/search/QuickOpen.ts) | Copy cancellation and process policy lessons. Do not reuse fuzzy ranking. | Partial reuse. |
| Process capability | [`Processes.ts`](src/modules/system/Processes.ts) | Spawn and cancel streaming ripgrep. | Reuse. |
| File capability | [`Files.ts`](src/modules/system/Files.ts) | Confined reads and new verified atomic replacement. | Extend seam. |
| Editable input | [`TextInputModel.ts`](src/modules/text/TextInputModel.ts) | Own all six fields across both surfaces. | Reuse exactly. |
| Input bindings | [`KeybindingDefaults.ts`](src/modules/keybindings/KeybindingDefaults.ts) | Install the full shared field action set. | Reuse exactly. |
| Shared dialog | [`Dialog.ts`](src/modules/ui/Dialog.ts) and [`OverlayLayer.ts`](src/modules/ui/OverlayLayer.ts) | Render every consent and alert surface. | Extend labels and details. |
| Scroll area | [`ScrollableTextViewport.ts`](src/modules/ui/ScrollableTextViewport.ts) | Scroll result rows and dialog details. | Reuse exactly. |
| Text selection | [`TextSelectionModel.ts`](src/modules/ui/TextSelectionModel.ts) and [`SelectionDragBehavior.ts`](src/modules/ui/SelectionDragBehavior.ts) | Select result and dialog text. | Reuse exactly. |
| Stable document identity | [`DocumentHandle.ts`](src/modules/workspace/DocumentHandle.ts) | Route live search and later undo to the current document. | Reuse. |
| Open buffers | [`OpenBufferSet.ts`](src/modules/workspace/OpenBufferSet.ts) | Enumerate attached documents and route batch edits. | Extend seam. |
| View edit port | [`SourceTextView.interface.ts`](src/modules/workspace/SourceTextView.interface.ts) | Add verified batch edits and external undo references. | Extend seam. |
| Editor undo store | [`UndoStore.ts`](src/modules/storage/UndoStore.ts) | Keep in-file deltas and lightweight workspace references. | Extend entry shape. |

Quick Open and workspace Search share the process and input capabilities. They
do not share result ranking. Quick Open searches file names with fuzzy scores.
Workspace Search searches file content with exact spans and replacement data.

## 11. Invariant evaluation

The current records support most of the design:

- [Editable text fields share one input model](project.invariants.md#editable-text-fields-share-one-input-model)
  requires all six fields to use `TextInputModel.Class`.
- [Undo records deltas not whole-document snapshots](src/modules/editor/editor.invariants.md#undo-records-deltas-not-whole-document-snapshots)
  supports reverse patches and rejects file snapshots.
- [External tools share one launch policy](src/modules/system/system.invariants.md#external-tools-share-one-launch-policy)
  requires ripgrep to use `Processes.Class`.
- [File access is confined to a single root](src/modules/system/system.invariants.md#file-access-is-confined-to-a-single-root)
  requires every result path and write to pass the Files boundary.
- [Document identity survives document instance replacement](src/modules/workspace/workspace.invariants.md#document-identity-survives-document-instance-replacement)
  supports delayed undo through `DocumentHandle`.
- [Cost tracks the actively observed set](project.invariants.md#cost-tracks-the-actively-observed-set)
  requires a virtual result list and bounded history.
- [Quit requires explicit confirmation](src/modules/app/app.invariants.md#quit-requires-explicit-confirmation)
  supplies the safe-default dialog model.

One chosen record needs a planned refinement. The activity order record says a
new identifier appends after known identifiers. The required fixed Search slot
needs a one-time insertion after File Tree for existing profiles.

No current record defines multi-file patch verification or shared transaction
references in editor undo stacks. The next section proposes those records. This
document does not edit an invariant file.

## 12. Proposed invariant records

These are proposals. Add them only with user approval during implementation.

### Proposed: Workspace replace undo stores reverse patches, never file snapshots

**Kind:** chosen

**Status:** provisional

**Scope:** Workspace replacement history and every provider that records its undo data.

**Invariant:** A workspace replace transaction stores only path identity,
changed spans, removed text, inserted text, bounded context, and state. It never
stores a whole prior file only to support undo.

**Rationale:** Memory must track the edit size. It must not track the total size
of all affected files.

**Mechanism:** `WorkspaceReplacementHistory` owns one bounded `TextArena` per
transaction. Patch records hold arena slices. Open editor histories hold only
opaque transaction references.

**Evidence:** Proposed `WorkspaceReplacementHistory` patch structure and memory
tests. Existing editor delta storage supplies the local precedent.

**Verification:** Build a 100,000-line fixture with two one-word replacements.
Assert that recorded text stays constant when untouched file size grows. Plant
a whole-file snapshot and make the check fail as its positive control.

**Last refined:** 2026-08-05, proposed by the Find/Replace design.

### Proposed: Every workspace text patch verifies its live premise at the acting step

**Kind:** chosen

**Status:** provisional

**Scope:** Search result actions, workspace Replace All, Undo, and Redo.

**Invariant:** Replace verifies the exact removed text and context. Undo verifies
the exact inserted text and context. Redo verifies the removed side again.
Ambiguous or missing matches become `DRIFTED` and never mutate.

**Rationale:** Files and open documents can change after search or after replace.
An old offset is not authority to edit new text.

**Mechanism:** Every action reads the live source, resolves one exact context,
groups patches against one source revision, and rechecks at the mutation
boundary. The model records and reports each skipped item.

**Evidence:** Proposed patch verifier, drift classifications, and dialogs with
named items.

**Verification:** Search a fixture, change one matched item, then replace. The
changed item stays unchanged and appears as drifted. Repeat between replace and
undo. Plant an offset-only verifier and make both controls fail.

**Last refined:** 2026-08-05, proposed by the Find/Replace design.

### Proposed: Bulk text changes require counted consent in both directions

**Kind:** chosen

**Status:** provisional

**Scope:** Workspace Replace All, workspace Undo and Redo, and in-file Replace
All with its bulk undo and redo.

**Invariant:** Before a bulk replace, undo, or redo mutates text, `Dialog.Class`
names the action, safe item count, file count, consequences, and every drifted
item. The safe action has initial focus, and Escape cancels.

**Rationale:** Undo can change many files as easily as replace. A user must see
that scope before either direction runs.

**Mechanism:** The flow verifies first, builds dialog data from the verified
classifications, and mutates only from the dialog confirm callback. The dialog
uses the one modal slot.

**Evidence:** Proposed consent projections and PTY dialog smokes for replace,
undo, redo, drift, safe focus, and Escape.

**Verification:** Drive each direction with clean and drifted items. Assert the
painted counts, path names, safe focus, and no mutation after Escape. Bypass the
dialog in a planted action and make the contract smoke fail.

**Last refined:** 2026-08-05, proposed by the Find/Replace design.

### Proposed: A multi-document undo entry owns its text once

**Kind:** chosen

**Status:** provisional

**Scope:** `WorkspaceUndoCoordinator`, workspace transaction providers, and
editor `UndoStore` external entries.

**Invariant:** One multi-document transaction owns one copy of its reverse
patch text. Editor histories refer to that transaction by identity and never
copy its patch payload.

**Rationale:** Open-buffer coherence must not multiply history memory by the
number of editors.

**Mechanism:** The coordinator resolves opaque references. The provider owns
consent and patch data. Undo stores keep ordering references only.

**Evidence:** Proposed coordinator tests across open, closed, detached, and
reopened documents.

**Verification:** Replace the same text in 100 open documents. Assert one arena
owns the patch bytes and 100 histories own fixed-size references. Plant copied
payloads in each reference and make the memory check fail.

**Last refined:** 2026-08-05, proposed by the Find/Replace design.

## 13. Implementation milestones

### Milestone 1: Repair in-file Replace All

- Make `FindInBuffer` return text edits instead of mutating documents.
- Add the target batch-edit seam.
- Record one delta-based undo step.
- Add visible whole-word and regex toggles.
- Add in-file bulk replace, undo, and redo dialogs.
- Drive one small file and the shared 100,000-line fixture.

This milestone removes the current undo invariant violation before workspace
replacement depends on the same edit form.

### Milestone 2: Shared transaction and undo coordination

- Add `TextPatch`, `TextArena`, and exact context verification.
- Add `WorkspaceUndoCoordinator` and external undo references.
- Add the history byte and count bounds.
- Prove one-copy memory behavior with a positive control.
- Test open, closed, detached, and reopened documents.

This milestone has no Search UI. It proves the hard data boundary first.

### Milestone 3: Workspace Search backend

- Add `WorkspaceSearchWorkspace` and the streaming ripgrep backend.
- Add query compilation and replacement expansion shared with `FindInBuffer`.
- Add include, exclude, ignore, cancellation, and the 20,000-match cap.
- Overlay live open-document results on disk results.
- Drive 10-line and 100,000-line workspace fixtures.

### Milestone 4: Left-dock Search surface

- Add the contributor, activity item, and settings order migration.
- Add all four `TextInputModel` fields and three toggles.
- Add the virtual result tree, previews, dismissal, selection, copy, and scroll.
- Add Search commands and distinct chords.
- Drive mouse and keyboard paths at small and large scale.

### Milestone 5: Replace, consent, drift, and history

- Add per-match replace and workspace Replace All.
- Add every dialog copy from section 6.
- Add Undo and Redo through the coordinator.
- Add per-item drift and partial-failure reporting.
- Add final PTY contracts only after the live behavior is correct.

### Milestone 6: Final doctrine and contract pass

- Drive every doctrine chapter on both surfaces.
- Verify button ranges, states, padding, and themed glyphs.
- Verify dialog safe focus, Escape, copy, and modal ownership.
- Verify the flow states and cancel spine.
- Verify every field action from the shared binding table.
- Verify result and dialog scrolling, selection, copy, and feedback.
- Add the approved invariant records and enforcement annotations.
- Run one final invariant and behavioral contract pass.

## 14. Verification matrix for implementation

| Case | Required observation |
| --- | --- |
| Fresh profile | Search sits directly after File Tree. |
| Existing custom activity order | Search inserts after File Tree. Other items keep their order. |
| Activity click | Search replaces File Tree in the same left slot. A second click toggles the dock. |
| Input editing | Every field supports selection, word movement, word deletion, Home, End, and Copy. |
| Query toggles | `Aa`, `ab`, and `.*` have distinct on states and refresh results. |
| Open dirty buffer | Search reads live text. Replace changes the model and keeps it dirty. |
| Closed file | Replace uses the confined verified disk seam. |
| Drift before replace | The dialog names the item. Confirmation skips it. |
| Drift before undo | The undo dialog names the item. Confirmation skips it. |
| Duplicate context | Verification marks the item drifted instead of guessing. |
| Partial failure | Successful items enter history. Failed items stay named and unchanged. |
| In-file Replace All | One delta undo step records the full batch. |
| Workspace local `Ctrl+Z` | The external reference opens the workspace undo dialog. |
| Copy results | Drag selection and `Ctrl+C` copy paths, lines, and visible previews. |
| Scale | A 10-line and 100,000-line fixture use the same gestures and visible behavior. |
| Memory | History size follows edit bytes, not affected file bytes. |

Every new check needs a positive control. The drift test must fail with an
offset-only verifier. The memory test must fail with a planted file snapshot.
The dialog test must fail when an action bypasses `Dialog.Class`.

## 15. Risks and open limits

- Existing activity orders need an approved invariant refinement.
- Portable closed-file replacement cannot eliminate the final external-writer
  race. It can narrow, detect, and report it.
- Regex replacement syntax must stay identical across ripgrep results and live
  document results. The shared compiler owns that contract.
- Very wide matches can consume the 64 MiB reverse-patch budget. The action
  must stop before mutation.
- A 20,000-match cap can hide later results. The surface must say so and keep
  Replace All scoped to the visible result set.
- Workspace undo references add a generic workspace seam. Its first milestone
  must prove that ordinary editor undo order does not change.

## 16. Recommended build order

Build Milestone 1 first. It closes a live undo gap in the surface that already
exists. Build Milestone 2 next, because open-buffer undo is the hardest seam.

Only then add ripgrep and the dock. This order lets the visible workspace
feature land on a verified patch and undo generator. It avoids building a
polished result tree around unsafe mutation.
