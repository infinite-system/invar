// The cumulative visual-row index behind totalVisualRows / firstVisualRowOfLine /
// lineSegmentAtVisualRow: per-frame queries must be O(1) (ZERO document reads on an unchanged
// revision — they used to walk every line per RootView update), edits must resync only the delta,
// and every answer must equal the naive full walk.
import { test, expect, describe } from 'bun:test';
import { effect, stop } from 'vue';
import { EditorWrap } from './EditorWrap';
import { TextDocument } from '../text/TextDocument';

class IndexProbeDocument {
  lineReads = 0;
  lastLineChange: {
    deletedLineCount: number;
    insertedLineCount: number;
    revision: number;
    startLineIndex: number;
  } | null = null;
  readonly revision = { value: 0 };
  constructor(protected readonly lines: string[]) {}
  get lineCount(): number {
    return this.lines.length;
  }
  line(index: number): string {
    this.lineReads++;
    return this.lines[index] ?? '';
  }
  editLine(index: number, text: string): void {
    this.lines[index] = text;
    this.lastLineChange = {
      deletedLineCount: 1,
      insertedLineCount: 1,
      revision: this.revision.value + 1,
      startLineIndex: index,
    };
    this.revision.value++;
  }
  insertLine(index: number, text: string): void {
    this.lines.splice(index, 0, text);
    this.lastLineChange = {
      deletedLineCount: 0,
      insertedLineCount: 1,
      revision: this.revision.value + 1,
      startLineIndex: index,
    };
    this.revision.value++;
  }
  removeLine(index: number): void {
    this.lines.splice(index, 1);
    this.lastLineChange = {
      deletedLineCount: 1,
      insertedLineCount: 0,
      revision: this.revision.value + 1,
      startLineIndex: index,
    };
    this.revision.value++;
  }
}

class $CountingEditorWrap extends EditorWrap.$Class {
  static rowArrayAllocations = 0;
  static blockArrayAllocations = 0;
  static visibleLineArrayAllocations = 0;
  static rowWrites = 0;
  static blockWrites = 0;
  static visibleLineWrites = 0;

  static resetCounts(): void {
    this.rowArrayAllocations = 0;
    this.blockArrayAllocations = 0;
    this.visibleLineArrayAllocations = 0;
    this.rowWrites = 0;
    this.blockWrites = 0;
    this.visibleLineWrites = 0;
  }

  static counts(): WrapIndexOperationCounts {
    return {
      blockArrayAllocations: this.blockArrayAllocations,
      blockWrites: this.blockWrites,
      visibleLineArrayAllocations: this.visibleLineArrayAllocations,
      visibleLineWrites: this.visibleLineWrites,
      rowArrayAllocations: this.rowArrayAllocations,
      rowWrites: this.rowWrites,
    };
  }

  static foldProjection(
    lineCount: number,
    foldedRanges: NonNullable<
      Parameters<typeof EditorWrap.Class.totalVisualRows>[2]
    >,
  ) {
    return this.buildFoldProjection(lineCount, foldedRanges);
  }

  protected static override allocateRowCounts(lineCount: number): Uint32Array {
    this.rowArrayAllocations++;
    return super.allocateRowCounts(lineCount);
  }

  protected static override allocateBlockRowCounts(
    blockCount: number,
  ): Uint32Array {
    this.blockArrayAllocations++;
    return super.allocateBlockRowCounts(blockCount);
  }

  protected static override allocateVisibleLineByLine(
    lineCount: number,
  ): Uint32Array {
    this.visibleLineArrayAllocations++;
    return super.allocateVisibleLineByLine(lineCount);
  }

  protected static override writeRowCount(
    rowCounts: Uint32Array,
    lineIndex: number,
    rowCount: number,
  ): void {
    this.rowWrites++;
    super.writeRowCount(rowCounts, lineIndex, rowCount);
  }

  protected static override writeBlockRowCount(
    blockRowCounts: Uint32Array,
    blockIndex: number,
    rowCount: number,
  ): void {
    this.blockWrites++;
    super.writeBlockRowCount(blockRowCounts, blockIndex, rowCount);
  }

  protected static override writeVisibleLine(
    visibleLineByLine: Uint32Array,
    lineIndex: number,
    visibleLineIndex: number,
  ): void {
    this.visibleLineWrites++;
    super.writeVisibleLine(visibleLineByLine, lineIndex, visibleLineIndex);
  }
}

interface WrapIndexOperationCounts {
  readonly blockArrayAllocations: number;
  readonly blockWrites: number;
  readonly visibleLineArrayAllocations: number;
  readonly visibleLineWrites: number;
  readonly rowArrayAllocations: number;
  readonly rowWrites: number;
}

/** The naive ground truth: wrap every line and sum. */
function naiveTotal(document: IndexProbeDocument, width: number): number {
  let total = 0;
  for (let index = 0; index < document.lineCount; index++) {
    total += EditorWrap.Class.wrapLine(document.line(index), width).length;
  }
  return Math.max(1, total);
}

function makeLines(count: number): string[] {
  const lines: string[] = [];
  for (let index = 0; index < count; index++) {
    // Varied lengths: some wrap to 1 row, some to 2-4 rows at width 10.
    lines.push('word '.repeat(index % 7));
  }
  return lines;
}

describe('EditorWrap cumulative index', () => {
  test('the typed fold projection preserves visible-line mapping semantics', () => {
    const projection = $CountingEditorWrap.foldProjection(5, [
      { startLine: 0, endLine: 3, kind: 'delimiter' },
    ]);

    expect(projection.visibleLineByLine).toBeInstanceOf(Uint32Array);
    expect([...projection.visibleLineByLine]).toEqual([0, 0, 0, 0, 4]);
  });

  test('extent equals the naive walk, and an unchanged revision costs ZERO document reads', () => {
    const document = new IndexProbeDocument(makeLines(200));
    const expected = naiveTotal(document, 10);
    expect(EditorWrap.Class.totalVisualRows(document, 10)).toBe(expected);
    document.lineReads = 0;
    // The per-frame calls: extent + a locate + a line bridge — all off the index, no line reads.
    expect(EditorWrap.Class.totalVisualRows(document, 10)).toBe(expected);
    EditorWrap.Class.firstVisualRowOfLine(document, 150, 10);
    EditorWrap.Class.lineSegmentAtVisualRow(
      document,
      Math.floor(expected / 2),
      10,
    );
    expect(document.lineReads).toBe(0);
  });

  test('an edit resyncs correctly (extent, bridge, and inverse agree with the naive walk)', () => {
    const document = new IndexProbeDocument(makeLines(120));
    EditorWrap.Class.totalVisualRows(document, 10); // build
    document.editLine(60, 'word '.repeat(12)); // now wraps much taller
    const expected = naiveTotal(document, 10);
    expect(EditorWrap.Class.totalVisualRows(document, 10)).toBe(expected);
    // Bridge and inverse are mutually consistent at every line boundary around the edit.
    for (const lineIndex of [0, 59, 60, 61, 119]) {
      const firstRow = EditorWrap.Class.firstVisualRowOfLine(
        document,
        lineIndex,
        10,
      );
      expect(
        EditorWrap.Class.lineSegmentAtVisualRow(document, firstRow, 10),
      ).toEqual({
        lineIndex,
        segmentIndex: 0,
      });
    }
  });

  test('same-line edit work is identical at 2k and 1M lines', () => {
    const countsByLineCount = [2_000, 1_000_000].map((lineCount) => {
      const document = new IndexProbeDocument(makeLines(lineCount));
      const targetLineIndex = Math.floor(lineCount / 2);
      $CountingEditorWrap.totalVisualRows(document, 80);
      $CountingEditorWrap.resetCounts();

      document.editLine(targetLineIndex, `${document.line(targetLineIndex)}x`);
      $CountingEditorWrap.totalVisualRows(document, 80);
      return $CountingEditorWrap.counts();
    });

    expect(countsByLineCount[0]).toEqual({
      blockArrayAllocations: 0,
      blockWrites: 0,
      visibleLineArrayAllocations: 0,
      visibleLineWrites: 0,
      rowArrayAllocations: 0,
      rowWrites: 1,
    });
    expect(countsByLineCount[1]).toEqual(countsByLineCount[0]);
  });

  test('the document revision publishes an in-place typed-array update', () => {
    const document = new TextDocument.Class();
    document.loadFromText('12345\nsecond');
    const observedTotals: number[] = [];
    const projectionEffect = effect(() => {
      document.revision.value;
      observedTotals.push($CountingEditorWrap.totalVisualRows(document, 5));
    });
    $CountingEditorWrap.resetCounts();

    document.insertInline(0, 5, 'x');

    expect(observedTotals).toEqual([3, 4]);
    expect($CountingEditorWrap.counts()).toEqual({
      blockArrayAllocations: 0,
      blockWrites: 1,
      visibleLineArrayAllocations: 0,
      visibleLineWrites: 0,
      rowArrayAllocations: 0,
      rowWrites: 1,
    });
    stop(projectionEffect);
  });

  test('operation counter positive control detects a forced full rebuild', () => {
    const document = new IndexProbeDocument(makeLines(2_000));
    $CountingEditorWrap.totalVisualRows(document, 80);
    $CountingEditorWrap.resetCounts();
    document.editLine(1_000, `${document.line(1_000)}x`);

    $CountingEditorWrap.totalVisualRows(document, 80, [
      { startLine: 2_000, endLine: 2_000, kind: 'delimiter' },
    ]);

    expect($CountingEditorWrap.counts()).toEqual({
      blockArrayAllocations: 1,
      blockWrites: 2_000,
      visibleLineArrayAllocations: 1,
      visibleLineWrites: 2_000,
      rowArrayAllocations: 1,
      rowWrites: 2_000,
    });
  });

  test('edit counts are flat across the nested fixture fold and size axes', () => {
    const levelZeroFoldRange = {
      startLine: 1,
      endLine: 138_622,
      kind: 'delimiter' as const,
    };
    const cases = [554_490, 970_356].flatMap((lineCount) =>
      [false, true].map((collapsed) => {
        const document = new IndexProbeDocument(makeLines(lineCount));
        const foldedRanges = collapsed ? [levelZeroFoldRange] : [];
        const initialTotal = $CountingEditorWrap.totalVisualRows(
          document,
          80,
          foldedRanges,
        );
        if (collapsed) {
          expect(initialTotal).toBe(lineCount - 138_621);
        }
        $CountingEditorWrap.resetCounts();

        document.editLine(0, `${document.line(0)}x`);
        $CountingEditorWrap.totalVisualRows(document, 80, foldedRanges);
        return {
          collapsed,
          counts: $CountingEditorWrap.counts(),
          lineCount,
        };
      }),
    );
    const expectedCounts: WrapIndexOperationCounts = {
      blockArrayAllocations: 0,
      blockWrites: 0,
      visibleLineArrayAllocations: 0,
      visibleLineWrites: 0,
      rowArrayAllocations: 0,
      rowWrites: 1,
    };

    for (const measuredCase of cases) {
      expect(measuredCase.counts).toEqual(expectedCounts);
    }
  });

  test('fold toggles patch only the shared hidden body at both document sizes', () => {
    const levelZeroFoldRange = {
      startLine: 1,
      endLine: 138_622,
      kind: 'delimiter' as const,
    };
    const measurements = [554_490, 970_356].map((lineCount) => {
      const document = new IndexProbeDocument(makeLines(lineCount));
      expect($CountingEditorWrap.totalVisualRows(document, 80)).toBe(lineCount);
      $CountingEditorWrap.resetCounts();

      expect(
        $CountingEditorWrap.totalVisualRows(document, 80, [levelZeroFoldRange]),
      ).toBe(lineCount - 138_621);
      const collapse = $CountingEditorWrap.counts();
      $CountingEditorWrap.resetCounts();

      expect($CountingEditorWrap.totalVisualRows(document, 80)).toBe(lineCount);
      const expand = $CountingEditorWrap.counts();
      return { collapse, expand, lineCount };
    });
    const expectedToggleCounts: WrapIndexOperationCounts = {
      blockArrayAllocations: 0,
      blockWrites: 34,
      visibleLineArrayAllocations: 0,
      visibleLineWrites: 138_621,
      rowArrayAllocations: 0,
      rowWrites: 138_621,
    };

    for (const measurement of measurements) {
      expect(measurement.collapse).toEqual(expectedToggleCounts);
      expect(measurement.expand).toEqual(expectedToggleCounts);
    }
  });

  test('fold patches preserve direct visible-line values through nested toggles', () => {
    const document = new IndexProbeDocument(makeLines(10));
    const outerRange = {
      startLine: 0,
      endLine: 8,
      kind: 'delimiter' as const,
    };
    const innerRange = {
      startLine: 2,
      endLine: 5,
      kind: 'delimiter' as const,
    };

    expect(
      $CountingEditorWrap.visualRowOfLine(document, 4, 80, [innerRange]),
    ).toBe(2);
    expect(
      $CountingEditorWrap.visualRowOfLine(document, 4, 80, [
        outerRange,
        innerRange,
      ]),
    ).toBe(0);
    expect(
      $CountingEditorWrap.visualRowOfLine(document, 4, 80, [innerRange]),
    ).toBe(2);
    expect($CountingEditorWrap.visualRowOfLine(document, 4, 80)).toBe(4);
  });

  test('insertions and deletions realign the tail (head/tail identity trim)', () => {
    const document = new IndexProbeDocument(makeLines(100));
    EditorWrap.Class.totalVisualRows(document, 10);
    document.insertLine(5, 'word '.repeat(9));
    expect(EditorWrap.Class.totalVisualRows(document, 10)).toBe(
      naiveTotal(document, 10),
    );
    document.removeLine(50);
    document.removeLine(0);
    expect(EditorWrap.Class.totalVisualRows(document, 10)).toBe(
      naiveTotal(document, 10),
    );
    const lastLine = document.lineCount - 1;
    const lastFirstRow = EditorWrap.Class.firstVisualRowOfLine(
      document,
      lastLine,
      10,
    );
    expect(
      EditorWrap.Class.lineSegmentAtVisualRow(document, lastFirstRow, 10)
        .lineIndex,
    ).toBe(lastLine);
  });

  test('a width change rebuilds the index for the new width', () => {
    const document = new IndexProbeDocument(makeLines(80));
    const atTen = EditorWrap.Class.totalVisualRows(document, 10);
    const atForty = EditorWrap.Class.totalVisualRows(document, 40);
    expect(atForty).toBe(naiveTotal(document, 40));
    expect(atForty).toBeLessThan(atTen); // wider viewport, fewer rows
    expect(EditorWrap.Class.totalVisualRows(document, 10)).toBe(
      naiveTotal(document, 10),
    ); // back again
  });

  test('past-the-end locate clamps to the last visual row (true-last-row reachability)', () => {
    const document = new IndexProbeDocument(['short', 'word '.repeat(10)]);
    const total = EditorWrap.Class.totalVisualRows(document, 10);
    const lastRowCount = EditorWrap.Class.wrapLine(document.line(1), 10).length;
    expect(
      EditorWrap.Class.lineSegmentAtVisualRow(document, total + 100, 10),
    ).toEqual({
      lineIndex: 1,
      segmentIndex: lastRowCount - 1,
    });
  });

  test('a revision-free document (test double) still answers correctly across mutations', () => {
    // No revision signal → every query resyncs via the identity sweep; answers stay exact.
    const lines = ['alpha beta gamma', 'delta'];
    const document = {
      lineCount: lines.length,
      line: (index: number) => lines[index] ?? '',
    };
    const before = EditorWrap.Class.totalVisualRows(document, 6);
    lines[1] = 'delta epsilon zeta eta theta';
    const after = EditorWrap.Class.totalVisualRows(document, 6);
    expect(after).toBeGreaterThan(before);
  });

  test('folding contributes zero-row hidden lines to the same cumulative index', () => {
    const document = new IndexProbeDocument([
      'function value() {',
      '  const first = 1;',
      '  const second = 2;',
      '}',
      'after();',
    ]);
    const foldedRanges = [
      { startLine: 0, endLine: 3, kind: 'delimiter' as const },
    ];

    expect(EditorWrap.Class.totalVisualRows(document, null, foldedRanges)).toBe(
      2,
    );
    expect(
      EditorWrap.Class.visualRowsFromOffset(
        document,
        0,
        null,
        10,
        foldedRanges,
      ).map((row) => row.lineIndex),
    ).toEqual([0, 4]);
    expect(
      EditorWrap.Class.lineSegmentAtVisualRow(document, 1, null, foldedRanges),
    ).toEqual({ lineIndex: 4, segmentIndex: 0 });
    expect(
      EditorWrap.Class.visualRowOfLine(document, 2, null, foldedRanges),
    ).toBe(0);
    expect(
      EditorWrap.Class.visualRowOfLine(document, 4, null, foldedRanges),
    ).toBe(1);
  });

  test('past-the-end folding clamps to the last line that contributes a row', () => {
    const document = new IndexProbeDocument([
      'before();',
      'function value() {',
      '  const hidden = true;',
      '}',
    ]);
    const foldedRanges = [
      { startLine: 1, endLine: 3, kind: 'delimiter' as const },
    ];

    expect(
      EditorWrap.Class.lineSegmentAtVisualRow(
        document,
        100,
        null,
        foldedRanges,
      ),
    ).toEqual({ lineIndex: 1, segmentIndex: 0 });
  });
});
