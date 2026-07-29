# Editor — Invariants

Load-bearing rules for `src/modules/editor/` — the SOURCE-TEXT VIEW (`Editor`, `EditorWrap`,
`EditorPane`, `EditorPaneRenderer`, `BracketMatch`, `CodeFolding`, `Cursor`, `Viewport`,
`ReadOnlyTextBuffer`) and the `storage` undo store it drives. Stands on `project.invariants.md`;
references are by name. Several records are `provisional` because the fast-built M3 code partially
violates them — those violations are the coordinate/selection rework backlog, and each record's
Verification is what promotes it to `established` as the rework lands.

The shared text primitives this view stands on — coordinate conversion, word edits, the editable
field model, the break generator, and the document model — live in `src/modules/text/` and are
governed by `src/modules/text/text.invariants.md`. Four records moved there with them.

## Reality-based invariants

(None. The one reality-based record here, *A cursor position resolves to three distinct
coordinates*, governs `TextCoordinates` and moved to `src/modules/text/text.invariants.md`.)

## Chosen invariants

### Undo records deltas not whole-document snapshots

**Invariant:** If an edit is recorded for undo, then the stored cost is proportional to the edit
size, not the document size.

**Scope:** `storage/UndoStore` + `Editor.captureBefore`.

**Mechanism:** `TextDocument.replaceLineRange` publishes one localized replacement fact.
`Editor.captureBefore` begins a pending group and `UndoStore.recordChange` retains copies of only
its deleted and inserted lines. Typing coalesces small deltas; undo applies them in reverse and
redo applies them forward through the same document write path.

**Generates:** O(edit) undo capture and memory; bounded coalesced history; one mutation seam for
ordinary edits, undo, and redo.

**Evidence:** `src/modules/editor/TextDocument.ts` (`onLineChange`, `applyLineChange`);
`src/modules/editor/Editor.ts`; `src/modules/storage/UndoStore.ts` and its tests.

**Impossible if true:** a typing path calling `document.snapshot()` or undo memory growing with
file size rather than edit size.

**Verification:** `bun test src/modules/editor/Editor.test.ts
src/modules/storage/UndoStore.test.ts`; `bun scripts/ast-query.ts named-calls snapshot --path
src/modules/editor --require-zero`.

**Status:** established

**Last refined:** 2026-07-28

### Selection is an anchor plus the cursor and edits replace it

**Invariant:** If a selection is active, then it is the range between a fixed anchor and the live
cursor, and any insert/delete/paste replaces exactly that range and collapses the selection;
copy/cut read exactly that range as grapheme-correct text.

**Scope:** `Cursor` (anchor), `ReadOnlyTextBuffer` selection/copy, `Editor` replacement edits, and
each view's selection highlight.

**Mechanism:** `ReadOnlyTextBuffer` composes `TextDocument` and `Cursor`, reads the normalized
anchor-to-cursor range, and copies it through `Clipboard`. `Editor` extends that raw class and
deletes the same range before mutation. Spans use the grapheme coordinate model (first reality
invariant above).

**Generates:** shift+arrow / mouse-drag selection; selection-aware editing; copy/cut/paste; the
selection highlight in `RootView`.

**Evidence:** `Cursor.ts` `anchor` + `selectionRange()`; `ReadOnlyTextBuffer.ts`
`selectionText`/`copySelection`/`selectAll`; `Editor.ts` selection-aware
`insertText`/`insertNewline`/`backspace`/`deleteChar` and `cutSelection`/`pasteClipboard`;
`ReadOnlyTextBuffer.test.ts`; `EditorSelection.test.ts`; `scripts/smoke-editor.sh`.

**Impossible if true:** typing over a selection that leaves the selected text in place; a copy
that returns text split mid-grapheme; a paste that inserts without removing the selection.

**Verification:** tests for shift-extend, replace-on-insert, and copy/cut/paste round-trip
(including a multi-line and an astral-char selection).

**Status:** established

**Last refined:** 2026-07-24

### Read-only text behavior excludes editing

**Invariant:** If a surface needs document text, cursor selection, clipboard copy, and find
targeting without mutation, then it consumes `ReadOnlyTextBuffer`, while `Editor` alone adds
editing, undo, persistence, and viewport behavior.

**Scope:** `ReadOnlyTextBuffer`, `Editor`, `DiffView`, and `MarkdownSplitView`.

**Mechanism:** The raw stateful `ReadOnlyTextBuffer` composes `TextDocument` and `Cursor` and
publishes only selection, copy, and read-only `FindBarTarget` behavior. `Editor` extends its
`$Class`; Diff and Markdown construct the raw class directly.

**Generates:** One selectable and searchable read-only text model; an editable `Editor` layer
without dead mutation paths in Diff or Markdown.

**Rejected alternatives:** Construct `Editor` and set `readOnly` — every read-only consumer
inherits mutation, undo, persistence, and viewport behavior it must suppress.

**Evidence:** `src/modules/editor/ReadOnlyTextBuffer.ts`;
`src/modules/editor/ReadOnlyTextBuffer.test.ts`; `src/modules/editor/Editor.ts`;
`src/modules/diff/DiffView.ts`; `src/modules/markdown/MarkdownSplitView.ts`.

**Impossible if true:** `DiffView` or `MarkdownSplitView` importing or constructing `Editor`; a
`ReadOnlyTextBuffer` exposing insert, delete, undo, redo, save, or viewport state.

**Verification:** `bun test src/modules/editor/ReadOnlyTextBuffer.test.ts && ! rg "new Editor\\.Class|from '../editor/Editor'" src/modules/diff src/modules/markdown`

**Status:** established

**Last refined:** 2026-07-24

### Word wrap is a pure view mapping

**Invariant:** If word wrap is on, then rendering, the caret, selection, mouse hit-testing, and
vertical movement all route through ONE logical↔visual mapping layer (`EditorWrap.ts`), and the
document model is untouched — wrap segments are descriptors over each line's grapheme axis, never
document content.

**Scope:** `Editor` (the `wordWrap` mode ref, `placeCursor`, `moveVertical`, the wrapped reveal),
`EditorWrap.ts` (the mapping layer), and `ui/RootView`'s wrap-mode branches (render, caret,
`applySelection`, `documentPositionAtCell`). Wrap OFF is out of scope — that mode keeps the
clip+h-scroll behavior governed by *One visible file line is one visual row when word wrap is off*
(ui.invariants.md).

**Mechanism:** `EditorWrap` (Static capability) wraps a line into `{startGrapheme, endGrapheme,
startDisplayColumn}` segments and asks `WrapBreakOpportunity` for code-profile boundaries.
Segments remain grapheme-safe (a cluster never splits), tab/wide-aware via the coordinate model,
and memoized by width+content (content-keyed = revision-proof). `visualRowsForWindow` is the
O(window) flyweight walk (scrollTop stays a LOGICAL line index; the window starts at that line's
first visual row). Every consumer converts through this one layer: the goal column becomes
row-relative, `moveVertical` steps visual rows via `moveByVisualRows`, the reveal via
`scrollTopToRevealCursor`, and the view maps cells with `wrapVisualPosition`. Horizontal scroll is
inert (`scrollLeft` forced 0 on enable; wheel/edge X-scroll guarded off). Stands on *A cursor
position resolves to three distinct coordinates*.

**Generates:** the wrap render branch (continuation rows with blank gutters); a caret cell correct
against tmux's own cursor in wrap mode; wrapped-row selection mapping; visual-row vertical
movement and paging; the wrap test matrix (`EditorWrap.test.ts`).

**Evidence:** `EditorWrap.ts` computes only descriptors (no document writes — the module imports
no mutation surface); `WrapBreakOpportunity.test.ts` and `EditorWrap.test.ts` cover profiled
boundaries and segment geometry; `EditorWrap.test.ts` asserts toggling wrap twice leaves `revision`,
`text`, and `dirty` untouched; `RootView` wrap branches all read through `wrapRowsWindow` +
`wrapVisualPosition` (one mapping, no second wrap computation path).

**Impossible if true:** a document mutation caused by toggling wrap; a caret cell that disagrees
with tmux's cursor position in either mode; two consumers disagreeing about which visual row a
document position occupies (there is only one mapping to disagree with).

**Open question:** rendered tab expansion inside a NON-FIRST segment starts from the segment
slice, while the mapping expands tabs on the logical line's continuous column axis — a tab that
crosses a wrap boundary can render a different width than the mapping assumes (same class of edge
as the wrap-off column-virtualization slice; revisit if human QA hits it).

**Verification:** `bun test src/modules/editor/WrapBreakOpportunity.test.ts
src/modules/editor/EditorWrap.test.ts` (profile boundaries, segment partition/width/cluster-safety,
CJK/emoji/tab boundaries, exact-width lines, 500-char unbroken runs, O(height) reveal walk, mode
toggling purity) plus `bun scripts/harness/smoke-wrap-harness.ts`: every fixture line exceeds the
observed viewport, readable tokens stay whole, the final visual row reaches the logical end, the
caret cell matches the native cursor, and toggling wrap off restores consecutive logical rows.

**Status:** provisional

**Last refined:** 2026-07-21

### One generator owns document-line-to-visual-row

**Invariant:** If document lines are projected into editor visual rows, then the `EditorWrap`
cumulative index is the only mapping authority, with wrapping contributing segment counts and
folding contributing zero-row hidden lines.

**Scope:** Editor rendering, navigation, selection, pointer mapping, scrolling, scrollbars, and
fold gutters.

**Mechanism:** `TextDocument.lastLineChange` crosses every document boundary and names the changed
range. `CodeFolding` discovers exact ranges only for observed gutter starts; a delimiter walk
publishes every nested range it encounters, and the sparse snapshot survives non-structural edits.
Known collapsed starts reuse those exact range objects, while commands that need every range
complete the same snapshot. `EditorWrap.syncWrapIndex` owns reusable `Uint32Array` row counts,
4096-line block totals, and a typed visible-line mapping with unchanged value semantics. A known
document change patches its rows; a fold toggle follows the same rule, patching only its changed
body and touched block totals. Both reuse every index array. The reactive revision publishes the
in-place result; `visualRowsFromOffset` remains the shared window.

**Generates:** One folded/wrapped extent and window for gutter, code, caret, selection, and pointer
mapping.

**Rejected alternatives:** Apply folding after wrap projection — different consumers can consult
different maps and disagree about the same document position.

**Evidence:** The three named editor modules and focused tests; the scale-edit and nested-fold-edit
modes of `scripts/harness/measure-input-byte-flush.ts`.

**Impossible if true:** Two disagreeing document-line-to-visual-row mappings consulted by different
consumers; a same-line edit allocating or writing an amount that changes with document size or
collapsed state; a fold toggle rebuilding document-sized arrays instead of patching its body; a
flat no-fold gutter globally discovering absent ranges; a wrapper dropping the change fact; an
index array escaping `EditorWrap`.

**Verification:** `bun test src/modules/editor/CodeFolding.test.ts
src/modules/editor/EditorFrameAttribution.test.ts
src/modules/editor/EditorWrapIndex.test.ts`; the three zero-match AST censuses in
`scripts/conventions-gate.sh`; `INPUT_BYTE_FLUSH_MODE=scale-edit bun
scripts/harness/measure-input-byte-flush.ts`; `INPUT_BYTE_FLUSH_MODE=nested-fold-edit bun
scripts/harness/measure-input-byte-flush.ts`.

**Status:** established

**Last refined:** 2026-07-28

### Editor frame work is independent of document length

**Invariant:** If the editor renders the same viewport and gesture over
unchanged documents of different lengths, then document-line reads,
fold and wrap projection lookups, and layout computations per frame are
identical.

**Scope:** The flat editor scroll path at fixed terminal geometry, settings,
fixture shape, and input gesture. Fold density, word wrap, gutter marks,
indent guides, scroll depth, and the diff surface are separate axes.

**Mechanism:** `EditorFrameAttribution` brackets `RootView.update()` and
counts operations at the shared editor projection seams. The frame-settled
status channel publishes cumulative integer totals, so
`measure-scroll-smoothness.ts` compares exact count deltas per attributed
frame between its 2,000-line and 100,000-line fixtures.

**Generates:** A machine-independent ratio contract on editor scroll work;
wall-clock FPS retained only as one secondary canary per surface.

**Evidence:** `src/modules/editor/EditorFrameAttribution.ts`;
`src/modules/ui/EditorPaneRenderer.ts`;
`scripts/harness/measure-scroll-smoothness.ts`; the
`glide-smoothness` behavioral contract.

**Impossible if true:** A per-frame quantity that scales with document
length.

**Verification:** `bash scripts/behavioral-contracts.sh` reports the
2,000-line and 100,000-line counts and requires every count-per-frame ratio
to equal 1.

**Status:** provisional

**Last refined:** 2026-07-27

### A fold toggle preserves the viewport anchor

**Invariant:** If a fold is toggled while the editor is scrolled, then the topmost visible
document row is translated through the new fold projection and remains the viewport anchor; the
toggle never resets the canvas to document row zero. A cursor inside a newly collapsed body still
moves to its fold header.

**Scope:** Pointer fold controls and the fold/unfold keyboard commands.

**Mechanism:** `Editor.toggleFoldAtLine` records the pre-toggle topmost document row from
`EditorWrap`, mutates fold state, then restores that row through the rebuilt line-to-visual-row
index and clamps only to the new extent.

**Generates:** A fold header that stays at the same screen row for pointer and keyboard toggles,
except for the minimum displacement required when the old anchor itself becomes hidden.

**Evidence:** `src/modules/editor/Editor.test.ts`;
`scripts/harness/smoke-code-folding-harness.ts`.

**Impossible if true:** Clicking a fold control around document line 500 reveals line zero, or
folding and immediately unfolding changes an otherwise-valid viewport anchor.

**Verification:** `bun test src/modules/editor/Editor.test.ts && bun
scripts/harness/smoke-code-folding-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-26

### Geometry aggregates match their consumers

**Invariant:** If a geometry aggregate supplies a consumer, then it is computed exactly at that
consumer boundary and not computed where nothing consumes it.

**Scope:** Editor scroll extents and scrollbar proportions. The no-wrap horizontal clamp consumes
the exact full-document maximum display width. The vertical clamp in both wrap modes consumes the
exact visual-row extent after folding. The vertical thumb consumes that same exact total together
with the exact layout viewport;
only its final projection onto whole terminal cells is quantized.

**Components:**
- *Exact hard boundaries* — `TextDocument.maximumLineWidth` is the true full-document display
  width for the no-wrap horizontal clamp, and `EditorWrap.totalVisualRows` is the true visual-row
  count for the vertical clamp after wrapping and folding contribute their row counts.
- *Exact proportional inputs* — a vertical thumb ratio uses the exact layout viewport rows and the
  exact visual-row total. Its whole-cell length is quantized from that
  position-independent ratio, never from independently rounded moving endpoints.
- *Absent unused aggregate* — an aggregate with no consumer in its owning surface is not
  computed or incrementally maintained.

**Mechanism:** `TextDocument` maintains one exact width champion. Local edits measure only their
replacements unless they remove the champion without an equal-or-wider replacement; only then does
`rebuildMaximumLineWidth` rescan with its cheap upper-bound prefilter. The no-wrap horizontal
consumers read that exact width. `ScrollbarSync` supplies the vertical bar with
`EditorWrap.totalVisualRows` and the live layout viewport in both wrap modes; the solid thumb
rasterizer derives one whole-cell length from those constant inputs and moves only its start.

**Generates:** one full-document horizontal extent authority for momentum, drag auto-scroll, and
the horizontal scrollbar; one exact visual-row extent for wrapping, folding, momentum, paging, and
the vertical scrollbar; a stable thumb while vertically scrolling unchanged content.

**Rejected alternatives:** Recompute width from visible lines — the clamp and thumb change when
the viewport moves although document geometry did not. Use logical-line count for the wrap clamp —
this strands lower visual rows. Independently round both moving thumb endpoints — their parity can
change a whole-cell extent even though viewport and total rows are constant.

**Evidence:** The 2026-07-24 scrollbar regression changed horizontal thumb length while vertical
scroll exposed different-width lines. The 2026-07-25 `JpegDecoder.test.ts` regression stopped
Alt-wheel at the opening viewport width before the deep widest line's true end.
`src/modules/editor/TextDocument.ts`; `src/modules/editor/Editor.ts`;
`src/modules/editor/EditorWrap.ts`; `src/modules/workspace/Workspace.ts`;
the `wrap-scroll` behavioral contract.

**Impossible if true:** Alt-wheel stopping before the true end of a deep widest line; a horizontal
or vertical thumb changing length while unchanged content scrolls; viewport rows or total rows
changing merely because scrollTop changed; wrap-mode vertical scrolling stopping at logical-line
extent before the true last visual row.

**Verification:** `bun test src/modules/editor/__tests__/editor-core.test.ts
src/modules/workspace/Workspace.scroll.test.ts && bun
scripts/harness/smoke-horizontal-extent-harness.ts && bash scripts/behavioral-contracts.sh && bun
scripts/harness/smoke-scrollbars-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-26

### A structural line edit is one atomic undo step that keeps the cursor on the moved line

**Invariant:** Moving the cursor's line up or down (swap with the neighbour) and duplicating it are each
a SINGLE undoable edit: one `captureBefore` snapshot precedes the mutation, so one `performUndo` reverts
the whole operation and restores the cursor. The cursor stays on the MOVED line (its content follows the
edit), same column clamped to that line. A move is a no-op at the top/bottom edge (no snapshot recorded,
so undo is not polluted with an empty step). The ops mutate only the document model — no render path.

**Scope:** `Editor.moveLineUp` / `moveLineDown` / `duplicateLine`; `TextDocument.setLine` / `insertLine`;
the snapshot-based undo (`UndoStore`, kind `'other'` which never coalesces with a typing run).

**Mechanism:** each method guards read-only / no-document and the edge case, calls `captureBefore('other')`
(snapshots document + cursor onto the undo stack), then swaps lines via `setLine` (move) or inserts a copy
via `insertLine` (duplicate), and `placeCursor`s onto the moved/copied line at the clamped column.
`performUndo` restores the snapshot in one step. `'other'` kind means the step is never merged into an
adjacent insert/delete run.

**Generates:** VS Code-style Move Line Up/Down + Duplicate Line where one Ctrl+Z undoes the whole move;
the cursor tracking the line so repeated moves walk it up/down; edges that simply stop.

**Evidence:** `src/modules/editor/EditorMoveLine.test.ts` (move up/down reorders the lines and the cursor
follows; edge no-op leaves the doc and undo stack untouched; duplicate inserts the copy below with the
cursor on it; a single `performUndo` reverts each op exactly); `scripts/smoke-move-line.sh` drives the
commands in the real app and asserts the document reordered + cursor followed + one undo restored.

**Impossible if true:** a move/dup that needs two undos to revert; a move that leaves the cursor on the
old line index; a top/bottom-edge move that records an empty undo step or wraps around; a line edit that
touches a renderable.

**Verification:** `bun test src/modules/editor/EditorMoveLine.test.ts && bash scripts/smoke-move-line.sh`

**Status:** provisional

**Last refined:** 2026-07-23

### A matched bracket pair is balanced within the same family

**Invariant:** When the cursor is ON or immediately AFTER a bracket `()[]{}`, its match is the balanced
partner found by scanning in the correct direction (forward for an opener, backward for a closer) and
counting nesting depth WITHIN THE SAME FAMILY — a `(` counts only `(`/`)`, ignoring `[]`/`{}`. The scan
is bounded by a cell cap so a pathological unbalanced file can never hang; an unbalanced bracket, a
non-bracket cursor, or a cap hit yields no match. The finder is pure — cells and a code-bracket
predicate are injected — so the whole algorithm is unit-testable with plain arrays.

**Scope:** `BracketMatch.find` (pure core), `BracketMatch.findInDocument` (document wiring), and the
`EditorPaneRenderer` bracket-highlight painting.

**Mechanism:** `find` locates the active bracket (cell under the cursor, else the cell before it),
picks the partner char and scan direction, and walks cells across line boundaries incrementing depth on
a same-family opener and decrementing on its partner; depth 0 at the partner is the match. `findInDocument`
supplies grapheme cells from the document and the predicate. Its result is cached by document
revision, cursor, and language, so an unchanged frame performs an O(1) snapshot lookup rather than
rescanning the same cells. `EditorPane` passes the two cells to the renderer, which recolours only
cells on a visible line.

**Generates:** GitLens/VS-Code-style bracket matching that highlights the cursor's bracket and its true
partner across lines; a bounded, hang-proof scan; a pure, exhaustively testable core.

**Evidence:** `src/modules/editor/BracketMatch.test.ts` (nesting, adjacency, multi-line, per-family
matching, unbalanced → null, scan cap → null); `scripts/smoke-bracket-match.sh` (cursor on a `{` paints
the matching `}` cell; moving off clears it).

**Impossible if true:** a match that crosses bracket families incorrectly counting `[` against
`(`; a scan that hangs on an unbalanced file; a highlight when the cursor is not on a bracket; an
unchanged scroll frame rescanning document cells for the same cursor match.

**Verification:** `bun test src/modules/editor/BracketMatch.test.ts && bash scripts/smoke-bracket-match.sh`

**Status:** provisional

**Last refined:** 2026-07-23

### Bracket matching skips brackets inside strings and comments

**Invariant:** A bracket counts for matching only when it is real code — a bracket inside a string or a
comment is skipped, both as the cursor bracket and during the scan. This uses the existing per-line
syntax tokenizer: a bracket counts only when its span role is `operator`. Plain text (no language) has
no strings/comments, so every bracket counts there.

**Scope:** `BracketMatch.findInDocument` (the `isCodeBracket` predicate backed by `Highlighter`), and
the `find` core which consults the predicate for both the cursor bracket and every scanned bracket.

**Mechanism:** `findInDocument` tokenizes a line (memoized within the call) and maps the bracket's UTF-16
offset to its span; the predicate returns true only for role `operator`. `find` skips any bracket the
predicate rejects — so a `)` inside `"a)b"` is never matched, and a bracket inside a `// comment` is
ignored. LIMITATION (flagged in-file): the tokenizer is line-local, so a string/comment SPANNING lines
is not tracked across the newline.

**Generates:** matches that respect code structure — the `(` of a call is paired with its real `)`, not
a parenthesis that happens to sit inside a nearby string literal.

**Evidence:** `src/modules/editor/BracketMatch.test.ts` (a predicate-rejected bracket is skipped mid-scan;
`findInDocument('f( "a)b" )')` matches the real `)` at column 9, not the string's `)` at column 5).

**Impossible if true:** a call's `(` matching a `)` inside a string literal; a comment's bracket
participating in a match on the same line.

**Verification:** `bun test src/modules/editor/BracketMatch.test.ts`

**Status:** provisional

**Last refined:** 2026-07-23

## Folded records

**The editor owns no view state** formerly stood between *Word wrap is a pure view mapping* and
*One generator owns document-line-to-visual-row*. The state/projection split now lives in
[*ivue owns state and OpenTUI owns projection*](../../../project.invariants.md#ivue-owns-state-and-opentui-owns-projection).
The ban on model truth in renderables and on render-time model writes lives in
[*Renderables hold no model state*](../ui/ui.invariants.md#renderables-hold-no-model-state) and
[*Data flows one way*](../../../project.invariants.md#data-flows-one-way). The source-text
projection boundary lives in
[*The source text editor is a pane content citizen*](../ui/ui.invariants.md#the-source-text-editor-is-a-pane-content-citizen).
Persistent fold state now belongs to the stable document handle under
[*Document identity survives document instance replacement*](../workspace/workspace.invariants.md#document-identity-survives-document-instance-replacement).
The cursor and viewport ownership correction is recorded in
[`project.decisions.md`](../../../project.decisions.md#the-cursor-and-the-scroll-window-are-text-primitives-not-view-parts-218-2026-07-29).
