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
});

function documentFrom(lines: readonly string[]) {
  return {
    lineCount: lines.length,
    line: (index: number) => lines[index] ?? '',
  };
}
