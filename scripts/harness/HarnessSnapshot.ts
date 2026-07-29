// An immutable copy of one emulator frame. Smoke assertions can retain and compare snapshots without
// observing the production emulator's reusable flyweight cell.
//
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import type { TerminalCell } from '../../src/modules/terminal/TerminalEmulator';

export interface HarnessSnapshotCell extends TerminalCell {
  readonly row: number;
  readonly column: number;
}

export interface HarnessTextPosition {
  row: number;
  column: number;
}

class $HarnessSnapshot {
  constructor(
    readonly columns: number,
    readonly rows: number,
    readonly cursorColumn: number,
    readonly cursorRow: number,
    private readonly copiedCells: ReadonlyArray<HarnessSnapshotCell>,
  ) {}

  cell(row: number, column: number): HarnessSnapshotCell | null {
    if (row < 0 || row >= this.rows || column < 0 || column >= this.columns)
      return null;
    return this.copiedCells[row * this.columns + column] ?? null;
  }

  rowCells(row: number): ReadonlyArray<HarnessSnapshotCell> {
    if (row < 0 || row >= this.rows) return [];
    const rowStart = row * this.columns;
    return this.copiedCells.slice(rowStart, rowStart + this.columns);
  }

  rowText(row: number): string {
    return this.rowCells(row)
      .map((cell) => cell.characters)
      .join('');
  }

  textRows(): string[] {
    return Array.from({ length: this.rows }, (_unused, row) =>
      this.rowText(row),
    );
  }

  text(): string {
    return this.textRows().join('\n');
  }

  findText(marker: string): HarnessTextPosition | null {
    for (let row = 0; row < this.rows; row++) {
      const column = this.rowText(row).indexOf(marker);
      if (column >= 0) return { row, column };
    }
    return null;
  }

  /** The position of `marker` inside the editor SOURCE pane, located at call time. Other panes
   *  echo the same document text (the markdown preview renders it; the structure outline lists
   *  its symbols), so a whole-grid `findText` can anchor on the wrong pane whenever those panes
   *  are open — which they are at the app's defaults. An editor source cell is recognized by its
   *  pane segment: the text between the nearest `│` border on its left and the marker begins
   *  with a line number followed by a gutter mark, a fold mark, or the number's padding space —
   *  a shape no preview, outline, or tree row produces. */
  findEditorText(marker: string): HarnessTextPosition | null {
    for (let row = 0; row < this.rows; row++) {
      const text = this.rowText(row);
      let column = text.indexOf(marker);
      while (column >= 0) {
        if (this.isEditorCell(row, column)) return { row, column };
        column = text.indexOf(marker, column + 1);
      }
    }
    return null;
  }

  /** True when (row, column) sits inside the editor SOURCE pane: some `│` on its left starts a
   *  segment that reads as a line-number gutter — digits, then only gutter marks, fold marks,
   *  fold-range guides, and spaces up to the column. A fold-range guide paints `│` INSIDE the
   *  editor content, so the scan walks borders leftward while the segment stays gutter-shaped;
   *  the first content character (a tree glyph, an outline mark, preview prose) ends the walk,
   *  which is what keeps a dock or preview cell from reaching across panes to the editor's own
   *  gutter. The pane test behind `findEditorText`, exposed for callers that match by regular
   *  expression instead of a fixed marker. */
  isEditorCell(row: number, column: number): boolean {
    const text = this.rowText(row);
    let borderColumn = text.lastIndexOf('│', column - 1);
    while (borderColumn >= 0) {
      const paneSegment = text.slice(borderColumn + 1, column);
      // A gutter-started segment decides: the cell is the editor's exactly when no further `│`
      // follows the gutter prefix — a later `│` is the editor's right border, so the cell sits
      // in a pane beyond it (the outline dock, most often), never in the editor.
      const gutterPrefix = /^(\s*\d+[ ›⌄▎▏][\s│›⌄▎▏]*)/.exec(paneSegment);
      if (gutterPrefix) {
        return !paneSegment.slice(gutterPrefix[1]!.length).includes('│');
      }
      // Otherwise this `│` was a fold-range guide or an inner decoration, not the pane's own
      // border — keep walking toward the true border on its left.
      borderColumn = text.lastIndexOf('│', borderColumn - 1);
    }
    return false;
  }
}

export namespace HarnessSnapshot {
  export const $Class = $HarnessSnapshot;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
