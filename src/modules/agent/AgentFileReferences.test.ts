import { describe, expect, test } from 'bun:test';
import { AgentFileReferences } from './AgentFileReferences';

const detect = AgentFileReferences.Class.detectInText;
const summarySpan = AgentFileReferences.Class.summarySpan;

describe('AgentFileReferences.detectInText', () => {
  test('finds a workspace-relative path with cell-accurate span', () => {
    const text = 'open src/modules/agent/AgentSession.ts today';
    const found = detect(text);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      reference: 'src/modules/agent/AgentSession.ts',
      line: null,
      column: null,
      startCell: 'open '.length,
      endCell: 'open '.length + 'src/modules/agent/AgentSession.ts'.length,
    });
  });

  test('finds an absolute path', () => {
    const found = detect('wrote /home/user/project/notes.md just now');
    expect(found).toHaveLength(1);
    expect(found[0]?.reference).toBe('/home/user/project/notes.md');
  });

  test('parses a :line suffix (1-based) and keeps the suffix inside the span', () => {
    const found = detect('see src/main.ts:42 for the bug');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ reference: 'src/main.ts', line: 42, column: null });
    expect(found[0]!.endCell - found[0]!.startCell).toBe('src/main.ts:42'.length);
  });

  test('parses a :line:column suffix', () => {
    const found = detect('error at src/main.ts:42:7');
    expect(found[0]).toMatchObject({ reference: 'src/main.ts', line: 42, column: 7 });
  });

  test('trailing sentence punctuation is prose, not path', () => {
    const found = detect('the fix is in src/util/format.ts.');
    expect(found).toHaveLength(1);
    expect(found[0]?.reference).toBe('src/util/format.ts');
    expect(found[0]!.endCell - found[0]!.startCell).toBe('src/util/format.ts'.length);
  });

  test('a path inside quotes or parentheses matches cleanly', () => {
    expect(detect('check "src/a.ts" first')[0]?.reference).toBe('src/a.ts');
    expect(detect('(see src/b.ts:3)')[0]).toMatchObject({ reference: 'src/b.ts', line: 3 });
  });

  test('URLs are not file references', () => {
    expect(detect('read https://example.com/docs/page for context')).toHaveLength(0);
    expect(detect('at http://host/a/b.ts:1 online')).toHaveLength(0);
  });

  test('a lone slash and slash-only tokens are not references', () => {
    expect(detect('a / b')).toHaveLength(0);
    expect(detect('what // is this')).toHaveLength(0);
  });

  test('finds multiple references on one row, in order', () => {
    const found = detect('moved src/a.ts to src/b.ts');
    expect(found.map((reference) => reference.reference)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(found[0]!.startCell).toBeLessThan(found[1]!.startCell);
  });

  test('spans are DISPLAY cells: a wide (CJK) prefix shifts the span by its display width', () => {
    const found = detect('文件 src/a.ts here');
    // 文件 = 2 wide glyphs = 4 cells, + 1 space.
    expect(found[0]?.startCell).toBe(5);
  });

  test('relative dot-paths are detected', () => {
    expect(detect('see ./notes/todo.md now')[0]?.reference).toBe('./notes/todo.md');
    expect(detect('and ../shared/util.ts too')[0]?.reference).toBe('../shared/util.ts');
  });

  test('prose word pairs with a slash are syntactic candidates (the resolver rejects them later)', () => {
    // Deliberate: detection is pure syntax; existence-filtering is the caller's resolver.
    expect(detect('either/or')[0]?.reference).toBe('either/or');
  });
});

describe('AgentFileReferences.summarySpan', () => {
  test('locates the basename of the tool input path in the summary row, carrying the REAL path', () => {
    const rowText = '▸ ⚙ Read  Reading AgentSession.ts';
    const span = summarySpan(rowText, '/project/src/modules/agent/AgentSession.ts');
    expect(span).not.toBeNull();
    expect(span!.reference).toBe('/project/src/modules/agent/AgentSession.ts');
    expect(span!.line).toBeNull();
    // The span covers exactly the basename cells (icons ahead of it are 1 cell each here).
    const cellsBefore = span!.startCell;
    expect(rowText.slice(rowText.length - 'AgentSession.ts'.length)).toBe('AgentSession.ts');
    expect(span!.endCell - cellsBefore).toBe('AgentSession.ts'.length);
  });

  test('null when the basename was clipped out of the row (ellipsis truncation)', () => {
    expect(summarySpan('▸ ⚙ Read  Reading Agent…', '/project/src/AgentSession.ts')).toBeNull();
  });

  test('windows-style separators still yield the basename', () => {
    const span = summarySpan('Editing notes.md', 'C:\\work\\notes.md');
    expect(span?.reference).toBe('C:\\work\\notes.md');
  });
});
