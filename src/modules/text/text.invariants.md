# Text — Invariants

Load-bearing rules for `src/modules/text/` — the shared text primitives every text surface in the
app stands on: `TextCoordinates` (grapheme / UTF-16 / display-column conversion), `TextEditing`
(word-edit generator), `TextInputModel` (the one editable single-line field model),
`WrapBreakOpportunity` (the one break generator), and `TextDocument` (a loaded document with
revision stamping). Stands on `project.invariants.md`; references are by name.

These records moved here from `src/modules/editor/editor.invariants.md` when the shared text
primitives left the source-text view. The rules did not change. Their home did: each one governs a
generator that the find bar, command bar, quick open, tab bar, popups, panel headings, diff,
markdown, git, agent, and the editor all consume, so filing them under the editor recorded the
wrong owner. See `project.decisions.md`.

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
array AND a display-column prefix-sum (`TextCoordinates.displayColumnPrefix`) — so `displayColumn`
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


### The dirty marker is derived from content, never asserted

**Invariant:** If the buffer's content is byte-identical to the content that was last saved or
loaded, then the document reports NOT dirty and the tab paints no `●` — whatever sequence of edits
produced that state and whether or not undo was involved; and the answer is computed from the
content itself, never asserted by a mutator.

**Scope:** `TextDocument.dirty` / `matchesSaved()` / `captureSavedBaseline()` and every mutator on
it; `Editor.dirty` and `Editor.title`; the `dirty` field of `OpenBufferSet.tabs()` (and through it
the rule that dirty buffers remain live outside the bounded recent hydration set),
`TabBarRenderer`'s marker cell, and the `dirty` field `AppStatusProjection` publishes. Per open
document. Out of scope: git's modified-versus-HEAD gutter markers, which compare against a COMMIT,
not against the file on disk.

**Mechanism:** `dirty` is a derived getter with no setter. The baseline checks line count, then
incrementally maintained serialized length, then exact content. A file load records a known-clean
revision instead of hashing the bytes it just read; if later edits restore plausible baseline
shape, an unchanged file timestamp permits an exact streaming comparison with disk. Text-only
loads and saves retain the order-sensitive FNV-1a signature because they have no authoritative
disk read to compare. The answer is memoized on (`revision`, `savedBaselineVersion`), so unchanged
frame reads are integer comparisons; content changes and baseline moves cannot leave it stale.

**Generates:** the tab-strip `●`; the `name ●` window title; dirty-buffer retention outside
`OpenBufferSet`'s two-document recent hydration budget; the `dirty` field the harness asserts; the
absence of any `dirty` write anywhere in the codebase.

**Evidence:** `TextDocument.ts` — `get dirty()` (derived, no setter), `matchesSaved()`
(cheap-reject ladder), `captureSavedBaseline()`, `rebuildContentLength()` and the incremental delta
in `replaceLineRange`; `Editor.ts` `get dirty()` and `get title()` read it; no assignment to
`dirty` exists (`grep -rn 'dirty\.value *=' src` is empty). The record was written after the eager
flag it replaces was found wrong in exactly the user-visible way: it dirtied on every mutation and
reconsidered ONLY in `performUndo`/`performRedo`, so type-then-backspace left `●` lit on a buffer
identical to disk.

**Impossible if true:** a buffer byte-identical to the file on disk that displays the dirty marker
(or refuses to dehydrate); a marker that depends on HOW the content was reached — undo depth, edit
count, or which mutator ran; a per-frame marker read that costs a document hash.

**Rejected alternatives:** (1) The eager flag with undo/redo reconsideration — the state this
record replaces; every non-undo path back to the saved content (backspace, retype, cut-then-paste,
any two cancelling edits) is a false positive, and no test caught it because the two paths that were
checked were the two that were fixed. (2) Undo-depth or edit-count equality — the same defect one
level up: it asks how the user got here, not what the buffer says. (3) Comparing the joined text
(`document.text === savedText`) — correct but allocates the whole document per query, so it can
never be read per frame. (4) A per-line hash array folded into a document signature (O(edited
lines) per edit) — measured unnecessary: the cheap-reject ladder already makes the common path
free, the fold has an order-sensitivity trap (XOR or a plain sum calls two swapped lines clean), and
a 20k-line array of per-line hashes is memory spent to speed up a query that runs once per edit at
worst. (5) Keying the memo on `revision` alone — `markSaved()` moves the baseline without changing
content, so the memo would report the pre-save answer forever; keying on the baseline version too is
what makes staleness impossible without corrupting revision semantics.

**Verification:** `bun test src/modules/editor/TextDocument.test.ts src/modules/editor/Editor.test.ts`
— an edit sequence that cancels out (type/backspace, delete-a-line/retype, cut/paste-in-place) reads
clean; two swapped lines (identical line count AND length) read DIRTY, which proves the check is
order-sensitive rather than merely cheap; `markSaved()` rebaselines without bumping `revision`; and,
on a 20,000-line document, a counting subclass asserts 10,000 per-frame reads while typing perform
ZERO content hashes and the read that lands back on the baseline length performs exactly ONE
(positive control: the count does move, so the instrument can fail). A file-load counting subclass
performs zero signatures, including after an edit returns exactly to disk. Driven:
`bun scripts/harness/smoke-dirty-marker-harness.ts` types a character and BACKSPACES it with no undo,
asserting the published `dirty` field and the tab's marker cell both clear; then deletes and retypes a
line; then saves mid-session and shows the ORIGINAL loaded content now reads dirty while the SAVED
content reads clean. Negative control (2026-07-26): the same smoke against the pre-fix eager flag
fails at the backspace step.

**Status:** provisional

**Last refined:** 2026-07-28


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

### Explicit jumps use one reading position

**Invariant:** If an explicit text jump reveals a target, then
`TextViewport.scrollTopForTarget` places it with up to two context rows above and each
same-document projection uses that result.

**Scope:** `TextViewport.scrollTopForTarget`; `Editor.revealCursor`; Markdown preview follow through
`EditorSurfaceClaims`, `MarkdownWorkspace`, `MarkdownSplitView`, and
`MarkdownPreview.revealSourceLine`. Ordinary cursor movement uses the same generator with nearest
placement. Document-edge clamping can reduce the context margin.

**Mechanism:** `TextViewport.scrollTopForTarget` owns nearest and reading placement. An explicit
source jump calls the editor's reading reveal, then `EditorSurfaceClaims` forwards the source line
to the occupying same-document surface. `MarkdownPreview` maps that source block to its first
rendered row after the parsed revision matches, then calls the same reading placement.

**Generates:** A two-row reading margin for source jumps; Markdown table-of-contents follow; normal
cursor movement that stays minimally revealing; one placement formula across wrapped source and
rendered preview rows.

**Rejected alternatives:** Separate source and preview offsets — pane geometry changes make the two
formulas drift.

**Evidence:** `src/modules/text/TextViewport.ts` (`scrollTopForTarget`);
`src/modules/editor/Editor.ts` (`revealCursorMapped`, `revealCursor`);
`src/modules/workspace/Workspace.ts` (`revealSourceLocation`);
`src/modules/markdown/MarkdownPreview.ts` (`firstRenderedRowForSourceLine`,
`revealSourceLine`); `src/modules/text/TextViewport.test.ts`;
`src/modules/editor/Editor.test.ts`; `src/modules/markdown/MarkdownPreview.test.ts`;
`scripts/harness/smoke-markdown-harness.ts`.

**Impossible if true:** A deep table-of-contents click leaving the preview at its old scroll
position; a jump painting its target on the trailing body row when two context rows and a full page
remain; source and preview using different target-placement formulas.

**Verification:** `bun test src/modules/text/TextViewport.test.ts
src/modules/editor/Editor.test.ts src/modules/markdown/MarkdownPreview.test.ts
src/modules/markdown/MarkdownWorkspace.test.ts
src/modules/workspace/EditorSurfaceClaims.test.ts && bun
scripts/harness/smoke-markdown-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-29
