import { Static } from 'ivue/extras';
import type { FoldRange } from './CodeFolding';
import { EditorCoordinates } from './EditorCoordinates';
import { WrapBreakOpportunity } from './WrapBreakOpportunity';

// Word-wrap mapping layer — a PURE logical↔visual projection over the coordinate model.
// When word wrap is ON, one logical line renders as one or more VISUAL rows; this module is the
// single source of that mapping. It never touches the document: segments are descriptors over the
// line's grapheme axis, computed on demand and memoized by content (revision-proof — an edited
// line is a new string).
//
// Coordinate convention: `startDisplayColumn` is the segment's first display column on the
// LOGICAL line's continuous column axis (tabs expand against that axis, so a tab's width never
// depends on which visual row it landed on). A visual column within a row is
// `displayColumn(line, col) - segment.startDisplayColumn`.
//
// Cursor convention (no affinity bit): a cursor column that equals a wrap boundary belongs to the
// NEXT segment — it renders at visual column 0 of the following row. End-of-line belongs to the
// last segment.
//
// invariant: Word wrap is a pure view mapping (editor.invariants.md)
// invariant: One generator owns document-line-to-visual-row (editor.invariants.md)
// invariant: Cost tracks the actively observed set (project.invariants.md)
// invariant: Wrapped surfaces share one break generator (project.invariants.md)
class $EditorWrap {
  protected static get TAB_WIDTH(): number {
    return 4;
  }

  protected static get WRAP_MEMO_CAPACITY(): number {
    return 512;
  }

  protected static get $wrapMemo(): Map<string, WrapSegment[]> {
    const wrapMemo = new Map<string, WrapSegment[]>();
    return wrapMemo;
  }

  protected static get $wrapIndexByDocument(): WeakMap<
    WrappableDocument,
    DocumentWrapIndex
  > {
    const wrapIndexByDocument = new WeakMap<
      WrappableDocument,
      DocumentWrapIndex
    >();
    return wrapIndexByDocument;
  }

  protected static get $emptyFoldRanges(): readonly FoldRange[] {
    const emptyFoldRanges: readonly FoldRange[] = [];
    return emptyFoldRanges;
  }

  protected static get EditorCoordinates() {
    return EditorCoordinates.Class;
  }

  /**
   * Wrap one logical line at `wrapWidth` display columns into segment descriptors. Breaks prefer
   * the shared code profile's whitespace, separator, bracket, camelCase, and operator boundaries;
   * an unbroken run longer than the width hard-breaks mid-token. Grapheme-safe by construction —
   * the walk is over grapheme clusters, so a cluster (emoji, CJK, base+combining) is never split.
   * A single cluster wider than the width still gets a row of its own (it overflows; it cannot
   * split). An empty line yields one empty segment.
   */
  static wrapLine(lineText: string, wrapWidth: number): WrapSegment[] {
    const width = Math.max(1, Math.floor(wrapWidth));
    const memoKey = `${width}:${lineText}`;
    const cached = this.$wrapMemo.get(memoKey);
    if (cached !== undefined) return cached;

    const clusters = this.EditorCoordinates.graphemes(lineText);
    const segments: WrapSegment[] = [];
    if (clusters.length === 0) {
      segments.push({
        startGrapheme: 0,
        endGrapheme: 0,
        startDisplayColumn: 0,
      });
    } else {
      // Per-cluster start columns on the logical line's continuous axis (tab-expanded, wide-aware).
      const columns: number[] = new Array(clusters.length + 1);
      columns[0] = 0;
      for (let index = 0; index < clusters.length; index++) {
        const cluster = clusters[index] ?? '';
        const previousColumn = columns[index] ?? 0;
        const clusterWidth =
          cluster === '\t'
            ? this.TAB_WIDTH - (previousColumn % this.TAB_WIDTH)
            : this.EditorCoordinates.graphemeWidth(cluster);
        columns[index + 1] = previousColumn + clusterWidth;
      }

      let segmentStart = 0;
      while (segmentStart < clusters.length) {
        const segmentStartColumn = columns[segmentStart] ?? 0;
        // Furthest end that still fits the width — at least one cluster (an oversized cluster
        // occupies its own overflowing row rather than splitting).
        let fitEnd = segmentStart + 1;
        while (
          fitEnd < clusters.length &&
          (columns[fitEnd + 1] ?? 0) - segmentStartColumn <= width
        ) {
          fitEnd += 1;
        }
        if (fitEnd >= clusters.length) {
          segments.push({
            startGrapheme: segmentStart,
            endGrapheme: clusters.length,
            startDisplayColumn: segmentStartColumn,
          });
          break;
        }
        const preferredBreak =
          WrapBreakOpportunity.Class.previousBreakOpportunity(
            clusters,
            segmentStart,
            fitEnd,
            'code',
          );
        const breakAt = preferredBreak > segmentStart ? preferredBreak : fitEnd;
        segments.push({
          startGrapheme: segmentStart,
          endGrapheme: breakAt,
          startDisplayColumn: segmentStartColumn,
        });
        segmentStart = breakAt;
      }
    }

    if (this.$wrapMemo.size >= this.WRAP_MEMO_CAPACITY) {
      let dropped = 0;
      for (const key of this.$wrapMemo.keys()) {
        this.$wrapMemo.delete(key);
        if (++dropped >= this.WRAP_MEMO_CAPACITY / 2) break;
      }
    }
    this.$wrapMemo.set(memoKey, segments);
    return segments;
  }

  /** Number of visual rows a logical line occupies at `wrapWidth`. */
  static visualRowCount(lineText: string, wrapWidth: number): number {
    return this.wrapLine(lineText, wrapWidth).length;
  }

  protected static segmentsForLine(
    lineText: string,
    wrapWidth: number | null,
  ): WrapSegment[] {
    if (wrapWidth !== null) return this.wrapLine(lineText, wrapWidth);
    return [
      {
        startGrapheme: 0,
        endGrapheme: this.EditorCoordinates.graphemeCount(lineText),
        startDisplayColumn: 0,
      },
    ];
  }

  /**
   * The segment a cursor grapheme column belongs to. A column equal to a wrap boundary belongs to
   * the NEXT segment (renders at visual column 0 of the following row); end-of-line belongs to the
   * last segment. Columns outside [0, lineLength] clamp.
   */
  static segmentIndexForCursor(
    segments: WrapSegment[],
    graphemeColumn: number,
  ): number {
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];
      if (!segment) break;
      if (graphemeColumn < segment.endGrapheme) return index;
    }
    return segments.length - 1;
  }

  /**
   * The flyweight window walk: the visual rows visible from `scrollTop` (a LOGICAL line index — the
   * window always starts at a logical line's FIRST visual row) for a viewport `height` rows tall.
   * Cost is O(window): only lines that contribute rows to the window are wrapped; a long line
   * contributes multiple rows and fills the window faster.
   */
  static visualRowsForWindow(
    document: WrappableDocument,
    scrollTop: number,
    wrapWidth: number,
    height: number,
  ): VisualRow[] {
    const firstLine = Math.max(0, scrollTop);
    if (firstLine >= document.lineCount) return [];
    return this.visualRowsFromOffset(
      document,
      this.firstVisualRowOfLine(document, firstLine, wrapWidth),
      wrapWidth,
      height,
    );
  }

  /**
   * Vertical movement by VISUAL rows: step `deltaRows` rows from (line, col), landing at the goal
   * visual column WITHIN the target row (clamped into that row's grapheme range). The goal is
   * row-relative — the wrapped twin of the display-column goal. Clamps at the document's first and
   * last visual rows.
   */
  static moveByVisualRows(
    document: WrappableDocument,
    position: { line: number; col: number },
    goalVisualColumn: number,
    deltaRows: number,
    wrapWidth: number | null,
    foldedRanges: readonly FoldRange[] = [],
  ): { line: number; col: number } {
    const lineIndex = Math.max(
      0,
      Math.min(position.line, document.lineCount - 1),
    );
    const segments = this.segmentsForLine(document.line(lineIndex), wrapWidth);
    const segmentIndex = this.segmentIndexForCursor(segments, position.col);
    const currentVisualRow =
      this.firstVisualRowOfLine(document, lineIndex, wrapWidth, foldedRanges) +
      segmentIndex;
    const totalRows = this.totalVisualRows(document, wrapWidth, foldedRanges);
    const targetVisualRow = Math.max(
      0,
      Math.min(currentVisualRow + deltaRows, totalRows - 1),
    );
    const target = this.lineSegmentAtVisualRow(
      document,
      targetVisualRow,
      wrapWidth,
      foldedRanges,
    );
    const targetSegments = this.segmentsForLine(
      document.line(target.lineIndex),
      wrapWidth,
    );
    const segment = targetSegments[target.segmentIndex];
    if (!segment) return { line: target.lineIndex, col: 0 };
    const lineText = document.line(target.lineIndex);
    const landing = this.EditorCoordinates.graphemeAtDisplayColumn(
      lineText,
      segment.startDisplayColumn + Math.max(0, goalVisualColumn),
    );
    // Clamp INTO the row: on a non-last segment the boundary column belongs to the next row, so the
    // landing stays one grapheme short of it (the movement remains visually one-row-per-step).
    const lastSegment = target.segmentIndex === targetSegments.length - 1;
    const maxColumn = lastSegment
      ? segment.endGrapheme
      : Math.max(segment.startGrapheme, segment.endGrapheme - 1);
    return {
      line: target.lineIndex,
      col: Math.max(segment.startGrapheme, Math.min(landing, maxColumn)),
    };
  }

  /**
   * The smallest scroll adjustment that makes the cursor's visual row visible. `scrollTop` stays a
   * LOGICAL line index (the window starts at that line's first visual row); the walk accounts for
   * tall lines. O(height): a lower bound (every line is ≥ 1 visual row) caps the walk to the
   * window's worth of lines. If a single line wraps taller than the viewport, the line's first rows
   * win (top = that line) — the one case a cursor row can remain below the fold.
   */
  static scrollTopToRevealCursor(
    document: WrappableDocument,
    currentScrollTop: number,
    cursorLine: number,
    cursorSegmentIndex: number,
    wrapWidth: number,
    height: number,
  ): number {
    if (cursorLine < currentScrollTop) return cursorLine;
    // Lower bound: with ≥1 row per line, a top further than height-1 lines above the cursor can
    // never overflow — start there and only walk the O(height) candidate window.
    let top = Math.max(currentScrollTop, cursorLine - height + 1);
    let rowsThroughCursor = cursorSegmentIndex + 1;
    for (let lineIndex = top; lineIndex < cursorLine; lineIndex++) {
      rowsThroughCursor += this.visualRowCount(
        document.line(lineIndex),
        wrapWidth,
      );
    }
    while (rowsThroughCursor > height && top < cursorLine) {
      rowsThroughCursor -= this.visualRowCount(document.line(top), wrapWidth);
      top += 1;
    }
    return top;
  }

  // --- the cumulative visual-row index -----------------------------------------------------------
  // The extent/locate queries below (scroll extent, line→visual-row, visual-row→line) used to walk
  // EVERY line per call — and they are called per RootView update, so a 50k-line wrapped file paid
  // O(document) per FRAME (the 512-entry segment memo thrashes on a sequential pass, so the "memoized"
  // walk recomputed wraps too). This compact index preserves per-line row counts across revisions;
  // the document's published change range lets an edit re-wrap only changed lines.
  // invariant: Cost tracks the actively observed set (project.invariants.md)

  protected static get BLOCK_SHIFT(): number {
    return 12;
  }

  protected static get blockSize(): number {
    return 1 << this.BLOCK_SHIFT;
  }

  protected static allocateRowCounts(lineCount: number): Uint32Array {
    return new Uint32Array(lineCount);
  }

  protected static allocateBlockRowCounts(blockCount: number): Uint32Array {
    return new Uint32Array(blockCount);
  }

  protected static allocateFoldHeaderByLine(lineCount: number): Uint32Array {
    return new Uint32Array(lineCount);
  }

  protected static writeRowCount(
    rowCounts: Uint32Array,
    lineIndex: number,
    rowCount: number,
  ): void {
    rowCounts[lineIndex] = rowCount;
  }

  protected static writeBlockRowCount(
    blockRowCounts: Uint32Array,
    blockIndex: number,
    rowCount: number,
  ): void {
    blockRowCounts[blockIndex] = rowCount;
  }

  protected static writeFoldHeader(
    foldHeaderByLine: Uint32Array,
    lineIndex: number,
    foldHeaderLineIndex: number,
  ): void {
    foldHeaderByLine[lineIndex] = foldHeaderLineIndex + 1;
  }

  protected static buildBlockRowCounts(rowCounts: ArrayLike<number>): {
    blockRowCounts: Uint32Array;
    totalRowCount: number;
  } {
    const blockRowCounts = this.allocateBlockRowCounts(
      Math.ceil(rowCounts.length / this.blockSize),
    );
    let totalRowCount = 0;
    for (let lineIndex = 0; lineIndex < rowCounts.length; lineIndex++) {
      const rowCount = rowCounts[lineIndex] ?? 1;
      const blockIndex = lineIndex >> this.BLOCK_SHIFT;
      this.writeBlockRowCount(
        blockRowCounts,
        blockIndex,
        (blockRowCounts[blockIndex] ?? 0) + rowCount,
      );
      totalRowCount += rowCount;
    }
    return { blockRowCounts, totalRowCount };
  }

  protected static buildDocumentWrapIndex(
    document: WrappableDocument,
    width: number | null,
    foldedRanges: readonly FoldRange[],
    revision: number,
  ): DocumentWrapIndex {
    const lineCount = document.lineCount;
    const rowCounts = this.allocateRowCounts(lineCount);
    const foldProjection = this.buildFoldProjection(lineCount, foldedRanges);
    for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
      this.writeRowCount(
        rowCounts,
        lineIndex,
        foldProjection.foldHeaderByLine[lineIndex] !== 0
          ? 0
          : width === null
            ? 1
            : this.segmentsForLine(document.line(lineIndex), width).length,
      );
    }
    const { blockRowCounts, totalRowCount } =
      this.buildBlockRowCounts(rowCounts);
    return {
      width,
      foldedRanges,
      revision,
      rowCounts,
      blockRowCounts,
      totalRowCount,
      foldHeaderByLine: foldProjection.foldHeaderByLine,
      foldedRangeByStartLine: foldProjection.foldedRangeByStartLine,
      lastVisibleLineIndex: foldProjection.lastVisibleLineIndex,
    };
  }

  protected static rowCountBeforeLine(
    index: DocumentWrapIndex,
    lineIndex: number,
  ): number {
    const blockIndex = lineIndex >> this.BLOCK_SHIFT;
    let rowCount = 0;
    for (
      let precedingBlockIndex = 0;
      precedingBlockIndex < blockIndex;
      precedingBlockIndex++
    ) {
      rowCount += index.blockRowCounts[precedingBlockIndex] ?? 0;
    }
    const blockStartLineIndex = blockIndex << this.BLOCK_SHIFT;
    for (
      let precedingLineIndex = blockStartLineIndex;
      precedingLineIndex < lineIndex;
      precedingLineIndex++
    ) {
      rowCount += index.rowCounts[precedingLineIndex] ?? 0;
    }
    return rowCount;
  }

  protected static foldBodyIntervals(
    lineCount: number,
    ...foldRangeSets: readonly (readonly FoldRange[])[]
  ): FoldBodyInterval[] {
    const intervals = foldRangeSets
      .flatMap((foldRanges) =>
        foldRanges.map((range) => ({
          startLineIndex: Math.max(0, range.startLine + 1),
          endLineIndex: Math.min(lineCount - 1, range.endLine),
        })),
      )
      .filter((interval) => interval.startLineIndex <= interval.endLineIndex)
      .sort(
        (firstInterval, secondInterval) =>
          firstInterval.startLineIndex - secondInterval.startLineIndex ||
          firstInterval.endLineIndex - secondInterval.endLineIndex,
      );
    const mergedIntervals: FoldBodyInterval[] = [];
    for (const interval of intervals) {
      const previousInterval = mergedIntervals[mergedIntervals.length - 1];
      if (
        previousInterval &&
        interval.startLineIndex <= previousInterval.endLineIndex + 1
      ) {
        previousInterval.endLineIndex = Math.max(
          previousInterval.endLineIndex,
          interval.endLineIndex,
        );
      } else {
        mergedIntervals.push({ ...interval });
      }
    }
    return mergedIntervals;
  }

  protected static patchFoldProjection(
    document: WrappableDocument,
    width: number | null,
    index: DocumentWrapIndex,
    foldedRanges: readonly FoldRange[],
  ): void {
    const lineCount = document.lineCount;
    const foldProjection = this.buildFoldProjection(lineCount, foldedRanges);
    const rowCountDeltaByBlock = new Map<number, number>();
    let totalRowCountDelta = 0;
    for (const interval of this.foldBodyIntervals(
      lineCount,
      index.foldedRanges,
      foldedRanges,
    )) {
      for (
        let lineIndex = interval.startLineIndex;
        lineIndex <= interval.endLineIndex;
        lineIndex++
      ) {
        const previousRowCount = index.rowCounts[lineIndex] ?? 0;
        const nextRowCount =
          foldProjection.foldHeaderByLine[lineIndex] !== 0
            ? 0
            : width === null
              ? 1
              : this.segmentsForLine(document.line(lineIndex), width).length;
        if (nextRowCount === previousRowCount) continue;
        this.writeRowCount(index.rowCounts, lineIndex, nextRowCount);
        const rowCountDelta = nextRowCount - previousRowCount;
        const blockIndex = lineIndex >> this.BLOCK_SHIFT;
        rowCountDeltaByBlock.set(
          blockIndex,
          (rowCountDeltaByBlock.get(blockIndex) ?? 0) + rowCountDelta,
        );
        totalRowCountDelta += rowCountDelta;
      }
    }
    for (const [blockIndex, rowCountDelta] of rowCountDeltaByBlock) {
      this.writeBlockRowCount(
        index.blockRowCounts,
        blockIndex,
        (index.blockRowCounts[blockIndex] ?? 0) + rowCountDelta,
      );
    }
    index.totalRowCount += totalRowCountDelta;
    index.foldedRanges = foldedRanges;
    index.foldHeaderByLine = foldProjection.foldHeaderByLine;
    index.foldedRangeByStartLine = foldProjection.foldedRangeByStartLine;
    index.lastVisibleLineIndex = foldProjection.lastVisibleLineIndex;
  }

  /** Bring the document's index current for `wrapWidth`: full build on first sight, width change,
   *  or an absent change fact. A fold-only change patches its collapsed spans and touched block
   *  totals. Otherwise patch only the published changed range. A same-line edit reuses both typed
   *  arrays and updates one row, its block total when the row count changed, and the exact document
   *  total. */
  protected static syncWrapIndex(
    document: WrappableDocument,
    wrapWidth: number | null,
    foldedRanges: readonly FoldRange[] = [],
  ): DocumentWrapIndex {
    const width =
      wrapWidth === null ? null : Math.max(1, Math.floor(wrapWidth));
    const normalizedFoldRanges =
      foldedRanges.length === 0 ? this.$emptyFoldRanges : foldedRanges;
    const revision = document.revision ? document.revision.value : -1;
    const lineCount = document.lineCount;
    let index = this.$wrapIndexByDocument.get(document);

    if (!index || index.width !== width) {
      index = this.buildDocumentWrapIndex(
        document,
        width,
        normalizedFoldRanges,
        revision,
      );
      this.$wrapIndexByDocument.set(document, index);
      return index;
    }

    if (
      index.foldedRanges !== normalizedFoldRanges &&
      index.revision === revision &&
      index.rowCounts.length === lineCount
    ) {
      this.patchFoldProjection(document, width, index, normalizedFoldRanges);
      return index;
    }

    if (index.foldedRanges !== normalizedFoldRanges) {
      index = this.buildDocumentWrapIndex(
        document,
        width,
        normalizedFoldRanges,
        revision,
      );
      this.$wrapIndexByDocument.set(document, index);
      return index;
    }

    // Same revision (and a revision is known): nothing moved — the O(1) fast path per query.
    if (
      index.revision === revision &&
      revision !== -1 &&
      index.rowCounts.length === lineCount
    ) {
      return index;
    }

    const lineChange = document.lastLineChange;
    const previousCounts = index.rowCounts;
    const previousLineCount = previousCounts.length;
    const changeMatchesRevision =
      lineChange !== undefined &&
      lineChange !== null &&
      lineChange.revision === revision &&
      previousLineCount -
        lineChange.deletedLineCount +
        lineChange.insertedLineCount ===
        lineCount;
    const canPatchLineCountChange =
      changeMatchesRevision && normalizedFoldRanges.length === 0;
    if (
      !changeMatchesRevision ||
      (previousLineCount !== lineCount && !canPatchLineCountChange)
    ) {
      index = this.buildDocumentWrapIndex(
        document,
        width,
        normalizedFoldRanges,
        revision,
      );
      this.$wrapIndexByDocument.set(document, index);
      return index;
    }

    const rowCounts =
      previousLineCount === lineCount
        ? previousCounts
        : this.allocateRowCounts(lineCount);
    if (previousLineCount !== lineCount) {
      rowCounts.set(previousCounts.subarray(0, lineChange.startLineIndex), 0);
      const previousTailStartLineIndex =
        lineChange.startLineIndex + lineChange.deletedLineCount;
      const nextTailStartLineIndex =
        lineChange.startLineIndex + lineChange.insertedLineCount;
      rowCounts.set(
        previousCounts.subarray(previousTailStartLineIndex),
        nextTailStartLineIndex,
      );
    }
    const changedLineEndIndex =
      lineChange.startLineIndex + lineChange.insertedLineCount;
    for (
      let lineIndex = lineChange.startLineIndex;
      lineIndex < changedLineEndIndex;
      lineIndex++
    ) {
      const previousRowCount = rowCounts[lineIndex] ?? 0;
      const nextRowCount =
        normalizedFoldRanges.length > 0 &&
        index.foldHeaderByLine[lineIndex] !== 0
          ? 0
          : width === null
            ? 1
            : this.segmentsForLine(document.line(lineIndex), width).length;
      this.writeRowCount(rowCounts, lineIndex, nextRowCount);
      if (
        previousLineCount === lineCount &&
        nextRowCount !== previousRowCount
      ) {
        const rowCountDelta = nextRowCount - previousRowCount;
        const blockIndex = lineIndex >> this.BLOCK_SHIFT;
        this.writeBlockRowCount(
          index.blockRowCounts,
          blockIndex,
          (index.blockRowCounts[blockIndex] ?? 0) + rowCountDelta,
        );
        index.totalRowCount += rowCountDelta;
      }
    }
    if (previousLineCount !== lineCount) {
      const blockIndex = this.buildBlockRowCounts(rowCounts);
      index.blockRowCounts = blockIndex.blockRowCounts;
      index.totalRowCount = blockIndex.totalRowCount;
      const foldProjection = this.buildFoldProjection(
        lineCount,
        normalizedFoldRanges,
      );
      index.foldHeaderByLine = foldProjection.foldHeaderByLine;
      index.foldedRangeByStartLine = foldProjection.foldedRangeByStartLine;
      index.lastVisibleLineIndex = foldProjection.lastVisibleLineIndex;
    }
    index.revision = revision;
    index.rowCounts = rowCounts;
    return index;
  }

  /**
   * Total visual rows the whole document occupies at `wrapWidth` — the wrapped scroll EXTENT. This is the
   * scrollbar's scrollSize and the max-scroll basis in wrap mode (a logical line count under-reports it,
   * which is the "scrollbar wrong / can't reach the bottom" bug). O(1) off the cumulative index
   * (O(delta) sync after an edit) — this is called per frame, so it must never walk the document.
   */
  static totalVisualRows(
    document: WrappableDocument,
    wrapWidth: number | null,
    foldedRanges: readonly FoldRange[] = [],
  ): number {
    const index = this.syncWrapIndex(document, wrapWidth, foldedRanges);
    return Math.max(1, index.totalRowCount);
  }

  /**
   * The visual-row index of a logical line's FIRST visual row (sum of the visual-row counts of all lines
   * before it). The logical↔visual scroll bridge: maps the cursor's line to its visual offset (scroll-into-
   * view) and a logical scrollTop to its visual position (scrollbar thumb). Reads preceding block
   * totals, then at most one fixed 4096-line block; it never re-wraps untouched text.
   */
  static firstVisualRowOfLine(
    document: WrappableDocument,
    lineIndex: number,
    wrapWidth: number | null,
    foldedRanges: readonly FoldRange[] = [],
  ): number {
    const index = this.syncWrapIndex(document, wrapWidth, foldedRanges);
    const clamped = Math.max(0, Math.min(lineIndex, document.lineCount));
    return this.rowCountBeforeLine(index, clamped);
  }

  /**
   * The visible visual row representing a document line. Visible lines map to their first segment;
   * a line hidden by a collapsed region maps to that region's visible header. Whole-document
   * projections such as the overview ruler use this instead of inventing a document-line ratio.
   */
  static visualRowOfLine(
    document: WrappableDocument,
    lineIndex: number,
    wrapWidth: number | null,
    foldedRanges: readonly FoldRange[] = [],
  ): number {
    const index = this.syncWrapIndex(document, wrapWidth, foldedRanges);
    const clampedLineIndex = Math.max(
      0,
      Math.min(lineIndex, document.lineCount),
    );
    const encodedFoldHeader = index.foldHeaderByLine[clampedLineIndex] ?? 0;
    const visibleLineIndex =
      encodedFoldHeader === 0 ? clampedLineIndex : encodedFoldHeader - 1;
    return this.rowCountBeforeLine(index, visibleLineIndex);
  }

  /**
   * The (line, segment) at an absolute VISUAL-row offset — the inverse of $firstVisualRowOfLine.
   * Walk compact block totals, then at most one fixed 4096-line block (instead of wrapping from
   * line zero). Clamps to the last visual row. This is what lets the window start MID-LINE (a tall
   * final line's lower segments become reachable — the true-last-visual-row fix).
   */
  static lineSegmentAtVisualRow(
    document: WrappableDocument,
    visualOffset: number,
    wrapWidth: number | null,
    foldedRanges: readonly FoldRange[] = [],
  ): { lineIndex: number; segmentIndex: number } {
    const index = this.syncWrapIndex(document, wrapWidth, foldedRanges);
    const total = index.totalRowCount;
    const lineCount = document.lineCount;
    if (lineCount === 0) return { lineIndex: 0, segmentIndex: 0 };
    if (visualOffset >= total) {
      // Past the end: clamp to the last line that actually contributes a visual row. A collapsed
      // fold may hide the document's physical final line.
      const lastVisibleLine = index.lastVisibleLineIndex;
      return {
        lineIndex: lastVisibleLine,
        segmentIndex: Math.max(0, (index.rowCounts[lastVisibleLine] ?? 1) - 1),
      };
    }
    const target = Math.max(0, visualOffset);
    let rowsBeforeBlock = 0;
    let targetBlockIndex = 0;
    while (
      targetBlockIndex < index.blockRowCounts.length &&
      rowsBeforeBlock + (index.blockRowCounts[targetBlockIndex] ?? 0) <= target
    ) {
      rowsBeforeBlock += index.blockRowCounts[targetBlockIndex] ?? 0;
      targetBlockIndex++;
    }
    const blockStartLineIndex = targetBlockIndex << this.BLOCK_SHIFT;
    const blockEndLineIndex = Math.min(
      lineCount,
      blockStartLineIndex + this.blockSize,
    );
    let rowsBeforeLine = rowsBeforeBlock;
    for (
      let lineIndex = blockStartLineIndex;
      lineIndex < blockEndLineIndex;
      lineIndex++
    ) {
      const rowCount = index.rowCounts[lineIndex] ?? 0;
      if (rowsBeforeLine + rowCount > target) {
        return {
          lineIndex,
          segmentIndex: target - rowsBeforeLine,
        };
      }
      rowsBeforeLine += rowCount;
    }
    return {
      lineIndex: index.lastVisibleLineIndex,
      segmentIndex: Math.max(
        0,
        (index.rowCounts[index.lastVisibleLineIndex] ?? 1) - 1,
      ),
    };
  }

  /**
   * The flyweight window walk from an absolute VISUAL-row offset (not a logical line). The window may
   * start MID-LINE — at any segment — so every visual row, including a tall last line's lower segments, is
   * reachable. O(window) once the start line is located ($lineSegmentAtVisualRow).
   */
  static visualRowsFromOffset(
    document: WrappableDocument,
    visualOffset: number,
    wrapWidth: number | null,
    height: number,
    foldedRanges: readonly FoldRange[] = [],
  ): VisualRow[] {
    const index = this.syncWrapIndex(document, wrapWidth, foldedRanges);
    const start = this.lineSegmentAtVisualRow(
      document,
      visualOffset,
      wrapWidth,
      foldedRanges,
    );
    const rows: VisualRow[] = [];
    for (
      let lineIndex = start.lineIndex;
      lineIndex < document.lineCount && rows.length < height;
      lineIndex++
    ) {
      if ((index.rowCounts[lineIndex] ?? 0) === 0) continue;
      const segments = this.segmentsForLine(
        document.line(lineIndex),
        wrapWidth,
      );
      const firstSegment =
        lineIndex === start.lineIndex ? start.segmentIndex : 0;
      for (
        let segmentIndex = firstSegment;
        segmentIndex < segments.length && rows.length < height;
        segmentIndex++
      ) {
        const segment = segments[segmentIndex];
        if (!segment) break;
        rows.push({
          lineIndex,
          segmentIndex,
          segment,
          firstOfLine: segmentIndex === 0,
          foldedRange: index.foldedRangeByStartLine.get(lineIndex),
        });
      }
      const foldedRange = index.foldedRangeByStartLine.get(lineIndex);
      if (foldedRange) lineIndex = foldedRange.endLine;
    }
    return rows;
  }

  protected static buildFoldProjection(
    lineCount: number,
    foldedRanges: readonly FoldRange[],
  ): FoldProjection {
    const foldHeaderByLine = this.allocateFoldHeaderByLine(lineCount);
    const foldedRangeByStartLine = new Map<number, FoldRange>();
    const orderedRanges = [...foldedRanges].sort(
      (firstRange, secondRange) =>
        firstRange.startLine - secondRange.startLine ||
        secondRange.endLine - firstRange.endLine,
    );
    for (const range of orderedRanges) {
      if (foldHeaderByLine[range.startLine] !== 0) continue;
      foldedRangeByStartLine.set(range.startLine, range);
      for (
        let lineIndex = range.startLine + 1;
        lineIndex <= Math.min(range.endLine, lineCount - 1);
        lineIndex++
      ) {
        this.writeFoldHeader(foldHeaderByLine, lineIndex, range.startLine);
      }
    }
    return {
      foldHeaderByLine,
      foldedRangeByStartLine,
      lastVisibleLineIndex: this.visibleLineIndex(
        foldHeaderByLine,
        Math.max(0, lineCount - 1),
      ),
    };
  }

  protected static visibleLineIndex(
    foldHeaderByLine: Uint32Array,
    lineIndex: number,
  ): number {
    const encodedFoldHeader = foldHeaderByLine[lineIndex] ?? 0;
    return encodedFoldHeader === 0 ? lineIndex : encodedFoldHeader - 1;
  }

  // Stateless capability class (project.conventions.md new-file rule): every operation is a pure
  // static, published through the Static() seam like ScrollbarGeometry.
}

export namespace EditorWrap {
  export const $Class = Static($EditorWrap);
  export let Class = $Class;
}

export interface WrapSegment {
  /** First grapheme of the segment (inclusive). */
  startGrapheme: number;
  /** End grapheme of the segment (exclusive). */
  endGrapheme: number;
  /** Display column of the segment start on the LOGICAL line's column axis. */
  startDisplayColumn: number;
}

/** The minimal document surface the window walk needs (TextDocument satisfies it). `revision` and
 *  `lastLineChange` are the paired change facts: an unchanged revision skips synchronization, and
 *  the matching change describes the only range an edit may patch. Plain test doubles may omit
 *  both, in which case correctness falls back to rebuilding. */
export interface WrappableDocument {
  lineCount: number;
  line(index: number): string;
  lastLineChange?: {
    readonly deletedLineCount: number;
    readonly insertedLineCount: number;
    readonly revision: number;
    readonly startLineIndex: number;
  } | null;
  revision?: { value: number };
}

export interface VisualRow {
  lineIndex: number;
  segmentIndex: number;
  segment: WrapSegment;
  /** True on a logical line's FIRST visual row (the only row that shows the line number). */
  firstOfLine: boolean;
  /** Present on every visual segment of a collapsed range's visible first line. */
  foldedRange?: FoldRange;
}

export interface DocumentWrapIndex {
  width: number | null;
  /** Stable collapsed-range identity; compared in O(1) on unchanged frames. */
  foldedRanges: readonly FoldRange[];
  /** The document revision this index was synced at (-1 = unknown, resync on every query). */
  revision: number;
  /** Visual rows per line, aligned with the document's compact line storage. */
  rowCounts: Uint32Array;
  /** Visual-row totals for each fixed-size line block. */
  blockRowCounts: Uint32Array;
  /** Exact visual-row total maintained with the block sums. */
  totalRowCount: number;
  /** Zero means visible; a hidden line stores its collapsed header index plus one. */
  foldHeaderByLine: Uint32Array;
  /** Only visible collapsed headers; nested hidden starts are absent. */
  foldedRangeByStartLine: ReadonlyMap<number, FoldRange>;
  /** O(1) past-end clamp even when a fold hides the document's physical final line. */
  lastVisibleLineIndex: number;
}

export interface FoldProjection {
  /** Zero means visible; a hidden line stores its collapsed header index plus one. */
  foldHeaderByLine: Uint32Array;
  foldedRangeByStartLine: ReadonlyMap<number, FoldRange>;
  lastVisibleLineIndex: number;
}

interface FoldBodyInterval {
  startLineIndex: number;
  endLineIndex: number;
}
