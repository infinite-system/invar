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
  // walk recomputed wraps too). This index makes them O(1)/O(log n) per call with an O(delta) sync
  // per EDIT: per-line row counts survive between revisions, and an edit re-wraps only the changed
  // middle (head/tail trimmed by line-reference equality — TextDocument mutates only edited entries
  // of its line array, so untouched lines keep their string identity).
  // invariant: Cost tracks the actively observed set (project.invariants.md)

  protected static buildPrefix(rowCounts: number[]): number[] {
    const prefix: number[] = new Array(rowCounts.length + 1);
    prefix[0] = 0;
    for (let index = 0; index < rowCounts.length; index++) {
      prefix[index + 1] = (prefix[index] ?? 0) + (rowCounts[index] ?? 1);
    }
    return prefix;
  }

  /** Bring the document's index current for `wrapWidth`: full build on first sight or width change;
   *  otherwise a head/tail identity trim re-wraps only the edited middle (O(delta) wraps + O(n)
   *  reference compares + O(n) prefix additions — no grapheme work for untouched lines). */
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

    if (
      !index ||
      index.width !== width ||
      index.foldedRanges !== normalizedFoldRanges
    ) {
      const lineTexts: string[] = new Array(lineCount);
      const rowCounts: number[] = new Array(lineCount);
      const foldProjection = this.buildFoldProjection(
        lineCount,
        normalizedFoldRanges,
      );
      for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
        const lineText = document.line(lineIndex);
        lineTexts[lineIndex] = lineText;
        rowCounts[lineIndex] =
          foldProjection.visibleLineByLine[lineIndex] !== lineIndex
            ? 0
            : this.segmentsForLine(lineText, width).length;
      }
      index = {
        width,
        foldedRanges: normalizedFoldRanges,
        revision,
        lineTexts,
        rowCounts,
        prefix: this.buildPrefix(rowCounts),
        visibleLineByLine: foldProjection.visibleLineByLine,
        foldedRangeByStartLine: foldProjection.foldedRangeByStartLine,
        lastVisibleLineIndex: foldProjection.lastVisibleLineIndex,
      };
      this.$wrapIndexByDocument.set(document, index);
      return index;
    }

    // Same revision (and a revision is known): nothing moved — the O(1) fast path per query.
    if (
      index.revision === revision &&
      revision !== -1 &&
      index.lineTexts.length === lineCount
    ) {
      return index;
    }

    // Head/tail identity trim: find the unchanged prefix and suffix by string REFERENCE, re-wrap only
    // the middle. Handles in-place edits AND line insertions/deletions (the tail realigns by offset).
    const previousTexts = index.lineTexts;
    const previousCounts = index.rowCounts;
    const previousCount = previousTexts.length;
    let head = 0;
    const maxHead = Math.min(previousCount, lineCount);
    while (head < maxHead && previousTexts[head] === document.line(head))
      head++;
    let tail = 0;
    const maxTail = Math.min(previousCount, lineCount) - head;
    while (
      tail < maxTail &&
      previousTexts[previousCount - 1 - tail] ===
        document.line(lineCount - 1 - tail)
    )
      tail++;

    const lineTexts: string[] = new Array(lineCount);
    const rowCounts: number[] = new Array(lineCount);
    const foldProjection = this.buildFoldProjection(
      lineCount,
      normalizedFoldRanges,
    );
    for (let lineIndex = 0; lineIndex < head; lineIndex++) {
      lineTexts[lineIndex] = previousTexts[lineIndex] as string;
      rowCounts[lineIndex] =
        foldProjection.visibleLineByLine[lineIndex] !== lineIndex
          ? 0
          : (previousCounts[lineIndex] as number);
    }
    for (let lineIndex = head; lineIndex < lineCount - tail; lineIndex++) {
      const lineText = document.line(lineIndex);
      lineTexts[lineIndex] = lineText;
      rowCounts[lineIndex] =
        foldProjection.visibleLineByLine[lineIndex] !== lineIndex
          ? 0
          : this.segmentsForLine(lineText, width).length;
    }
    for (let offsetFromEnd = 1; offsetFromEnd <= tail; offsetFromEnd++) {
      lineTexts[lineCount - offsetFromEnd] = previousTexts[
        previousCount - offsetFromEnd
      ] as string;
      const lineIndex = lineCount - offsetFromEnd;
      rowCounts[lineIndex] =
        foldProjection.visibleLineByLine[lineIndex] !== lineIndex
          ? 0
          : (previousCounts[previousCount - offsetFromEnd] as number);
    }

    index.revision = revision;
    index.lineTexts = lineTexts;
    index.rowCounts = rowCounts;
    index.prefix = this.buildPrefix(rowCounts);
    index.visibleLineByLine = foldProjection.visibleLineByLine;
    index.foldedRangeByStartLine = foldProjection.foldedRangeByStartLine;
    index.lastVisibleLineIndex = foldProjection.lastVisibleLineIndex;
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
    return Math.max(1, index.prefix[index.prefix.length - 1] ?? 1);
  }

  /**
   * The visual-row index of a logical line's FIRST visual row (sum of the visual-row counts of all lines
   * before it). The logical↔visual scroll bridge: maps the cursor's line to its visual offset (scroll-into-
   * view) and a logical scrollTop to its visual position (scrollbar thumb). O(1) off the cumulative index.
   */
  static firstVisualRowOfLine(
    document: WrappableDocument,
    lineIndex: number,
    wrapWidth: number | null,
    foldedRanges: readonly FoldRange[] = [],
  ): number {
    const index = this.syncWrapIndex(document, wrapWidth, foldedRanges);
    const clamped = Math.max(0, Math.min(lineIndex, document.lineCount));
    return index.prefix[clamped] ?? index.prefix[index.prefix.length - 1] ?? 0;
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
    const visibleLineIndex =
      index.visibleLineByLine[clampedLineIndex] ?? clampedLineIndex;
    return (
      index.prefix[visibleLineIndex] ??
      index.prefix[index.prefix.length - 1] ??
      0
    );
  }

  /**
   * The (line, segment) at an absolute VISUAL-row offset — the inverse of $firstVisualRowOfLine. Binary
   * search over the cumulative index (was a from-line-zero walk per call). Clamps to the last visual
   * row. This is what lets the window start MID-LINE (a tall final line's lower segments become
   * reachable — the true-last-visual-row fix). O(log lines).
   */
  static lineSegmentAtVisualRow(
    document: WrappableDocument,
    visualOffset: number,
    wrapWidth: number | null,
    foldedRanges: readonly FoldRange[] = [],
  ): { lineIndex: number; segmentIndex: number } {
    const index = this.syncWrapIndex(document, wrapWidth, foldedRanges);
    const prefix = index.prefix;
    const total = prefix[prefix.length - 1] ?? 0;
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
    // Greatest lineIndex with prefix[lineIndex] <= target.
    let low = 0;
    let high = lineCount - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if ((prefix[middle] ?? 0) <= target) low = middle;
      else high = middle - 1;
    }
    return { lineIndex: low, segmentIndex: target - (prefix[low] ?? 0) };
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
    const visibleLineByLine = Array.from(
      { length: lineCount },
      (_unusedValue, lineIndex) => lineIndex,
    );
    const foldedRangeByStartLine = new Map<number, FoldRange>();
    const orderedRanges = [...foldedRanges].sort(
      (firstRange, secondRange) =>
        firstRange.startLine - secondRange.startLine ||
        secondRange.endLine - firstRange.endLine,
    );
    for (const range of orderedRanges) {
      if (visibleLineByLine[range.startLine] !== range.startLine) continue;
      foldedRangeByStartLine.set(range.startLine, range);
      for (
        let lineIndex = range.startLine + 1;
        lineIndex <= Math.min(range.endLine, lineCount - 1);
        lineIndex++
      ) {
        visibleLineByLine[lineIndex] = range.startLine;
      }
    }
    return {
      visibleLineByLine,
      foldedRangeByStartLine,
      lastVisibleLineIndex:
        visibleLineByLine[Math.max(0, lineCount - 1)] ??
        Math.max(0, lineCount - 1),
    };
  }

  // Stateless capability class (project.conventions.md new-file rule): every operation is a pure
  // static, published through the Static() seam like ScrollbarGeometry.
}

export namespace EditorWrap {
  export const $Class = $EditorWrap;
  export const Class = Static($EditorWrap);
}

export interface WrapSegment {
  /** First grapheme of the segment (inclusive). */
  startGrapheme: number;
  /** End grapheme of the segment (exclusive). */
  endGrapheme: number;
  /** Display column of the segment start on the LOGICAL line's column axis. */
  startDisplayColumn: number;
}

/** The minimal document surface the window walk needs (TextDocument satisfies it). `revision` is
 *  optional (plain test doubles omit it): when present it fast-paths the cumulative index sync —
 *  an unchanged revision skips even the reference sweep. */
export interface WrappableDocument {
  lineCount: number;
  line(index: number): string;
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
  /** The exact line-string references seen at last sync (identity = unchanged, never re-wrapped). */
  lineTexts: string[];
  /** Visual rows per line, aligned with lineTexts. */
  rowCounts: number[];
  /** prefix[i] = visual rows of all lines BEFORE line i; length lineCount+1 (last = total). */
  prefix: number[];
  /** O(1) line lookup: a hidden line maps to its visible collapsed header. */
  visibleLineByLine: number[];
  /** Only visible collapsed headers; nested hidden starts are absent. */
  foldedRangeByStartLine: ReadonlyMap<number, FoldRange>;
  /** O(1) past-end clamp even when a fold hides the document's physical final line. */
  lastVisibleLineIndex: number;
}

export interface FoldProjection {
  visibleLineByLine: number[];
  foldedRangeByStartLine: ReadonlyMap<number, FoldRange>;
  lastVisibleLineIndex: number;
}
