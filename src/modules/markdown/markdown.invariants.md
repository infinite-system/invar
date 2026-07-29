# Markdown Preview — Module Invariants

Colocated contract for `src/modules/markdown/` (governed at M6 per the root
`project.invariants.md` governance record "Core modules are contract-governed"). These records
specialize the root invariants for the Markdown preview: they stand on the root reality
invariants (`An async result can outlive the state it described`, `The terminal shows a bounded
viewport`, `A referenced resource stays alive`) and the root chosen invariants (`Cost tracks the
actively observed set`, `Async results are revision-stamped and stale results discarded`) — never
the reverse.

Invariants are unnumbered; the name is the identifier and is matched byte-for-byte by
`// invariant:` annotations in the module's source. `bun test` commands run from the worktree root
with `~/.bun/bin` on PATH.

## Reality-based invariants

### A markdown parse can outlive its source revision

**Invariant:** If a markdown parse is produced asynchronously, then it can complete after the
source text it was computed from has already advanced to a newer revision.

**Scope:** `MarkdownParser.parseAsync` and every consumer that awaits it (`MarkdownDocument`).
Specializes the root `An async result can outlive the state it described` for markdown.

**Renegotiable at:** the root contract — this is the markdown instance of a repo-wide concurrency
reality; it cannot be renegotiated inside this module.

**Mechanism:** `parseAsync` yields the event loop (`await Promise.resolve()`) before parsing, and
edits keep arriving while it is suspended; completion order is not arrival order. A debounced
timer widens the window further.

**Generates:** The revision stamp carried on `MarkdownParseResult` and the current-revision guard
before any result is applied (`Applied blocks match the current revision`).

**Evidence:** `MarkdownParser.ts:119-122` (`parseAsync` awaits then parses, returning
`{ revision, blocks }`); `MarkdownDocument.ts:140` (`await this.parser.parseAsync(...)` suspends
across edits).

**Impossible if true:** A design that assumes the awaited parse result always describes the
current buffer text and applies it without checking the revision.

**Verification:** `bun test src/modules/markdown/__tests__/MarkdownDocument.test.ts -t "discards a stale parse whose revision no longer matches the source"`

**Status:** provisional

**Last refined:** 2026-07-21

## Chosen invariants

### Parsing starts only after opening

**Invariant:** If a `MarkdownDocument` or `MarkdownPreview` has not been opened, then it has
allocated no parser, armed no source watcher, and scheduled no parse — the first parse is caused
by `open()`, never by construction or by a source edit.

**Scope:** `MarkdownDocument` and `MarkdownPreview` lifecycle from construction up to the first
`open()`. Stands on the root `Cost tracks the actively observed set` and `A resource lives only
while observed`.

**Mechanism:** The constructor only stores options; the ref-getters (`blocks`, `revision`,
`opened`, `document`, `active`) are lazy ivue cells that hold their defaults until read. The
source watcher and the first `scheduleParse` are set up inside `open()`, and `scheduleParse`
short-circuits while `opened` is false, so a pre-open source revision change arms nothing.

**Generates:** The lazy preview model (no `MarkdownDocument` until `MarkdownPreview.open`); the
`createParser()` seam called from `open()` only; the `opened`-guarded parse scheduler.

**Rejected alternatives:** Parsing eagerly in the constructor — pays parse + effect cost for a
preview the user may never open, violating observation-priced cost.

**Evidence:** `MarkdownDocument.ts:31-36` (constructor stores only `debounceMs`);
`MarkdownDocument.ts:58-71` (`open()` is where the `$watch` is armed and the first parse
scheduled); `MarkdownDocument.ts:119` (`scheduleParse` returns early while `!opened.value`);
`MarkdownPreview.ts:55-63` (lazy getters default `document` to null) and
`MarkdownPreview.ts:73-89` (`open()` constructs the document and arms `$watchEffect`).

**Impossible if true:** A newly constructed, never-opened preview whose `document` is non-null, or
a source-revision bump before `open()` that produces a parse or a non-negative `revision`.

**Verification:** `bun test src/modules/markdown/__tests__/MarkdownDocument.test.ts -t "does not parse or allocate a parser before open"`

**Status:** provisional

**Last refined:** 2026-07-21

### Applied blocks match the current revision

**Invariant:** If a parse result is applied to the document, then its stamped revision equals the
current source revision (and the request that produced it is still the latest); a result stamped
with a superseded revision is discarded, never applied.

**Scope:** `MarkdownDocument.startParse` / `applyResult` — every path from an awaited parse to a
mutation of `blocks`/`revision`. Stands on `A markdown parse can outlive its source revision` and
the root `Async results are revision-stamped and stale results discarded`.

**Mechanism:** Each schedule captures a monotonic `requestId`, a `lifecycleGeneration`, and the
revision. `isCurrent` re-checks all three plus `revision === source.revision.value` both before
the await and again in `applyResult` after it, so a late or out-of-order result whose revision has
moved on fails the guard and is dropped.

**Generates:** The revision stamp on `MarkdownParseResult`; the double `isCurrent` guard around the
await; the discard-on-mismatch path.

**Evidence:** `MarkdownDocument.ts:166-173` (`isCurrent` conjoins generation, requestId, and
`revision === this.source.revision.value`); `MarkdownDocument.ts:150-151` (`applyResult` guards on
`isCurrent(result.revision, ...)` before mutating); `MarkdownDocument.ts:135-143`
(`startParse` guards before and after the await).

**Impossible if true:** `blocks` or `revision` holding the output of a parse computed against text
older than `source.revision.value`.

**Verification:** `bun test src/modules/markdown/__tests__/MarkdownDocument.test.ts -t "discards a stale parse whose revision no longer matches the source"`

**Status:** provisional

**Last refined:** 2026-07-21

### Closing releases all preview work

**Invariant:** If a `MarkdownDocument` or `MarkdownPreview` is closed or disposed, then its parser
is disposed, its pending parse timer is cleared, its owned effects are stopped, and its reactive
state is reset — no watcher, timer, or effect outlives the close.

**Scope:** `MarkdownDocument.close`/`dispose` and `MarkdownPreview.close`/`dispose`. Stands on the
root `A referenced resource stays alive` (keyed overlays and effects never self-GC) and the
brief's M6 acceptance "closed preview leaves no active render effect".

**Mechanism:** These instances outlive any component scope, so they own their effects via
`$watch`/`$watchEffect` and must release them explicitly. `close()` clears the debounce timer,
invalidates the in-flight request (`latestRequest = ++requestSequence`), disposes the parser,
resets `blocks`/`revision`/`parsing`/`opened`, and calls `$stopEffects()`; the preview cascades
`document.close()` then drops the document ref and stops its own effect.

**Generates:** The `dispose()` → `close()` delegation; `$stopEffects()` after resource cleanup;
the post-close inertness of source edits.

**Evidence:** `MarkdownDocument.ts:79-100` (`close` clears the timer, disposes the parser, resets
state, calls `$stopEffects`) and `MarkdownDocument.ts:102-104` (`dispose` → `close`);
`MarkdownPreview.ts:92-107` (`close` cascades `document.close()`, nulls the ref, calls
`$stopEffects`).

**Impossible if true:** A source-revision change after `close()` that schedules a parse or fires
the render effect; RSS/effect/timer counts that fail to return to baseline across repeated
open/close cycles.

**Verification:** `bun test src/modules/markdown/__tests__/MarkdownPreview.test.ts -t "close releases the document and leaves no active render effect"`

**Status:** provisional

**Last refined:** 2026-07-21

### Markdown blocks stay compact

**Invariant:** If the parser emits a block or an inline run, then it is a plain non-reactive
record — inline spans are packed as flat `[start, end, style, linkIndexPlusOne]` integers and the
whole block list is swapped wholesale into one `shallowRef`; there is no reactive object per token,
span, or block.

**Scope:** `MarkdownParser` output (`BlockRecord`, `spans`) and its storage in
`MarkdownDocument.blocks`. Stands on the root `Cost tracks the actively observed set` /
`Ground truth is compact and non-reactive at rest`.

**Mechanism:** `BlockRecord` is a plain object literal; inline styling is encoded as a flat number
array (4 ints per run) plus a parallel `links` string array, never token objects or refs. The
document holds the block list in a single `shallowRef` replaced wholesale on each parse, so
reactivity is one signal for the array, not one per element.

**Generates:** The packed-span encoding consumed by `MarkdownRenderable`; the wholesale
`shallowRef` swap; O(1) reactive edges per parse regardless of block count.

**Rejected alternatives:** A reactive object (or ref) per token/block — hundreds of bytes each
times block count, exactly the cost the flyweight architecture forbids.

**Evidence:** `MarkdownParser.ts:29-42` (compact `BlockRecord`, `spans: readonly number[]`);
`MarkdownParser.ts:313-335` (`createBlock` returns a plain object literal, no ref);
`MarkdownParser.ts:337-392` (`parseInline` packs 4 ints per run);
`MarkdownDocument.ts:38-40` (`blocks` is one `shallowRef` over the array).

**Impossible if true:** A `ref`/`computed`/reactive proxy stored on a per-block or per-span basis;
a `.value` accessor on any `BlockRecord` field.

**Verification:** `bun test src/modules/markdown/__tests__/MarkdownParser.test.ts -t "packs inline emphasis strong code and link into flat spans"`

**Status:** provisional

**Last refined:** 2026-07-21

### Preview rendering follows visible rows

**Invariant:** If the preview is rendered, then only the rows inside the requested
viewport (`scrollTop … scrollTop+height`) are instantiated as `PreviewRow` objects; the number of
materialized rows never exceeds the viewport height regardless of document size.

**Scope:** `MarkdownPreview.visibleRows` / `collectRows` and its consumer
`MarkdownRenderable.pullVisibleRows`. Stands on the root `The terminal shows a bounded viewport`
and `Cost tracks the actively observed set`.

**Mechanism:** `collectRows` walks blocks through an `emit` callback that pushes a `PreviewRow`
only when the running row index falls inside `[firstVisible, firstVisible+visibleCount)` and
returns `true` to short-circuit the walk once the window is filled, so at most `height`
`PreviewRow` flyweights exist per frame and blocks past the window are never emitted.

**Generates:** The ephemeral per-frame `PreviewRow` flyweight; the short-circuiting block walk;
viewport-bounded render cost.

**Evidence:** `MarkdownPreview.ts:21-31` (`PreviewRow` documented as an ephemeral flyweight row);
`MarkdownPreview.ts:196-201` (`collectRows` pushes only rows within the window and returns
`rowIndex >= endVisible` to stop early); `MarkdownPreview.ts:135-147` (`visibleRows` bounds output
by `Math.floor(height)`); `MarkdownRenderable.ts:67-81` (`pullVisibleRows` pulls only the visible
window each frame).

**Impossible if true:** A `visibleRows(width, height)` call returning more than `height` rows, or a
render pass that materializes a `PreviewRow` for every block of a large document to show one
screen.

**Verification:** `bun test src/modules/markdown/__tests__/MarkdownPreview.test.ts -t "renders only the visible window of rows"`

**Status:** provisional

**Last refined:** 2026-07-21

### Markdown presentation resolves through one stylesheet

**Invariant:** If a markdown element reaches the terminal, then every presentation decision for
it — pane padding, vertical margins, list indents, quote and frame glyphs, palette color slots,
and text attributes — resolves through `MarkdownStylesheet`; neither the projection
(`MarkdownPreview`) nor the painter (`MarkdownRenderable`) holds presentation vocabulary of its
own.

**Scope:** `MarkdownStylesheet` (the seam), `MarkdownPreview` (geometry consumer: padding,
margins, prefixes, frames), `MarkdownRenderable` (paint consumer: color slots, attributes).
Themes stay upstream: the stylesheet names palette SLOTS and the painter resolves them against
the active palette, so a theme change restyles the preview without touching the stylesheet.

**Mechanism:** One rule table maps element selectors (`heading1`…`heading6`, `paragraph`,
`blockquote`, `listItem`, `codeBlock`, `table`…, `rule`) to margins and text styles, one
vocabulary object holds the structural glyphs, and `spacingBetween` collapses adjacent margins
CSS-style. `blockSelector`/`rowSelector` are the only translation from parsed blocks and row
roles into selectors.

**Generates:** uniform pane padding (the breathing room between text and pane edges); the
heading intensity ramp; single-spaced list runs that still separate from paragraphs; the quote
bar on every wrapped quote row; code frames whose right edge stays on one column; consistent
presentation across every element without per-element literals.

**Rejected alternatives:** per-element literals scattered through projection and paint — the
pre-#236 state, where the quote bar and code frame dropped off continuation rows because each
call site re-rolled its own prefix policy.

**Evidence:** `src/modules/markdown/MarkdownStylesheet.ts` (the rule tables);
`MarkdownPreview.ts` (`visitBlock`, `collectRows`, `totalRows` consume metrics);
`MarkdownRenderable.ts` (`styledChunk`, `decorateText` consume text styles);
`MarkdownStylesheet.test.ts` (the census test proves the consumers hold no presentation
vocabulary).

**Impossible if true:** a box-drawing or bullet glyph literal inside `MarkdownPreview.ts` or
`MarkdownRenderable.ts`; a palette slot chosen in the painter outside the stylesheet (the pane
fg/bg defaults excepted); two elements resolving the same presentation question through
different code paths.

**Verification:** `bun test src/modules/markdown/MarkdownStylesheet.test.ts`

**Status:** provisional

**Last refined:** 2026-07-29

### Markdown tables align by display cells

**Invariant:** If a valid Markdown table is previewed, then its parsed cells share fixed
display-cell column boundaries, use the declared left center and right alignments, and truncate
inside a narrow pane without wrapping a cell or painting outside the pane.

**Scope:** `MarkdownParser.readTable`, `MarkdownPreview.appendVisibleTableRows`,
`MarkdownRenderable.appendTableRow`, and the `TableBorderGlyphSet` supplied by the active theme.
Malformed tables and whole-preview find materialization use the fallback behavior described below.

**Components:**
- *Parsing owns table syntax* — `BlockRecord.table` carries rows, cells, and alignments; projection
  never parses pipe syntax.
- *Projection owns display geometry* — equal column shares come from pane width, and cell text is
  measured, truncated, aligned, and padded through `TextCoordinates`.
- *Painting stays viewport bounded* — `totalRows` counts table rows without visiting cells, and
  `visibleRows` materializes table rows only where they intersect the viewport.

**Mechanism:** `MarkdownParser` validates one column count and stores compact plain cell records.
`MarkdownPreview` distributes the available display cells without scanning body content and lays
out only the requested row range. `MarkdownRenderable` paints those rows with the active
theme's table-border vocabulary inside an overflow-hidden `SelectableText`.
`MarkdownSplitView` materializes `allRows` only when find or selection needs the whole preview and
caches that result by revision, width, and border vocabulary; ordinary update and scroll frames
never take that path.

**Generates:** aligned terminal tables; left center and right marker behavior; stable boundaries
for CJK, emoji, and combining marks; viewport-independent cost for 10-row and 1000-row tables;
raw visible paragraph fallback for a missing separator or ragged row.

**Rejected alternatives:** Measure every body row to find natural widths — frame cost grows with
table length. Reparse pipes in the painter — parser and projection can disagree about cells.

**Evidence:** `MarkdownParser.test.ts` (`parses table cells and column alignment without painting
syntax`, `malformed tables remain visible paragraph text`); `MarkdownPreview.test.ts` (`table
columns align in display cells with left center and right content`, `table projection measures
only visible rows at small and large scale`); `MarkdownSplitView.test.ts` (`unchanged frames do not
materialize the whole preview document`); `scripts/harness/smoke-markdown-harness.ts`.

**Impossible if true:** A valid table appearing as raw pipe rows; a CJK, emoji, or combining-mark
cell shifting a later border; center or right markers painting as left alignment; a table row
wrapping mid-cell; table output replacing a neighbouring pane cell; a 1000-row table measuring
more cells per visible row than a 10-row table; malformed table text disappearing or crashing the
preview; an ordinary unchanged frame materializing the whole preview document.

**Verification:** `bun test src/modules/markdown/MarkdownParser.test.ts
src/modules/markdown/MarkdownPreview.test.ts src/modules/markdown/MarkdownSplitView.test.ts
src/modules/theme/ThemeIcons.test.ts && bun scripts/harness/smoke-markdown-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-27

### A Markdown file offers a live source preview split

**Invariant:** If the active editor tab is a Markdown file and preview mode is enabled, then the
editable source and the rendered current document appear together in two resizable panes.

**Scope:** `MarkdownWorkspace` (the per-tab preview mode and its editor-surface claim),
`MarkdownPreviewSurface` / `MarkdownPreviewContent` (the mounted occupant), `EditorContentMount`
(the generic host mount), `MarkdownSplitView`, `MarkdownPreview`, and the contributed editor-title
action the tab strip renders from the `markdown.togglePreview` command.

**Mechanism:** The tab-strip affordance and the `markdown.togglePreview` command are the SAME
command — the button is rendered from its `editorTitleIcon`, so there is one action, not two — and it
flips one per-path mode on `MarkdownWorkspace`. That makes the plugin's provider claim the editor
column; `EditorContentMount` mounts whatever claims it, handing the content the source renderable it
moves into its left pane, and `MarkdownPreview` opens on the active `TextDocument` revision. One
`SplitterModel` writes `Settings.markdownSplitRatio` live and persists it once on release.

**Generates:** source-only default mode; source and preview together; live edit reparsing; one
clickable and keyboard-bound toggle; persistent pane geometry.

**Evidence:** `src/modules/markdown/MarkdownSplitView.ts`; `MarkdownWorkspace.test.ts`,
`MarkdownPreviewSurface.test.ts`, `MarkdownPreviewContent.test.ts`, `MarkdownPlugin.test.ts`; the
generic mount in `src/modules/ui/EditorContentMount.ts`; `scripts/smoke-markdown.sh` toggle and
splitter drives.

**Impossible if true:** enabling preview on an active Markdown tab while only raw source remains;
editing source while the visible preview remains on an older revision; dragging the divider while
both pane widths stay fixed; reopening the split at the default ratio after a completed drag.

**Verification:** `bash scripts/smoke-markdown.sh`.

**Status:** established

**Last refined:** 2026-07-22

### A file reference opens from rendered Markdown

**Invariant:** If a rendered Markdown link or inline-code path resolves to a real file inside the
workspace root, then Ctrl or Cmd click and the hovered Ctrl Enter chord open or focus that file tab.

**Scope:** reference spans from `MarkdownParser`, `MarkdownRenderable.referenceAtCell`,
`MarkdownSplitView` hover and activation, the wiring in `MarkdownPreviewContent`, and the host's
generic `Workspace.resolveFileReference`.

**Mechanism:** Rendering and hit-testing share the same visible `PreviewRow` and packed inline-span
coordinates. `Workspace.resolveFileReference` — kept in the host because it is GENERIC path
confinement with no markdown in it, and rendered documents are simply its first caller — strips
fragments, rejects external schemes and escapes, and confirms the target exists before
`MarkdownPreviewContent` routes it through `Workspace.openFileInTab`.

**Generates:** clickable standard Markdown links; clickable backtick file paths; hover emphasis and
an explanatory tooltip; a keyboard activation chord; no-op external or missing targets.

**Evidence:** `src/modules/markdown/MarkdownRenderable.ts` (`referenceAtCell`);
`src/modules/markdown/MarkdownSplitView.ts` (`resolvedReferenceAt`, `openHoveredReference`);
`src/modules/workspace/Workspace.ts` (`resolveFileReference`); `scripts/smoke-markdown.sh`.

**Impossible if true:** a valid in-root backtick path being hovered but unable to open by either
activation; an HTTP URL or path escaping the workspace being opened as an editor file; the drawn
reference text and its clickable cells disagreeing.

**Verification:** `bash scripts/smoke-markdown.sh`.

**Status:** established

**Last refined:** 2026-07-22

### Markdown preview selection reuses shared drag behavior

**Invariant:** If a user drags a selection in the rendered preview, then the shared drag-edge
behavior extends one preview text range, autoscrolls that pane, and Ctrl C copies exactly that range.

**Scope:** `MarkdownSplitView.createSelectionDragBehavior`, its preview `ReadOnlyTextBuffer`,
`MarkdownRenderable` cell mapping, and Bootstrap copy routing.

**Mechanism:** `SelectionDragBehavior` receives preview-specific cell mapping and scroll callbacks,
while the range lives in `ReadOnlyTextBuffer.cursor` and paints through `SelectableText`. The source
editor keeps its own selection and remains the only paste target.

**Generates:** preview drag selection; edge autoscroll; exact rendered-text copy; editable-source
paste without a third selection model.

**Evidence:** `src/modules/markdown/MarkdownSplitView.ts` (`previewTextBuffer`);
`src/modules/editor/ReadOnlyTextBuffer.ts`; shared behavior tests in
`src/modules/ui/SelectionDragBehavior.test.ts`; `scripts/smoke-markdown.sh`.

**Impossible if true:** a preview drag highlight disappearing on repaint; a held edge drag leaving
preview scroll and selection unchanged; Ctrl C copying raw Markdown punctuation absent from the
rendered selection; Ctrl V mutating the read-only preview.

**Verification:** `bun test src/modules/ui/SelectionDragBehavior.test.ts && bash scripts/smoke-markdown.sh`.

**Status:** established

**Last refined:** 2026-07-24

### Markdown panes keep independent find state

**Invariant:** If source and preview are searched in turn, then each pane retains its own query,
match list, current match, and visible highlights when focus moves to the other pane.

**Scope:** `FindBar.openForTarget`, source and preview target identifiers, RootView source
highlighting, and `MarkdownRenderable` preview highlighting.

**Mechanism:** The preview's `ReadOnlyTextBuffer` exposes a stable read-only target, and `FindBar`
stores one `FindInBuffer` engine per stable pane identifier instead of one global engine. Each
renderer reads only its own retained engine, and each target owns match reveal.

**Generates:** Ctrl F bound to the focused pane; simultaneous source and preview highlights; separate
queries and match counters; find-only behavior in the read-only preview.

**Evidence:** `src/modules/search/FindBar.ts`; `src/modules/ui/RootView.ts` (`findTarget`);
`src/modules/editor/ReadOnlyTextBuffer.ts` (`findTarget`);
`src/modules/markdown/MarkdownSplitView.ts` (`findTarget`); `scripts/smoke-markdown.sh`.

**Impossible if true:** searching the preview replacing the source query or match list; a preview
match moving the source cursor; a source match being painted in the preview pane.

**Verification:** `bash scripts/smoke-markdown.sh`.

**Status:** established

**Last refined:** 2026-07-24
