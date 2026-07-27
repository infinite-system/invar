// The shared text-GEOMETRY seam: hard-wrap segmentation measured in terminal DISPLAY CELLS over
// GRAPHEME CLUSTERS, with the forward/inverse position mapping every consumer derives caret, selection,
// and hit-test behavior from. One generator (built on EditorCoordinates' grapheme + wcwidth tools — the
// editor's own width engine, not a second vocabulary) serves the agent transcript (read-only) and the
// composer (editable), so their wrapping and their GEOMETRY can never drift — the review-found bug class
// was exactly this drift: code-point wrapping let CJK overflow panes, split combining marks across rows,
// and made the composer's uniform-width caret math disagree with the rendered rows.
//
// Semantics: a grapheme cluster is NEVER split across a wrap boundary; widths are wcwidth-approximate
// display cells (CJK/emoji = 2, combining marks = 0 within their cluster); '\t' measures as 1 cell here
// (wrapped panes have no tab-stop contract — what matters is that wrap, slice, clip, and caret all use
// the SAME measure). Explicit newlines start a new logical line; an empty logical line yields one empty
// visual segment (blank lines are preserved).
//
// invariant: Seams are drawn at the shared generator (project.invariants.md)
import { Static } from 'ivue/extras';
import { EditorCoordinates } from '../editor/EditorCoordinates';
class $WrapText {
  protected static cellWidthOf(cluster: string): number {
    return cluster === '\t'
      ? 1
      : EditorCoordinates.Class.graphemeWidth(cluster);
  }
  public static displayWidth(text: string): number {
    let width = 0;
    for (const cluster of EditorCoordinates.Class.graphemes(text))
      width += this.cellWidthOf(cluster);
    return width;
  }
  public static segments(text: string, width: number): WrapSegment[] {
    const out: WrapSegment[] = [];
    const budget = Math.max(1, width);
    let graphemeOffset = 0;
    const logicalLines = text.split('\n');
    logicalLines.forEach((logicalLine, logicalIndex) => {
      const clusters = EditorCoordinates.Class.graphemes(logicalLine);
      if (clusters.length === 0) {
        out.push({
          text: '',
          logicalLine: logicalIndex,
          isLogicalLineStart: true,
          graphemeStart: graphemeOffset,
          graphemeCount: 0,
          displayWidth: 0,
        });
      } else {
        let rowText = '';
        let rowStart = graphemeOffset;
        let rowCount = 0;
        let rowWidth = 0;
        let firstRow = true;
        const flush = (): void => {
          out.push({
            text: rowText,
            logicalLine: logicalIndex,
            isLogicalLineStart: firstRow,
            graphemeStart: rowStart,
            graphemeCount: rowCount,
            displayWidth: rowWidth,
          });
          firstRow = false;
          rowText = '';
          rowStart = rowStart + rowCount;
          rowCount = 0;
          rowWidth = 0;
        };
        for (const cluster of clusters) {
          const clusterWidth = this.cellWidthOf(cluster);
          if (rowCount > 0 && rowWidth + clusterWidth > budget) flush();
          rowText += cluster;
          rowCount += 1;
          rowWidth += clusterWidth;
        }
        flush();
      }
      graphemeOffset += clusters.length + 1; // +1 for the newline position between logical lines
    });
    return out;
  }
  public static wrap(text: string, width: number): string[] {
    return this.segments(text, width).map((segment) => segment.text);
  }
  public static visualPositionOf(
    segments: readonly WrapSegment[],
    graphemeIndex: number,
  ): VisualPosition {
    if (segments.length === 0) return { line: 0, column: 0 };
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]!;
      const endOffset = segment.graphemeStart + segment.graphemeCount;
      const isLast = index === segments.length - 1;
      const nextContinuesLine =
        !isLast && !segments[index + 1]!.isLogicalLineStart;
      // Inside this row, or at its end when nothing continues the same logical line after it.
      if (
        graphemeIndex < endOffset ||
        (graphemeIndex === endOffset && (!nextContinuesLine || isLast))
      ) {
        const within = Math.max(0, graphemeIndex - segment.graphemeStart);
        return {
          line: index,
          column: this.displayWidth(
            EditorCoordinates.Class.graphemes(segment.text)
              .slice(0, within)
              .join(''),
          ),
        };
      }
    }
    const last = segments[segments.length - 1]!;
    return { line: segments.length - 1, column: last.displayWidth };
  }
  public static graphemeAtVisualPosition(
    segments: readonly WrapSegment[],
    line: number,
    column: number,
  ): number {
    if (segments.length === 0) return 0;
    const rowIndex = Math.max(0, Math.min(line, segments.length - 1));
    const segment = segments[rowIndex]!;
    const clusters = EditorCoordinates.Class.graphemes(segment.text);
    let cells = 0;
    for (let index = 0; index < clusters.length; index += 1) {
      const clusterWidth = this.cellWidthOf(clusters[index]!);
      if (cells + clusterWidth > Math.max(0, column))
        return segment.graphemeStart + index;
      cells += clusterWidth;
    }
    return segment.graphemeStart + clusters.length;
  }
  public static sliceByDisplayCells(
    text: string,
    startCell: number,
    endCell: number,
  ): string {
    if (endCell <= startCell) return '';
    const clusters = EditorCoordinates.Class.graphemes(text);
    let cells = 0;
    let sliced = '';
    for (const cluster of clusters) {
      const clusterWidth = this.cellWidthOf(cluster);
      if (cells >= endCell) break;
      if (cells >= startCell) sliced += cluster;
      cells += clusterWidth;
    }
    return sliced;
  }
  public static clipToWidth(
    text: string,
    cells: number,
    ellipsis = '…',
  ): string {
    if (cells <= 0) return '';
    if (this.displayWidth(text) <= cells) return text;
    const ellipsisWidth = this.displayWidth(ellipsis);
    return (
      this.prefixToDisplayWidth(text, Math.max(0, cells - ellipsisWidth)) +
      ellipsis
    );
  }

  protected static prefixToDisplayWidth(text: string, cells: number): string {
    let prefix = '';
    let prefixWidth = 0;
    for (const cluster of EditorCoordinates.Class.graphemes(text)) {
      const clusterWidth = this.cellWidthOf(cluster);
      if (prefixWidth + clusterWidth > cells) break;
      prefix += cluster;
      prefixWidth += clusterWidth;
    }
    return prefix;
  }
}
export namespace WrapText {
  export const $Class = Static($WrapText);
  export let Class = $Class;
}
/** One wrapped visual row, with the geometry that generated it. */
export interface WrapSegment {
  /** The row's text (whole grapheme clusters). */
  readonly text: string;
  /** Which logical line (newline-split) this row belongs to. */
  readonly logicalLine: number;
  /** True for the first row of its logical line. */
  readonly isLogicalLineStart: boolean;
  /** Grapheme offset of this row's first cluster within the WHOLE text (newlines counted as 1). */
  readonly graphemeStart: number;
  /** Grapheme clusters in this row. */
  readonly graphemeCount: number;
  /** Display cells this row occupies. */
  readonly displayWidth: number;
}
/** A caret/selection position in wrapped visual space: row index + DISPLAY-CELL column. */
export interface VisualPosition {
  readonly line: number;
  readonly column: number;
}
