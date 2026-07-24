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
    if (row < 0 || row >= this.rows || column < 0 || column >= this.columns) return null;
    return this.copiedCells[(row * this.columns) + column] ?? null;
  }

  rowCells(row: number): ReadonlyArray<HarnessSnapshotCell> {
    if (row < 0 || row >= this.rows) return [];
    const rowStart = row * this.columns;
    return this.copiedCells.slice(rowStart, rowStart + this.columns);
  }

  rowText(row: number): string {
    return this.rowCells(row).map((cell) => cell.characters).join('');
  }

  textRows(): string[] {
    return Array.from({ length: this.rows }, (_unused, row) => this.rowText(row));
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
}

export namespace HarnessSnapshot {
  export const $Class = $HarnessSnapshot;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
