# Editor — Invariants

Load-bearing rules for `src/modules/editor/` (`ReadOnlyTextBuffer`, `Editor`, `TextDocument`,
`Cursor`, `Viewport`) and the `storage` undo store it drives. Stands on `project.invariants.md`;
references are by name. Several records are `provisional` because the fast-built M3 code partially
violates them — those violations are the coordinate/selection rework backlog, and each record's
Verification is what promotes it to `established` as the rework lands.

## Reality-based invariants

### A cursor position resolves to three distinct coordinates

**Invariant:** If a position in a document is referenced, then its grapheme index, its UTF-16
offset, and its display column are distinct values, and each consumer uses the coordinate its
domain requires — editing on graphemes, LSP on UTF-16, rendering on display columns.

**Scope:** Cursor, selection, all edit operations, LSP position mapping, the view's caret and
column readout. Per line (positions are line-relative).

**Mechanism:** An explicit coordinate model over each line's string converts grapheme ↔ UTF-16 ↔
display column, accounting for surrogate pairs, combining marks, wide (2-column) glyphs, and tab
expansion. Realizes the project invariant *A text position has several encodings* inside the
editor. The conversions are backed by per-line, content-memoized indices — a grapheme-boundary
array AND a display-column prefix-sum (`EditorCoordinates.displayColumnPrefix`) — so `displayColumn`
/ `lineWidth` are O(1) and `graphemeAtDisplayColumn` an O(log n) binary search after a line is
scanned once. This is the HORIZONTAL twin of the line flyweight: a selection drag, mouse hit-test,
or horizontal scroll over a single 500k-column line (a minified `.js.map`) costs index-time per
frame, not line-length-time — realizing *Cost tracks the actively observed set* along the column
axis, the same way the visual-row window realizes it along the row axis.

**Generates:** grapheme-safe movement and backspace; a UTF-16 mapping layer for the LSP client;
a display-column caret and wide/tab-aware rendering; the coordinate test matrix.

**Evidence:** `project.invariants.md` → *A text position has several encodings*. Current code
conflates all three as UTF-16 (`TextDocument.ts:120,143`, `Cursor.ts:3` labels col "logical" but
uses `String.length`/`.slice`) — the gap this record governs.

**Impossible if true:** a backspace that deletes half a surrogate pair; a caret drawn at a column
that disagrees with the character beneath it on a line containing tabs or wide glyphs.

**Open question:** current M3 code is UTF-16-only; the coordinate rework establishes the
three-coordinate model before LSP and selection build on it.

**Verification:** a coordinate test matrix over ASCII, astral (emoji), combining marks, wide
(CJK) chars, tabs, and CRLF — asserting movement/backspace land on grapheme boundaries and the
display column matches the rendered caret.

**Status:** provisional

**Last refined:** 2026-07-21

## Chosen invariants

### Every document mutation bumps the revision exactly once

**Invariant:** If the document's line content changes, then `revision` is incremented exactly
once for that change, so async consumers (syntax, LSP, git) can stamp and discard stale results.

**Scope:** All `TextDocument` mutation methods.

**Mechanism:** Each mutator (`insertInline`, `splitLine`, `deleteBackward`/`Forward`, `setLine`,
`insert`/`removeLine`, `replaceAll`, `restore`) does `this.revision.value++` after the edit.

**Generates:** the revision-stamping substrate that *Async results are revision-stamped* consumes;
the syntax/LSP stale-drop.

**Evidence:** `TextDocument.ts:44,87,94,100,110,125,138,148,170,188` — every mutator bumps once.

**Impossible if true:** a mutation that changes lines without bumping `revision`; a single edit
that bumps twice (double-invalidation).

**Verification:** a test asserting `revision` increments by exactly 1 per edit op and is unchanged
by pure reads (`line`, `slice`, `text`).

**Status:** provisional

**Last refined:** 2026-07-21

### Undo records deltas not whole-document snapshots

**Invariant:** If an edit is recorded for undo, then the stored cost is proportional to the edit
size, not the document size.

**Scope:** `storage/UndoStore` + `Editor.captureBefore`.

**Mechanism:** Undo stores the inverse edit (range + removed/inserted text) against the piece
table, not a full `_lines.slice()`. Realizes *Cost tracks the actively observed set* for edit
history.

**Generates:** O(edit) undo memory; the piece-table delta store; bounded history that scales to
large files.

**Evidence:** currently VIOLATED — `Editor.ts:41` snapshots `document.snapshot()` (`_lines.slice()`)
per keystroke, O(document) each; `storage/UndoStore.ts` is the snapshot fallback. The piece table
named in `project.decisions.md` #7 is unbuilt.

**Impossible if true:** undo memory that grows with file size rather than with the number/size of
edits.

**Open question:** rework replaces snapshot-undo with a piece-table delta store; until then this
is the known cost stress on large files.

**Verification:** a test editing a large document and asserting per-step undo memory is bounded by
edit size, not line count.

**Status:** provisional

**Last refined:** 2026-07-21

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

### Word deletion uses navigation boundaries

**Invariant:** If word deletion runs at position P, then delete-previous-word removes
`[wordLeft(P), P]` and delete-next-word removes `[P, wordRight(P)]`, using the same
`TextEditing` boundaries as word navigation; an active editor selection is deleted instead.

**Scope:** `TextEditing`, `Editor.moveWordHorizontal`, `Editor.deletePreviousWord`, and every present
text input through `TextInputModel`: command-palette query, `QuickOpen.query`, both `FindBar` fields,
and `AgentComposer`. A settings or find-in-files text field inherits this rule when one exists; the
current settings panel has no text field and the current search view is not mounted.

**Mechanism:** `TextEditing.deletePreviousWord` calls `wordLeft`; `deleteNextWord` calls
`wordRight`; both return the deletion range plus edited text. Editor navigation consumes the same
boundaries; editor deletion consumes the previous-word range through `TextDocument.deleteRange`;
`TextInputModel` consumes both edited results. Newlines are hard boundaries.

**Generates:** One grapheme-safe boundary for navigation and deletion; identical word, whitespace,
punctuation, and line-boundary behavior across editor and text inputs; one undo step per editor word
deletion.

**Evidence:** `src/modules/editor/TextEditing.ts`; `src/modules/editor/TextInputModel.ts`;
`src/modules/editor/Editor.ts`; `src/modules/editor/TextEditing.test.ts`;
`src/modules/editor/TextInputModel.test.ts`; `scripts/smoke-word-delete.sh`.

**Impossible if true:** word navigation jumping to one position while word deletion starts at another;
Alt+Delete closing a buffer; a find, replace, quick-open, or palette query deleting a different span
than the editor for the same text and cursor position.

**Verification:** `bun test src/modules/editor/TextEditing.test.ts src/modules/editor/TextInputModel.test.ts && bash scripts/smoke-word-delete.sh`

**Status:** provisional

**Last refined:** 2026-07-25

### Word wrap is a pure view mapping

**Invariant:** If word wrap is on, then rendering, the caret, selection, mouse hit-testing, and
vertical movement all route through ONE logical↔visual mapping layer (`editor.wrap.ts`), and the
document model is untouched — wrap segments are descriptors over each line's grapheme axis, never
document content.

**Scope:** `Editor` (the `wordWrap` mode ref, `placeCursor`, `moveVertical`, the wrapped reveal),
`editor.wrap.ts` (the mapping layer), and `ui/RootView`'s wrap-mode branches (render, caret,
`applySelection`, `documentPositionAtCell`). Wrap OFF is out of scope — that mode keeps the
clip+h-scroll behavior governed by *One file line is one visual row when word wrap is off*
(ui.invariants.md).

**Mechanism:** `EditorWrap` (Static capability) wraps a line into `{startGrapheme, endGrapheme,
startDisplayColumn}` segments — word breaks preferred, grapheme-safe (a cluster never splits),
tab/wide-aware via the coordinate model, memoized by width+content (content-keyed =
revision-proof). `visualRowsForWindow` is the O(window) flyweight walk (scrollTop stays a LOGICAL
line index; the window starts at that line's first visual row). Every consumer converts through
this one layer: the goal column becomes row-relative, `moveVertical` steps visual rows via
`moveByVisualRows`, the reveal via `scrollTopToRevealCursor`, and the view maps cells with
`wrapVisualPosition`. Horizontal scroll is inert (`scrollLeft` forced 0 on enable; wheel/edge
X-scroll guarded off). Stands on *A cursor position resolves to three distinct coordinates*.

**Generates:** the wrap render branch (continuation rows with blank gutters); a caret cell correct
against tmux's own cursor in wrap mode; wrapped-row selection mapping; visual-row vertical
movement and paging; the wrap test matrix (`EditorWrap.test.ts`).

**Evidence:** `editor.wrap.ts` computes only descriptors (no document writes — the module imports
no mutation surface); `EditorWrap.test.ts` asserts toggling wrap twice leaves `revision`, `text`, and
`dirty` untouched; `RootView` wrap branches all read through `wrapRowsWindow` +
`wrapVisualPosition` (one mapping, no second wrap computation path).

**Impossible if true:** a document mutation caused by toggling wrap; a caret cell that disagrees
with tmux's cursor position in either mode; two consumers disagreeing about which visual row a
document position occupies (there is only one mapping to disagree with).

**Open question:** rendered tab expansion inside a NON-FIRST segment starts from the segment
slice, while the mapping expands tabs on the logical line's continuous column axis — a tab that
crosses a wrap boundary can render a different width than the mapping assumes (same class of edge
as the wrap-off column-virtualization slice; revisit if human QA hits it).

**Verification:** `EditorWrap.test.ts` (segment partition/width/cluster-safety properties, CJK/emoji/tab
boundaries, exact-width lines, 500-char unbroken runs, O(height) reveal walk, mode toggling purity)
+ the live tmux pass: wrapped long line occupies multiple rows with the gutter number only on the
first, caret cell == tmux `#{cursor_x},#{cursor_y}` mid-wrapped-line, toggle OFF restores the
wrap-off smoke (`smoke-editor.sh` ALL-PASS).

**Status:** provisional

**Last refined:** 2026-07-21

### The editor owns no view state

**Invariant:** If the editor holds state, then it is document/cursor/selection/viewport model
state only — never terminal geometry or rendering artifacts; the view pulls from the editor and
writes nothing back into it.

**Scope:** `Editor`, `Cursor`, `Viewport` vs `ui/RootView`.

**Mechanism:** The editor exposes model state; `RootView.update()` reads it to build renderables
and holds no model state. Realizes *ivue owns state, OpenTUI owns projection* and *Data flows one
way* at the editor boundary.

**Generates:** the stateless renderable in `RootView`; the viewport as model state the view reads.

**Evidence:** `RootView.ts:211` holds no model state and pulls each `update()` — upheld. One edge
to watch: `Bootstrap.ts:78` writes `viewport.setSize(view.…())` from frame geometry into model
state — controlled (outside any render pass) but it is projection→model flow; keep it the only
such edge and out of the reactive frame effect.

**Impossible if true:** a renderable that is the source of scroll/selection truth; the editor
storing terminal width/height as anything but a viewport input.

**Verification:** grep/review — renderables hold no model fields; the only projection→model write
is the single `setSize` edge, asserted not to run inside the frame effect.

**Status:** provisional

**Last refined:** 2026-07-21

### Geometry aggregates match their consumers

**Invariant:** If a geometry aggregate supplies a consumer, then it is computed exactly at that
consumer boundary and not computed where nothing consumes it.

**Scope:** Editor scroll extents and scrollbar proportions. The no-wrap horizontal clamp consumes
the exact full-document maximum display width. The wrap vertical clamp consumes the exact visual-row
extent. The vertical thumb consumes that same exact total together with the exact layout viewport;
only its final projection onto whole terminal cells is quantized.

**Components:**
- *Exact hard boundaries* — `TextDocument.maximumLineWidth` is the true full-document display
  width for the no-wrap horizontal clamp, and `EditorWrap.totalVisualRows` is the true visual-row
  count for the wrap vertical clamp.
- *Exact proportional inputs* — a vertical thumb ratio uses the exact layout viewport rows and the
  exact logical or wrapped total rows. Its whole-cell length is quantized from that
  position-independent ratio, never from independently rounded moving endpoints.
- *Absent unused aggregate* — an aggregate with no consumer in its owning surface is not
  computed or incrementally maintained.

**Mechanism:** `TextDocument.rebuildMaximumLineWidth` seeds from integer UTF-16 lengths, rejects
lines whose two-columns-per-code-unit upper bound cannot beat the champion, and exactly measures
only surviving candidates; tab lines always survive to exact measurement. Local edits compare only
replacements unless the champion shrinks or disappears, which reruns the same prefilter. The no-wrap
horizontal consumers read that exact width. `ScrollbarSync` supplies the vertical bar with
`TextDocument.lineCount` or `EditorWrap.totalVisualRows` and the live layout viewport; the solid
thumb rasterizer derives one whole-cell length from those constant inputs and moves only its start.

**Generates:** one full-document horizontal extent authority for momentum, drag auto-scroll, and
the horizontal scrollbar; one exact wrap visual-row extent for momentum, paging, and the vertical
scrollbar; a stable thumb while vertically scrolling unchanged content.

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

**Last refined:** 2026-07-25

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
supplies grapheme cells from the document and the predicate. `EditorPane` computes the match once per
frame and passes the two cells to the renderer, which recolours only cells on a visible line.

**Generates:** GitLens/VS-Code-style bracket matching that highlights the cursor's bracket and its true
partner across lines; a bounded, hang-proof scan; a pure, exhaustively testable core.

**Evidence:** `src/modules/editor/BracketMatch.test.ts` (nesting, adjacency, multi-line, per-family
matching, unbalanced → null, scan cap → null); `scripts/smoke-bracket-match.sh` (cursor on a `{` paints
the matching `}` cell; moving off clears it).

**Impossible if true:** a match that crosses bracket families incorrectly counting `[` against `(`; a
scan that hangs on an unbalanced file; a highlight when the cursor is not on a bracket.

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
