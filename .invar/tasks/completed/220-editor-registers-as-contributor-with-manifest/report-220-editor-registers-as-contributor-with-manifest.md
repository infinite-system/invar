# READY — #220 (the editor registers as a contributor with a manifest)

Branch `fleet/220-editor-registers-as-contributor-with-manifest`, one commit:

- `ce748915` — Register the source-text editor as a contributor with uninstall symmetry (#220)

Worktree clean. `scripts/merge-gate.sh` was not run. Nothing pushed, merged, tagged, or deleted.

## What the editor is now

An ordinary contribution, eighth in `DefaultPlugins`, identifier `source-text-editor`, name
`Source Text Editor`. It appears in Extensions, it can be switched off with `Space`, and switching
it off leaves an application that still works.

It contributes exactly two things and releases both:

1. **The editor column's default occupant.** `EditorColumnDefault` (new, `src/modules/ui/`) is the
   host registry for what sits in the editor column when nothing claims it. It is a SECOND registry
   beside `EditorSurfaceContents`, deliberately, because the two answer different questions. A
   claimant answers "do I take the column over right now" (a source-control comparison, a Markdown
   split, both temporary). The default answers "what IS the column". Forcing one registry to carry
   both would have made the editor implement ten `EditorSurfaceContent` members it has no meaning
   for — AGENTS.md rule 2's own tell that the boundary is in the wrong place.
2. **The bracket-match status projection.** `matchingBracketLine` / `matchingBracketColumn` left
   `AppStatusProjection` for `EditorPlugin.statusSnapshot`, the same way the terminal projects its
   own. With the editor uninstalled the keys are ABSENT, not stale: nothing paints a match nobody
   can see.

`RootView` constructs no editor at all. It publishes the SLOT (the bordered box, its background, its
border, its extents) and three named host ports, then reads back `content`, `nativeSurface`,
`title`, and `providerIdentifier`. The three ports are the interesting part of the shape.

## The mount context names no editor type

Three services the host owns and a source-text content consumes — the LSP hover card, the raster
(image) projection, the per-frame attribution counter — reach the content through
`hostCapability(identifier)`, the same named-port vocabulary `PaneContent.capability` already uses.
The host publishes them; the content resolves the ones it understands.

That is what let the context stay honest. Written as typed fields, `EditorColumnDefaultContext`
would have named `EditorFrameAttribution` and an editor hover port, and the "generic slot" would
have been a source-text slot with extra steps.

## Uninstall symmetry, and the gap wiring it exposed

`EditorPlugin.disposeApplication` calls `releaseContent()` and THEN `dispose()`. The split is
deliberate and copied from `PaneRuntimeHostPort`: withdrawal releases nothing on its own, so a
contribution that forgets the release leaves a VISIBLE leak instead of a silently-cleaned one. A
unit test and the driven smoke both go red when the call is removed.

Wiring #219's release path found a real gap in it, which is the most useful thing in this report.

`releaseSourceTextViews` disposed views directly and cleared `viewsByLiveBuffer` — but never told
the buffer SET. Every `BufferEntry` kept pointing at a disposed view. The tabs were still there, and
none of them could ever be shown again: `hydrate` only runs for an entry whose buffer is `null`. The
editor could be uninstalled and never reinstalled. Nothing caught it, because nothing had ever
called the path.

The release now goes THROUGH the set, reusing the flyweight's own dehydration:

```ts
releaseSourceTextViews(): void {
  this.buffers.releaseHydratedBuffers();
  this.emptySourceTextView?.dispose();
  this.emptySourceTextView = null;
}
```

Two things it deliberately does not do, both now recorded as components of *One provider creates
every workspace buffer view*:

- **A DIRTY entry keeps its buffer.** Unsaved edits live in the view and nowhere else — the document
  instance is dropped from the `DocumentHandle` on detach and re-read from disk on rehydration. So
  releasing a dirty view destroys user data. `dehydrateIfClean` already refused to do that for
  eviction; the release obeys the same rule. Disabling an extension must not lose unsaved work.
- **It keeps the PROVIDER.** #219's component said the release drops it. The provider carries the
  per-workspace contribution registry that OTHER contributions attached to
  (`InlineRewriteWorkspace.register`), and dropping it on the withdrawal of one pane silently
  unregisters contributions that pane does not own. This is a refinement of the recorded rule, not
  a deviation from it, and it is written down as such.

## The empty column says it is empty

Disabling the editor leaves a bordered column painting a host-owned notice:

```
   No editor content is installed.

   The workspace is still open — files, search, and tabs all work.
   Install a source-text editor in Extensions (Ctrl+Shift+X).
```

The notice renderable is mounted ONLY while nothing occupies the column. A blank pane reads as an
empty document, which is exactly the blank lie Wave B's degraded-affordance precedent exists to
prevent. Driven: with the editor off, `Control+Shift+j` and arrow keys are inert, the active buffer
does not change, and Extensions still answers.

## The done-test — all three #122 censuses, quoted before and after

Measured on `e13e2ef8` (before) and `ce748915` (after), same commands.

### Census 1 — host files naming `modules/editor/`: 4 → 4

Every hit is a comment, and each is honest. Named, with the reason:

| file | line | what it is | why it is honest |
|---|---|---|---|
| `ui/SolidThumbScrollBar.ts` | 23 | cites *Geometry aggregates match their consumers* | a CONSUMER of editor scroll extents; #219's Boundary 2 (the scrollbar projection getters) is out of scope by the brief |
| `ui/OverviewRuler.ts` | 9 | cites *One generator owns document-line-to-visual-row* | same — the ruler consumes editor geometry |
| `workspace/Workspace.ts` | 570 | cites *Geometry aggregates match their consumers* | same |
| `workspace/SourceTextView.interface.ts` | 7 | prose: "`src/modules/editor/` supplies the one implementation today" | a doc comment SAYING the host does not construct it; deleting it would remove the sentence that makes the seam legible |

The three citations zero when the host stops consuming editor geometry — the scrollbar work, which
the brief scoped out and which #219 named as its Boundary 2. Registration did not force it: the
scrollbars read `workspaceSet.active.editor`, not the pane, so nothing about them moved.

### Census 2 — relative production imports of `../editor/` in the host: 6 → 3

```text
before                                                          after
ui/ScrollbarSync.ts:8    EditorWrap                             ui/ScrollbarSync.ts:8    EditorWrap
ui/RootView.ts:35        EditorFrameAttribution                 ui/RootView.ts:35        EditorFrameAttribution
ui/RootView.ts:42        SourceTextPaneContent                  app/Bootstrap.ts:62      EditorSourceTextViews
app/AppStatusProjection.ts:7  BracketMatch
app/Bootstrap.ts:62      BracketMatch
app/Bootstrap.ts:63      EditorSourceTextViews
```

Removed: `SourceTextPaneContent` (the task), `BracketMatch` from `AppStatusProjection` (moved to the
plugin's own projection), `BracketMatch` from `Bootstrap` (an unused import — see Bycatch).

The three that remain, named:

1. **`ScrollbarSync` → `EditorWrap`.** #219's Boundary 2, scoped out by the brief. Registration did
   not force it.
2. **`RootView` → `EditorFrameAttribution`.** The host frame loop opens and closes the counter
   around each paint (`beginFrame` / `completeFrame` in `Bootstrap.paint`) and records its own
   layout pass into it, and the snapshot is a published status key with a named type. Only editor
   code WRITES to it, so it can move — but it is also the FINGERPRINT this task is measured by, and
   relocating the instrument in the same change that must prove the instrument did not move is a bad
   trade. The plugin already reaches it through a named port rather than a typed field, so the move
   is one file when someone takes it. Worth its own task.
3. **`Bootstrap` → `EditorSourceTextViews`.** The workspace buffer-VIEW provider, not the pane. A
   workspace holds documents with or without an editor pane, and `Workspace.sourceTextViews` throws
   when no provider is supplied — there is no null source-text view, and `SourceTextView` is a
   ~60-member contract. Building one is a real deliverable governed by *The host canvas is complete
   without plugins*, not a line of this task. Conventions rule 1.58 records the exemption in place.

### Census 3 — host files naming a source-text view class (tests included): 10 → 9 files

```text
before (47 hits / 10 files)              after (42 hits / 9 files)
14  ui/RootView.ts                       12  ui/RootView.ts
 6  workspace/Workspace.navigation.test    6  workspace/Workspace.navigation.test
 5  workspace/WorkspaceSet.test            5  workspace/Workspace.test
 5  app/Bootstrap.ts                       5  workspace/WorkspaceSet.test
 4  workspace/Workspace.test               4  workspace/Workspace.scroll.test
 4  workspace/Workspace.scroll.test        4  app/Bootstrap.ts
 3  app/AppStatusProjection.ts             2  workspace/Workspace.goToDefinition.test
 2  workspace/Workspace.goToDefinition     2  ui/ScrollbarSync.ts
 2  ui/ScrollbarSync.ts                    2  app/AppStatusProjection.test.ts
 2  app/AppStatusProjection.test.ts
```

`AppStatusProjection.ts` left the list entirely. Every remaining PRODUCTION hit is one of the three
residuals above.

## The fingerprint — unchanged at all three scales

Driven with #218's on-ramp (a directory workspace outside the repository, its own `git init`, the
file opened through the file tree) and #218's gesture: open, three wheel-downs, `Control+End`, then
the two-step fold `Control+k` `[`. Fingerprint = `editorFrameAttribution.latestFrame`, as
`documentLineReads / foldProjectionLookups / wrapProjectionLookups / layoutComputations`.

| scale | landed, before | landed, after | folded, before | folded, after | `editorScrollTop` |
| --- | --- | --- | --- | --- | --- |
| 10 | `23 / 12 / 2 / 1` | identical | `23 / 12 / 2 / 1` | identical | 0, both |
| 100,000 | `32 / 16 / 2 / 1` | identical | `31 / 16 / 2 / 1` | identical | 99,986, both |
| 500,000 | `32 / 16 / 2 / 1` | identical | `31 / 16 / 2 / 1` | identical | 499,986, both |

The per-frame numbers do not move with file size and did not move with this change. The `totals`
block DOES vary between runs (`completedFrameCount` 12–25) — that is how many frames the drive
happened to complete, not what a frame cost, and it varies on the unchanged tree too.

The instrument is `.invar/tasks/.../drive-220-editor-frame-fingerprint.sh`, committed on the branch,
with its header explaining the gesture, the on-ramp workaround, and how to read the output.

## Positive controls — six, each made to fail on purpose

| control | planted defect | result |
|---|---|---|
| conventions-gate rule 1.58 | imported `SourceTextPaneContent` into `RootView` | `CONVENTIONS FAIL: the host names a source-text view instead of registering a slot:` naming lines 43 and 44; gate exit 1 |
| `EditorColumnDefault.test.ts` one-default guard | disabled the second-registration throw | `Expected pattern: /already has the default content provider "editor".*"other-editor"/ — Received function did not throw`, 1 fail |
| `EditorPlugin.test.ts` release-before-withdraw | removed `this.hostPort?.releaseContent()` | 2 fails: the content is never disposed, and reinstall reuses `source-text-0` instead of building `source-text-1` |
| `Workspace.test.ts` release-through-the-set | restored the old release (dispose views directly, clear the map) | 2 fails: the released tab rehydrates to 0 views instead of 1, and a dirty buffer loses its view |
| `smoke-plugin-manifest-harness` (driven) | removed `releaseContent()` from `disposeApplication` | exit 1, `Timed out waiting for uninstalling the editor empties the column and releases every open-buffer view` — the views really do leak |
| `smoke-plugin-manifest-harness` (driven) | never mounted the empty-column notice | exit 1, `Timed out waiting for grid condition: the empty editor column states its affordance` |

Each returned to green when the plant was removed.

## The new smoke arm

`smoke-plugin-manifest-harness` gained `== plugin manifest: the source-text editor uninstalls and
reinstalls ==`, six new assertions:

```text
PASS  the editor contribution projects its bracket-match keys while installed
PASS  uninstall withdraws the editor status projection instead of projecting a stale match
PASS  the editor contribution uninstalls, releasing its surfaces and its views
PASS  editor gestures stay inert with no editor installed and nothing crashes
PASS  the application stays live and honest with an empty editor column
PASS  Extensions reinstall restores the editor column and its views
```

Two new status keys make it observable, both host-derived and neither naming the editor:
`editorColumnContent` (which contribution occupies the column, or `null`) and
`sourceTextViewsForOpenBuffers` (a LOAD-INVARIANT count of views bound to open buffers — a count of
work, not a wall-clock, so it cannot flake under load).

The arm saves the buffer before uninstalling, deliberately: an unsaved buffer measures the exception
(a dirty view is kept) instead of the rule. The dirty rule has its own unit test.

## Verification — exact exit codes

```text
bunx tsc --noEmit                                            exit 0
bun test                                                     exit 0
  1779 pass, 0 fail, 67960 expect() calls across 268 files
bash scripts/conventions-gate.sh                             exit 0
  conventions-gate: PASS
bunx prettier --check .                                      exit 0
  All matched files use Prettier code style!
node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs   exit 0
  993 annotations, 67 lattice links, 0 problems
bun scripts/check-coverage-ratchet.ts                        exit 0
  322 files inspected, no undeclared decrease against 831e5cf
```

993/67/0 is above the 972/67/0 floor the brief set. No test file moved, so no coverage-delta
declaration was needed; the ratchet reports `Workspace.test.ts` 35 → 63 assertions and
`OpenBufferSet.test.ts` 31 → 33 as increases.

Eighteen smokes, driven green BEFORE the first edit and again after, so the silence is a comparison
and not a claim. The before-run was on a scratch worktree cut at `e13e2ef8`, my branch's base:

```text
smoke-plugin-manifest-harness         smoke-editor-harness
smoke-bracket-match-harness           smoke-selection-harness
smoke-scrollbars-harness              smoke-code-folding-harness
smoke-image-preview-harness           smoke-hover-harness
smoke-layout-harness                  smoke-tabs-harness
smoke-find-harness                    smoke-goto-definition-harness
smoke-clipboard-frame-boundary-harness smoke-panel-split-harness
smoke-diagnostics-harness             smoke-completion-harness
smoke-workspace-tabs-harness          smoke-field-caret-harness
```

`FAILED: none` on both sides. The runner is
`.invar/tasks/.../drive-220-smoke-set.sh`, committed on the branch.

## The rules the removed host branches were carrying — written first

Per the #114 lesson. Two records, both written before the branches came out.

**New: *The editor column's default occupant is a contribution*** (`ui.invariants.md`). Five
components: one default registered (a second is refused by name); built late from a host-supplied
context; host services are named ports, not typed fields; uninstall releases what it built, with
withdrawal releasing nothing on its own; an empty column states its affordance.

**Amended: *One provider creates every workspace buffer view*** (`workspace.invariants.md`). *One
releaser* now says the release goes through the buffer set and is REVERSIBLE, and gains two
components: *A release goes through the buffer set, not around it* (with the dirty-entry rule) and
*A release keeps the provider*.

**New: conventions-gate rule 1.58.** `RootView` may not name a source-text view. The rule states its
own exemption in place: `Bootstrap`'s `createSourceTextViews` is not covered, and why.

## What I did not do

- **#228 (keyboard routing) untouched**, as instructed. The pane still declares no keybinding
  context and `handleKey` still returns false.
- **#219's Boundary 2 (scrollbar projection getters) untouched.** Registration did not force it —
  reported as the brief asked. `ScrollbarSync` reads `workspaceSet.active.editor`, not the pane, so
  nothing about the column's registration reaches it.
- **`EditorFrameAttribution` was not relocated into the plugin.** Reasoned above under census 2.
- **No null source-text view was built.** Reasoned above under census 2. It is the remaining piece
  of *The host canvas is complete without plugins* for this column, and it is a real deliverable.

## Bycatch

- **A focused terminal PANEL swallows `Control+P` even after focus returns to the editor.** With the
  panel open and `status.focus === 'editor'`, `Control+P` produces nothing: no overlay, no
  `quickOpenOpen`, no frame. Probed 20 times over 2 s. **Reproduced on the unmodified tree at
  `e13e2ef8`** with the same probe appended to the same smoke, so it is not this branch. This is the
  #114 Wave B shape one step further on — a pane consuming a global chord it should not — but the
  workspace focus has already left the pane, which makes it a different bug from the one Wave B
  fixed. NOT fixed: it is keyboard routing, which is #228's, and guessing at it here would be scope
  creep. Worked around in the new smoke arm by closing the panel first, with the reason in a comment
  beside it.
- **`bun run drive --size N` still cannot open the file it creates.** Unchanged from #218, #219 and
  #122: ripgrep is absent here, Quick Open falls back to `git ls-files`, and `.gitignore` hides
  `tmp/`. Worked around the same way.
- **A drive workspace outside a git repository shows an EMPTY file tree**, and publishes
  `gitError="fatal: not a git repository"` while the Files pane simply shows nothing. Reproduced
  every time; `git init` in the same directory makes the tree populate immediately. The tree has no
  reason to need a repository to list a directory, and an empty tree is the same class of invisible
  failure as #216's empty-complete enumeration. Costs every new drive script one wrong turn.
  Reproduction: `mkdir /tmp/x && touch /tmp/x/a.ts && bun run drive --open /tmp/x`.
- **`EditorSourceTextViews` was NOT the only stale import in `Bootstrap`.** `BracketMatch` was
  imported and never used. Removed as part of this change rather than as a separate commit, because
  it is one line inside the same file and the same subject (the host's editor imports) — flagged
  here so it is reviewed rather than discovered.
- **The invariant record *The editor owns no view state* still has no citing annotation**, and
  `editor.invariants.md` still emits `one category is empty — fine while bootstrapping`. Both
  pre-existing, both already on the record from #219 and #122.
- No mispainted cell, focus jump, stall, or wrong glyph was seen in any drive, at any of the three
  scales, before or after.

## What this task says

#122 found a rule living only in a folder name. #218 found one living only in a comment beside a
cast. #219 found one living only in the ORDER of two statements. This one found the fourth verse:
**a rule living only in the fact that nobody had ever run the code.**

`releaseSourceTextViews` was written, tested, and documented in #219. Its test passed. Its invariant
component was recorded. And it was WRONG — it disposed buffers behind the buffer set's back, leaving
every open tab pointing at a corpse, so an uninstalled editor could never come back. The test passed
because it asserted the disposal count and the surviving documents, which is what the author was
thinking about, and never asserted that the thing could be turned back ON.

An uninstall that is never followed by a reinstall is a half-measurement. Wave B's positive control
plants a leak and checks it reds; that catches the release that does not run. It does not catch the
release that runs and destroys the ability to recover. The arm that found this was the last four
lines of the new smoke: reinstall, reopen, and look at the screen.

The other finding is smaller and about seam shape. `EditorSurfaceContents` and `EditorColumnDefault`
look like the same registry and are not. One holds contenders for a slot; the other holds the slot's
identity. Merging them was the tempting move, and the tell against it was AGENTS.md rule 2's: the
editor would have had to implement — and suppress — ten members of a contract about being a
temporary claimant, in order to say the permanent thing.
