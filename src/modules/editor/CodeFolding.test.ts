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
});

function documentFrom(lines: readonly string[]) {
  return {
    lineCount: lines.length,
    line: (index: number) => lines[index] ?? '',
  };
}
