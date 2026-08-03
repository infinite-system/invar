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
vocabulary object holds the structural glyphs, and `spacingBetweenBlocks` preserves the authored
gap before headings while collapsing other adjacent margins CSS-style. A heading at the document
edge starts on the first preview body row. Every heading level uses the theme `accent` slot. The
level-one and level-two headings keep bold text with no underline. Code header, body, and footer
rows each resolve the `selectionMuted` background per row; the header uses readable `fg`, and the
shared code-frame vocabulary supplies rounded corners. `blockSelector`/`rowSelector` are the only
translation from parsed blocks and row roles into selectors.

**Generates:** uniform pane padding (the breathing room between text and pane edges); the
one theme-derived heading color with the existing level-specific attributes and no H1 underline;
heading starts with no synthetic blank row;
single-spaced list runs that still separate
from paragraphs; the quote bar on every wrapped quote row; code frames whose right edge stays on
one content column while long physical code rows remain reachable by horizontal scroll; one rounded
code surface whose header, body, and footer recolor together with the theme; consistent
presentation across every element without per-element literals.

**Rejected alternatives:** per-element literals scattered through projection and paint — the
pre-#236 state, where the quote bar and code frame dropped off continuation rows because each
call site re-rolled its own prefix policy.

**Evidence:** `src/modules/markdown/MarkdownStylesheet.ts` (the rule tables);
`MarkdownPreview.ts` (`visitBlock`, `collectRows`, `totalRows` consume metrics);
`MarkdownRenderable.ts` (`styledChunk`, `decorateText` consume text styles);
`MarkdownStylesheet.test.ts` (the census test proves the consumers hold no presentation
vocabulary); `scripts/harness/smoke-markdown-harness.ts` (H1 and H2 terminal cell attributes in
both themes).

**Impossible if true:** a box-drawing or bullet glyph literal inside `MarkdownPreview.ts` or
`MarkdownRenderable.ts`; a palette slot chosen in the painter outside the stylesheet (the pane
fg/bg defaults excepted); an underlined H1; heading levels with different foreground colors; two
elements resolving the same presentation question through different code paths; a heading with
more blank rows before it than the source authored; a transparent code header or footer around a
background-painted body; square code-frame corners.

**Verification:** `bun test src/modules/markdown/MarkdownStylesheet.test.ts && bun
scripts/harness/smoke-markdown-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-29

### Dead relative Markdown links have one revision-stamped verdict

**Invariant:** If an authored relative Markdown link does not resolve to a workspace file, then its
preview text uses the theme error color and underline. A resolving relative link and an external
link keep the normal link style.

**Scope:** Authored Markdown links in the rendered preview. Inline-code references and opening
external links are outside this appearance rule.

**Mechanism:** `MarkdownPreview.referenceTargets` exposes the parsed document's authored targets.
`MarkdownSplitView` resolves each distinct non-external target once per parsed revision and caches
the dead verdict. `MarkdownRenderable` reads that cache while painting and obtains the error
presentation from `MarkdownStylesheet`. A watcher edit creates a new source and parse revision, so
the next paint rebuilds the verdicts without reopening the preview.

**Generates:** Red underlined dead links in both themes; normal current and moved task-state links;
live repair after file creation or link editing; no repeated filesystem probes on unchanged
frames.

**Rejected alternatives:** Probe the filesystem from every painted span on every frame — document
size and frame rate would multiply filesystem work. Treat every unresolved target as dead —
external links are not workspace files and remain visually valid.

**Evidence:** `MarkdownSplitView.ts` (`referenceDeadByTarget`, `refreshReferenceVerdicts`);
`MarkdownRenderable.ts` (dead-link decoration); `MarkdownStylesheet.ts`
(`deadReferenceStyle`); `MarkdownSplitView.test.ts` (one resolution pass per parse revision);
`MarkdownStylesheet.test.ts`; `scripts/harness/smoke-markdown-harness.ts` (both themes, live
repair, and 10-line/100,000-line scale arms).

**Impossible if true:** A missing relative link using the normal accent style; an HTTP link painted
as dead because it is not a workspace file; an unchanged frame repeating filesystem resolution;
a watcher-driven repair that stays red after the new parse revision paints.

**Verification:** `bun test src/modules/markdown/MarkdownSplitView.test.ts
src/modules/markdown/MarkdownStylesheet.test.ts && bun
scripts/harness/smoke-markdown-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-29

### Metadata fields preserve authored lines

**Invariant:** If a paragraph contains two or more consecutive `Key: value` metadata fields, then
each field keeps its authored line boundary in the preview, while ordinary prose lines still join
and reflow as one paragraph.

**Scope:** `MarkdownParser.readParagraph`, metadata labels made from letters, digits, spaces,
underscores, or hyphens, and the rows that `MarkdownPreview.visitWrapped` projects from the parsed
paragraph. A single field line and mixed prose remain ordinary reflowing paragraphs.

**Mechanism:** `MarkdownParser.isMetadataFieldLine` recognizes a complete paragraph only when every
line has the metadata-field shape and the paragraph has at least two lines. `readParagraph` joins
that block with newline characters and joins every other paragraph with spaces. The shared wrapped
text path turns only preserved newline characters into preview rows.

**Generates:** readable task-file header stacks; definition-like metadata blocks; unchanged
CommonMark-style reflow for ordinary source-wrapped prose.

**Rejected alternatives:** Treat every Markdown soft break as a line break — ordinary prose would
stop reflowing. Special-case task filenames or known field labels — the semantic would depend on
one repository format instead of the authored block shape.

**Evidence:** `src/modules/markdown/MarkdownParser.ts` (`readParagraph`,
`isMetadataFieldLine`); `MarkdownParser.test.ts` (`preserves consecutive metadata fields while
prose still reflows`); `scripts/harness/smoke-markdown-harness.ts` (task fields and prose through
the real PTY).

**Impossible if true:** a task header painting `State:`, `Created:`, and `Engine:` on one preview
row; an ordinary two-line prose paragraph painting an authored line break.

**Verification:** `bun test src/modules/markdown/MarkdownParser.test.ts && bun
scripts/harness/smoke-markdown-harness.ts`

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

### Markdown headings are the document's structure

**Invariant:** If a `.md` document is asked for its structure, then the markdown plugin's own
`MarkdownStructureSource` answers with the document's headings — document-ordered, nested by
level, each anchored at its heading line with its section's extent — registered through the
host `ProviderRegistry` under the `structure` capability and consumed by the structure pane
through the unchanged `StructureSource` seam; no LSP is involved, and a headingless markdown
document answers an empty list, never `null`.

**Scope:** `MarkdownStructureSource`, its registration and withdrawal in `MarkdownWorkspace`,
and the one markdown-path predicate both share. Not the pane, the dock, or the jump — those
are the structure module's records.

**Mechanism:** The source reuses the module's own `MarkdownParser`, so heading recognition is
the SAME rule the preview renders by (a fenced code block's `# comment` is not a heading; ATX
and setext headings both count). A level stack nests each heading under the nearest shallower
one and closes sections at the next same-or-shallower heading. `supportsDocument` is a path
test only; the parse happens per outline request, debounced and observation-gated by the
consumer.

**Generates:** The table of contents in the structure pane for every markdown file; the
`isMarkdownPath` predicate `MarkdownWorkspace.activeFileIsMarkdown` reuses; withdrawal of the
TOC when the Markdown extension uninstalls.

**Rejected alternatives:** A line-scan for `#` prefixes in the structure module — re-rolls the
parser's heading rule and lies inside fenced code blocks. Serving headings through the LSP
seam — the outline is the plugin's own knowledge, and coupling it to Language Intelligence
would withdraw the TOC with the wrong extension.

**Evidence:** `src/modules/markdown/MarkdownStructureSource.ts`;
`src/modules/markdown/MarkdownWorkspace.ts` (registration, `disposed()` withdrawal);
`src/modules/markdown/MarkdownStructureSource.test.ts`;
`scripts/harness/smoke-plugin-manifest-harness.ts` (the TOC and Markdown-uninstall arms).

**Impossible if true:** A markdown TOC that lists a code-block comment as a heading; heading
rows out of document order; a TOC that survives uninstalling the Markdown extension; a second
markdown-ness predicate in this module; a headingless document reported as "cannot answer".

**Verification:** `bun test src/modules/markdown/MarkdownStructureSource.test.ts
src/modules/markdown/MarkdownWorkspace.test.ts` and
`bun scripts/harness/smoke-plugin-manifest-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-29

### A Markdown file offers a live source preview split

**Invariant:** If the active editor tab is a Markdown file and preview mode is enabled, then the
editable source and the rendered current document appear together in two resizable panes, and an
explicit source jump reveals the same source block in both panes. While
`markdownPreviewScrollSync` is true, the pane that receives user input leads continuous scroll and
the other pane follows the same reading position. While the setting is false, each pane scrolls
independently.

**Scope:** `MarkdownWorkspace` (the per-tab preview mode and its editor-surface claim),
`MarkdownPreviewSurface` / `MarkdownPreviewContent` (the mounted occupant), `EditorContentMount`
(the generic host mount), `MarkdownSplitView`, `MarkdownPreview`, and the contributed editor-title
action the breadcrumb row renders from the `markdown.togglePreview` command. Source-jump follow crosses
the generic `EditorSurfaceClaims` seam. Continuous follow also includes
`MarkdownPlugin.markdownPreviewScrollSync` and the editor's logical-line viewport projection.

**Components:**
- *One live split* — the source and rendered projection share one mounted document and one
  resizable editor-column surface.
- *Explicit jumps share reading placement* — a source jump reveals the same block with the shared
  text-viewport reading margin.
- *User input names the scroll leader* — source input makes the source lead, preview input makes
  the preview lead, and programmatic follower movement does not change that identity.
- *The preview is one shared scroll surface* — wheel, pointer selection, edge autoscroll, and both
  overflowing axes compose `ScrollableTextViewport`; its bars compose `SolidThumbScrollBar`.
- *One position map serves both directions* — exact rendered block anchors, including headings,
  map source to preview; interpolation between the same anchors maps continuous positions in
  either direction.
- *The contributed switch is symmetric* — the default is on, and off suppresses both follow
  directions without suppressing either pane's own scroll.
- *The contributed action yields no columns* — the breadcrumb path truncates before the
  right-aligned action, and the buffer tab row does not render the action.

**Mechanism:** The breadcrumb-row affordance and the `markdown.togglePreview` command are the SAME
command — the button is rendered from its `editorTitleIcon`, so there is one action, not two — and it
flips one per-path mode on `MarkdownWorkspace`. That makes the plugin's provider claim the editor
column; `EditorContentMount` mounts whatever claims it, handing the content the source renderable it
moves into its left pane, and `MarkdownPreview` opens on the active `TextDocument` revision. One
`SplitterModel` writes `Settings.markdownSplitRatio` live and persists it once on release. An
explicit source jump reaches the occupying Markdown claim through `EditorSurfaceClaims`;
`MarkdownSplitView` waits for the matching parsed revision, maps the source line to its rendered
block row, and uses `TextViewport.scrollTopForTarget` for the same reading placement as the source.
`MarkdownPreview` caches one source-line/rendered-row anchor map per parsed revision and pane width.
`MarkdownSplitView` reads the focused pane as the leader, interpolates the follower position from
that map, applies it without changing focus, and captures both resulting positions before another
frame can consider follow. Disabling the contributed setting captures current positions and skips
all follower writes. The split supplies preview extents, selection writes, and cell mapping to one
`ScrollableTextViewport`; the shared viewport owns momentum, wheel routing, both bars, native bar
input, and selection drag. Fenced code keeps physical lines intact, so its widest line supplies the
horizontal extent while prose remains viewport-bound.

**Generates:** the explicit split compatibility mode (see `The Markdown preview opens itself and
sits on the configured side`); source and preview together; table-of-contents jumps that reveal both panes;
live edit reparsing; bidirectional input-led scroll follow; the default-on
`markdownPreviewScrollSync` contributed setting; independent scrolling while it is off; one
clickable and keyboard-bound toggle; vertical and horizontal preview bars; persistent pane geometry.

**Evidence:** `src/modules/markdown/MarkdownSplitView.ts`; `MarkdownPreview.ts`;
`MarkdownSplitView.test.ts`; `MarkdownPreview.test.ts`; `MarkdownWorkspace.test.ts`;
`MarkdownPreviewSurface.test.ts`; `MarkdownPreviewContent.test.ts`; `MarkdownPlugin.test.ts`; the
generic mount in `src/modules/ui/EditorContentMount.ts`; `scripts/smoke-markdown.sh`;
`scripts/harness/smoke-markdown-harness.ts`; `scripts/harness/smoke-scrollbars-harness.ts`.

**Impossible if true:** enabling preview on an active Markdown tab while only raw source remains;
editing source while the visible preview remains on an older revision; a deep table-of-contents
click moving only the source; dragging the divider while both pane widths stay fixed; reopening the
split at the default ratio after a completed drag; a follower write taking leadership and causing a
feedback loop; source and preview using separate position maps; either pane moving its follower
while `markdownPreviewScrollSync` is false; an overflowing preview axis with no shared scrollbar;
a preview scrollbar input that leaves the source pane as scroll leader.

**Verification:** `bash scripts/smoke-markdown.sh && bun
scripts/harness/smoke-markdown-harness.ts && bun scripts/harness/smoke-scrollbars-harness.ts`.

**Status:** established

**Last refined:** 2026-07-29

### The Markdown preview opens itself and sits on the configured side

**Invariant:** If the markdown plugin's compatibility `markdownViewMode` is `split` and a Markdown
tab becomes the active presented document, then its preview opens without a keystroke. It opens on
the configured side and leaves keyboard focus on source. A preview closed by hand stays closed for
that document until its toggle reopens it. Disabling the plugin removes the pane.

**Scope:** `MarkdownWorkspace` (the auto-open watcher and the dismissed-path memory),
`MarkdownPlugin` (the contributed setting), `MarkdownPreviewSurface` (the side in the mount
identity), `MarkdownSplitView` (pane order and splitter pointer direction). Stands on the #100/#222
convention *Plugins contribute their own settings and keybindings* — the host learns nothing.

**Mechanism:** A sync-flush watcher on the auto-open candidate (an active presented Markdown tab
with no preview showing and no recorded hand-close) writes the path into `previewPaths`, so the
claim is up before the next paint. `togglePreview` records a hand-close in `dismissedPreviewPaths`
BEFORE removing the path from `previewPaths` — the sync watcher fires between the two writes and
must already see the dismissal, or it re-opens the pane. The persisted split ratio keeps meaning
the SOURCE pane's share on either side: only the child order and the splitter's pointer direction
flip, and the mount identity carries the side so a settings flip rebuilds the split.

**Generates:** the explicit split-mode default for every Markdown tab; per-document dismissal memory; the
`Preview side` settings row; auto-open that never moves the keyboard; uninstall symmetry (disposing
the contribution stops the watcher and drops the claim).

**Rejected alternatives:** Deriving `showingPreview` from the surface capability — the claim would
ask the registry about itself (the recorded boot-time recursion). Focusing the preview pane on
auto-open — the user did not ask for the pane, so the keyboard must not move. Re-rolling a second
persisted ratio for the flipped side — one ratio with one meaning survives the flip.

**Evidence:** `MarkdownWorkspace.ts:38-44` (the sync `$watch` armed in the constructor);
`MarkdownWorkspace.ts:63-79` (`autoOpenCandidatePath` respects `previewPaths` and
`dismissedPreviewPaths`); `MarkdownWorkspace.ts:129-132` (dismissal written first);
`MarkdownPlugin.ts:63-69` (the contributed `markdownPreviewSide` setting, default `left`);
`MarkdownSplitView.ts:98-111` (child order by side) and `MarkdownSplitView.ts:157` (the flipped
pointer direction); `MarkdownPreviewSurface.ts:40-45` (the side keys the mount identity).

**Impossible if true:** an active presented Markdown tab showing only raw source with no recorded
hand-close while compatibility split mode is enabled; a hand-closed document auto-reopening on reactivation; the
preview mounting right of the source while the setting says `left`; an auto-open or a stale preview
pane surviving plugin uninstall.

**Verification:** `bun test src/modules/markdown/MarkdownWorkspace.test.ts
src/modules/markdown/MarkdownPreviewSurface.test.ts src/modules/markdown/MarkdownPlugin.test.ts
src/modules/markdown/MarkdownSplitView.test.ts && bun scripts/harness/smoke-markdown-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-29

### Markdown view mode persists across Markdown documents

**Invariant:** If `markdownViewMode` is `preview`, then every active Markdown document shows only
its rendered preview. The source editor is absent and editing keys cannot mutate the document. If
the mode is `editor`, the source editor returns with full editing. The choice applies to later
Markdown documents and survives restart. A non-Markdown document always uses its normal surface.

**Scope:** The Markdown plugin's contributed `markdownViewMode` setting, `MarkdownWorkspace`,
`MarkdownPreviewSurface`, `MarkdownPreviewContent`, and `MarkdownSplitView`. The explicit `split`
value preserves the older source-preview compatibility mode.

**Mechanism:** `MarkdownPlugin` registers `markdownViewMode` through the contributed settings seam.
`MarkdownWorkspace.togglePreview` changes `editor` to `preview` or `preview` to `editor`, then saves
the registered setting. `showingPreview` reads that one setting for every Markdown path.
`MarkdownPreviewSurface` passes the view-only fact to its content. `MarkdownSplitView` then mounts
only the preview pane and starts with preview focus. The surface claim reports that the document is
not the keyboard target, so editor mutations cannot receive view-only input. The Markdown extension
guard prevents the setting from claiming any other file type.

**Generates:** one persistent choice across tab close, another Markdown open, and process restart;
a full-width rendered preview with no source pane; a toggle that restores the editor; inert editing
keys in view-only mode; unchanged behavior for non-Markdown files.

**Rejected alternatives:** Store the choice per path, because a later Markdown file would forget
it. Store it on `Workspace`, because Markdown owns the policy. Leave the hidden editor as the
keyboard target, because editing keys could mutate text that the user cannot see.

**Evidence:** `MarkdownPlugin.ts`; `MarkdownWorkspace.ts`; `MarkdownPreviewSurface.ts`;
`MarkdownPreviewContent.ts`; `MarkdownSplitView.ts`; `MarkdownWorkspace.test.ts`;
`MarkdownPlugin.test.ts`; `scripts/harness/smoke-markdown-harness.ts`.

**Impossible if true:** a second Markdown file returning to editor after preview mode was selected;
an editing key changing the hidden source; restart losing the selected mode; a TypeScript file
showing rendered Markdown; preview mode painting a source pane beside the rendered pane.

**Verification:** `bun test src/modules/markdown && bun
scripts/harness/smoke-markdown-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-29

### A file reference opens from rendered Markdown

**Invariant:** If a rendered Markdown link or inline-code path resolves to a real file inside the
workspace root, then Ctrl or Cmd click, a plain double click on the same span, and the hovered
Ctrl Enter chord all open or focus that file tab. A relative target is resolved from the DOCUMENT's
own directory and may walk above it; the workspace root is the only confinement boundary.

**Scope:** reference spans from `MarkdownParser`, `MarkdownRenderable.referenceAtCell`,
`MarkdownSplitView` hover and activation (modified click, double click, chord), the wiring in
`MarkdownPreviewContent`, the shared `DoubleClickGesture`, and the host's generic
`Workspace.resolveFileReference`.

**Mechanism:** Rendering and hit-testing share the same visible `PreviewRow` and packed inline-span
coordinates. One press runs ONE hit test, and every meaning that press can carry — the modified
click, the double click, the drag that starts a selection — reads that one result, so they can
never disagree about what sits under the pointer. The second press counts as a double click only
when `DoubleClickGesture` (the same generator the Git log pane uses) sees the SAME reference span
inside the interval; a press on prose carries the pressed CELL as its identity, so repeated presses
on ordinary text never masquerade as an activation. `Workspace.resolveFileReference` — kept in the
host because it is GENERIC path confinement with no markdown in it, and rendered documents are
simply its first caller — strips fragments, decodes percent escapes, rejects external schemes,
resolves the reference against the workspace root AND against the active document's own directory
(a starting point, never a boundary — an authored `../../../../project.invariants.md` from a task
folder must resolve), then confirms the result exists, is not a directory, and stays inside the
workspace root before `MarkdownPreviewContent` routes it through `Workspace.openFileInTab` and moves keyboard focus to
the editor, so the jump is immediately navigable (Back/Forward record both ends through the
navigation records). If an exact `.invar/tasks/<state>/<task-name>/<tail>` target is absent,
`TaskStatePath` retries the same task name and tail in the other three lifecycle states while
retaining the workspace confinement check. A Bootstrap routing guard clears a non-dragging native
selection residue on Ctrl+left-down — OpenTUI otherwise consumes the down as "extend selection"
after any click on selectable text, and the link click silently dies before reaching the pane.

**Generates:** clickable standard Markdown links; clickable backtick file paths; mouse-only
navigation through a document tree by double click; upward relative links in nested records that
resolve and open; hover emphasis and an explanatory tooltip; a keyboard activation chord; focus
following the opened file; the stated
outcome for external or missing targets (`An unresolvable Markdown link states why`); task-record
links that survive lifecycle-state moves without basename guessing.

**Evidence:** `src/modules/markdown/MarkdownRenderable.ts` (`referenceAtCell`);
`src/modules/markdown/MarkdownSplitView.ts` (`referenceAt`, `openHoveredReference`);
`src/modules/markdown/MarkdownPreviewContent.ts` (`openReference` wiring);
`src/modules/workspace/Workspace.ts` (`resolveFileReference`);
`src/modules/system/TaskStatePath.ts` (the structural task-state fallback);
`src/modules/ui/DoubleClickGesture.ts` (the shared second-press generator);
`src/modules/app/Bootstrap.ts` (the Ctrl+click routing guard); `scripts/smoke-markdown.sh`;
`scripts/harness/smoke-markdown-harness.ts` (the upward-link and double-click arms at both scales);
`src/modules/workspace/Workspace.test.ts` (upward relative resolution and the root boundary).

**Impossible if true:** a valid in-root backtick path being hovered but unable to open by any of the
three activations; an authored relative link that resolves on disk inside the workspace root but
not in the preview because it walks above the document's own directory; a path escaping the
workspace root being opened as an editor file; an HTTP URL opened as an editor file; a double click
on prose or on empty preview space opening anything; a single click acquiring the activation
meaning; the drawn reference text and its clickable cells disagreeing; a Ctrl+click on a rendered
link dying because an earlier click left a native selection residue; a click-opened file whose editor does not hold
the keyboard; a task-state fallback resolving a different task name, a different tail, or a path
outside `.invar/tasks`.

**Verification:** `bash scripts/smoke-markdown.sh && bun scripts/harness/smoke-markdown-harness.ts
&& bun test src/modules/workspace/Workspace.test.ts src/modules/ui/DoubleClickGesture.test.ts`.

**Status:** established

**Last refined:** 2026-07-30

### An unresolvable Markdown link states why

**Invariant:** If an authored Markdown link (`[label](target)`) is activated in the rendered
preview and its target does not resolve to a workspace file, then the app states the reason — an
external-scheme target answers `External link — not opened here: <target>` and a missing file
answers `Link target not found: <target>` — in the status bar and at the pointer; silence is
never the outcome. Unresolved inline-code text stays ordinary prose with no affordance and no
message.

**Scope:** `MarkdownSplitView.referenceAt` / `bindPreviewEvents` (keeping unresolved authored
links as references, for EVERY activation gesture — modified click, double click, hovered chord),
the `notifyUnresolvedReference` option wired by `MarkdownPreviewContent`,
`Workspace.referenceIsExternal` (the ONE scheme rule, shared with `resolveFileReference`), and
`MarkdownPlugin` (the `markdownLinkNotice` status projection and status-bar segment).

**Mechanism:** `MarkdownReferenceHit.explicitLink` separates authored links from backtick spans at
the hit-test, so the unresolved-link case survives resolution failure instead of being dropped.
Hover explains in place through the shared tooltip; activation additionally writes the message to
`MarkdownSplitView.linkNotice`, which the plugin's own status-bar segment shows. A later
successful open clears the owed notice.

**Generates:** the hover explanation before a click is spent; the status-bar answer to a spent
click; the smoke's missing-target and external-link positive controls; the notice-clearing rule.

**Rejected alternatives:** Opening http(s) targets in a browser — out of scope for a terminal
editor and a surprise seam; a double click on an external link therefore states the same message
rather than acquiring a new capability. Treating unresolved backtick text as a miss — every non-path backtick
token would shout.

**Evidence:** `src/modules/markdown/MarkdownSplitView.ts` (`referenceAt`, `linkNotice`, the
activation branch); `src/modules/markdown/MarkdownPreviewContent.ts` (`notifyUnresolvedReference`
wiring); `src/modules/markdown/MarkdownPlugin.ts` (`segments`, `markdownLinkNotice`);
`src/modules/app/Bootstrap.ts` (the Ctrl+click routing guard that keeps the click deliverable);
`scripts/harness/smoke-markdown-harness.ts` (the "unresolvable link states why" arms).

**Impossible if true:** a Ctrl+click or a double click on a rendered link that neither opens a tab
nor states why; an http(s) link activation that silently does nothing; a missing-file link click whose miss is not
stated; a plain backtick word acquiring a miss message.

**Verification:** `bun scripts/harness/smoke-markdown-harness.ts` and
`bun test src/modules/markdown/MarkdownSplitView.test.ts`.

**Status:** provisional

**Last refined:** 2026-07-30

### Markdown preview selection reuses shared drag behavior

**Invariant:** If a user drags a selection in the rendered preview, then the shared drag-edge
behavior extends one preview text range, autoscrolls that pane, and Ctrl C copies exactly that range.

**Scope:** `MarkdownSplitView.createPreviewViewport`, its preview `ReadOnlyTextBuffer`,
`MarkdownRenderable` cell mapping, `ScrollableTextViewport`, and Bootstrap copy routing.

**Mechanism:** `ScrollableTextViewport` constructs `SelectionDragBehavior` from preview-specific
cell mapping and selection writes, and supplies the same scroll offsets that its wheel and shared
bars use. The range lives in `ReadOnlyTextBuffer.cursor` and paints through `SelectableText`. The
source editor keeps its own selection and remains the only paste target.

**Generates:** preview drag selection; edge autoscroll; exact rendered-text copy; editable-source
paste without a third selection model.

**Evidence:** `src/modules/markdown/MarkdownSplitView.ts` (`previewTextBuffer`);
`src/modules/text/ReadOnlyTextBuffer.ts`; shared behavior tests in
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
`src/modules/text/ReadOnlyTextBuffer.ts` (`findTarget`);
`src/modules/markdown/MarkdownSplitView.ts` (`findTarget`); `scripts/smoke-markdown.sh`.

**Impossible if true:** searching the preview replacing the source query or match list; a preview
match moving the source cursor; a source match being painted in the preview pane.

**Verification:** `bash scripts/smoke-markdown.sh`.

**Status:** established

**Last refined:** 2026-07-24
