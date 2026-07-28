import { describe, expect, test } from 'bun:test';
import { CodeFolding } from './CodeFolding';

describe('CodeFolding', () => {
  test('finds nested TypeScript brace and bracket blocks from syntax roles', () => {
    const document = documentFrom([
      'const object = {',
      '  values: [',
      '    1,',
      '  ],',
      '};',
    ]);

    expect(CodeFolding.Class.ranges(document, 'typescript')).toEqual([
      { startLine: 0, endLine: 4, kind: 'delimiter' },
      { startLine: 1, endLine: 3, kind: 'delimiter' },
    ]);
  });

  test('ignores delimiter-shaped text in strings and comments', () => {
    const document = documentFrom([
      'const text = "{";',
      '// [ not structure',
      'const object = {',
      '  value: 1,',
      '};',
    ]);

    expect(CodeFolding.Class.ranges(document, 'typescript')).toEqual([
      { startLine: 2, endLine: 4, kind: 'delimiter' },
    ]);
  });

  test('finds indentation runs when no delimiters exist', () => {
    const document = documentFrom(['heading', '  first', '  second', 'tail']);

    expect(CodeFolding.Class.ranges(document, 'plain')).toEqual([
      { startLine: 0, endLine: 2, kind: 'indentation' },
    ]);
  });

  test('recomputes once per document revision', () => {
    const lines = ['const value = {', '  answer: 42,', '};'];
    const revision = { value: 0 };
    let lineReads = 0;
    const document = {
      lineCount: lines.length,
      revision,
      line(index: number): string {
        lineReads++;
        return lines[index] ?? '';
      },
    };

    CodeFolding.Class.ranges(document, 'typescript');
    const readsAfterFirstComputation = lineReads;
    CodeFolding.Class.ranges(document, 'typescript');
    expect(lineReads).toBe(readsAfterFirstComputation);

    lines[1] = '  answer: [42],';
    revision.value++;
    CodeFolding.Class.ranges(document, 'typescript');
    expect(lineReads).toBeGreaterThan(readsAfterFirstComputation);
  });

  test('indexes fold lookup by line without rescanning an unchanged document', () => {
    const lines = ['heading', '  first', '  second', 'tail'];
    const revision = { value: 0 };
    let lineReads = 0;
    const document = {
      lineCount: lines.length,
      revision,
      line(index: number): string {
        lineReads++;
        return lines[index] ?? '';
      },
    };

    expect(CodeFolding.Class.rangeAtLine(document, 'plain', 0)).toEqual({
      startLine: 0,
      endLine: 2,
      kind: 'indentation',
    });
    for (let lineIndex = 1; lineIndex < document.lineCount; lineIndex++) {
      CodeFolding.Class.rangeAtLine(document, 'plain', lineIndex);
    }
    const readsAfterDiscovery = lineReads;
    for (let readNumber = 0; readNumber < 10_000; readNumber++) {
      CodeFolding.Class.rangeAtLine(document, 'plain', readNumber % 4);
    }
    expect(lineReads).toBe(readsAfterDiscovery);
  });

  test('flat gutter discovery reads only the observed lines at every document size', () => {
    const readsByLineCount = [2_000, 1_000_000].map((lineCount) => {
      let lineReads = 0;
      const document = {
        lineCount,
        revision: { value: 1 },
        line(lineIndex: number): string {
          lineReads++;
          return lineIndex % 2 === 0
            ? `export const flatValue${lineIndex} = ${lineIndex} as const;`
            : `export type FlatAlias${lineIndex} = string | null;`;
        },
      };

      for (let lineIndex = 0; lineIndex < 15; lineIndex++) {
        expect(
          CodeFolding.Class.startsAtLine(document, 'typescript', lineIndex),
        ).toBe(false);
      }
      return lineReads;
    });

    expect(readsByLineCount).toEqual([30, 30]);
  });

  test('non-structural typing preserves the fold snapshot with identical work at scale', () => {
    const readsByLineCount = [2_000, 100_000].map((lineCount) => {
      const document = new EditableFoldDocument(lineCount);
      const ranges = CodeFolding.Class.ranges(document, 'typescript');
      document.lineReads = 0;
      document.editLine(
        Math.floor(lineCount / 2) + 1,
        '  const renamedValue = 2;',
      );
      expect(CodeFolding.Class.ranges(document, 'typescript')).toBe(ranges);
      return document.lineReads;
    });

    expect(readsByLineCount).toEqual([0, 0]);
  });

  test('fold-marker lookup reuses the non-structural fold snapshot', () => {
    const readsByLineCount = [554_490, 970_356].map((lineCount) => {
      const document = new EditableFoldDocument(lineCount);
      const range = CodeFolding.Class.rangeAtLine(document, 'typescript', 0);
      document.editLine(
        Math.floor(lineCount / 2) + 1,
        '  const renamedValue = 2;',
      );
      document.lineReads = 0;

      expect(CodeFolding.Class.startsAtLine(document, 'typescript', 0)).toBe(
        true,
      );
      expect(CodeFolding.Class.rangeAtLine(document, 'typescript', 0)).toBe(
        range,
      );
      return document.lineReads;
    });

    expect(readsByLineCount).toEqual([0, 0]);
  });

  test('whole-document discovery preserves an already published local range', () => {
    const document = documentFrom(['const object = {', '  value: 1,', '};']);
    const localRange = CodeFolding.Class.rangeAtLine(document, 'typescript', 0);
    if (localRange === null)
      throw new Error('Expected a locally discovered range');

    expect(CodeFolding.Class.ranges(document, 'typescript')[0]).toBe(
      localRange,
    );
  });

  test('a structural edit is the positive control that recomputes folds', () => {
    const document = new EditableFoldDocument(2_000);
    CodeFolding.Class.ranges(document, 'typescript');
    document.lineReads = 0;

    document.editLine(1_001, '  const renamedValue = {');
    CodeFolding.Class.ranges(document, 'typescript');

    expect(document.lineReads).toBeGreaterThan(document.lineCount);
  });

  test('local fold-marker discovery agrees with the global snapshot', () => {
    const document = documentFrom([
      'const object = {',
      '  value: 1,',
      '};',
      'heading',
      '  child',
      'tail',
    ]);
    const starts = new Set(
      CodeFolding.Class.ranges(document, 'typescript').map(
        (range) => range.startLine,
      ),
    );

    for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
      expect(
        CodeFolding.Class.startsAtLine(document, 'typescript', lineIndex),
      ).toBe(starts.has(lineIndex));
    }
  });
});

function documentFrom(lines: readonly string[]) {
  return {
    lineCount: lines.length,
    line: (index: number) => lines[index] ?? '',
  };
}

class EditableFoldDocument {
  lineReads = 0;
  lastLineChange: {
    deletedLineCount: number;
    deletedLines: readonly string[];
    insertedLineCount: number;
    insertedLines: readonly string[];
    revision: number;
  } | null = null;
  readonly revision = { value: 0 };
  protected readonly lines: string[];

  constructor(lineCount: number) {
    this.lines = Array.from({ length: lineCount }, (_unusedValue, lineIndex) =>
      lineIndex % 8 === 0
        ? 'const object = {'
        : lineIndex % 8 === 7
          ? '};'
          : `  const value${lineIndex} = 1;`,
    );
  }

  get lineCount(): number {
    return this.lines.length;
  }

  line(lineIndex: number): string {
    this.lineReads++;
    return this.lines[lineIndex] ?? '';
  }

  editLine(lineIndex: number, insertedLine: string): void {
    const deletedLine = this.lines[lineIndex] ?? '';
    this.lines[lineIndex] = insertedLine;
    this.revision.value++;
    this.lastLineChange = {
      deletedLineCount: 1,
      deletedLines: [deletedLine],
      insertedLineCount: 1,
      insertedLines: [insertedLine],
      revision: this.revision.value,
    };
  }
}
