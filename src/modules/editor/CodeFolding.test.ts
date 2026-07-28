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
    const readsAfterDiscovery = lineReads;
    for (let readNumber = 0; readNumber < 10_000; readNumber++) {
      CodeFolding.Class.rangeAtLine(document, 'plain', readNumber % 4);
    }
    expect(lineReads).toBe(readsAfterDiscovery);
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
