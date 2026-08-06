import { describe, expect, test } from 'bun:test';
import { WorkspaceSearchResultTree } from './WorkspaceSearchResultTree';
import type { WorkspaceSearchResult } from './WorkspaceSearchBackend';

const result = (relativePath: string, line: number): WorkspaceSearchResult => ({
  relativePath,
  absolutePath: `/workspace/${relativePath}`,
  line,
  startColumn: 0,
  endColumn: 3,
  startUtf16Offset: line * 10,
  endUtf16Offset: line * 10 + 3,
  matchedText: 'old',
  lineText: 'old value',
  replacementText: 'new',
});

describe('WorkspaceSearchResultTree', () => {
  test('groups results, preserves selection, collapses, and dismisses', () => {
    const tree = new WorkspaceSearchResultTree.Class();
    const first = result('src/app.ts', 3);
    const second = result('src/app.ts', 8);
    const third = result('src/model.ts', 2);
    tree.updateResults([first, second, third], false, true);

    expect(tree.rows.map((row) => row.kind)).toEqual([
      'file',
      'match',
      'replacementPreview',
      'match',
      'replacementPreview',
      'file',
      'match',
      'replacementPreview',
    ]);
    tree.setSelection(3);
    tree.dismiss(second);
    expect(tree.rowIsDismissed(tree.rows[3]!)).toBe(true);
    expect(tree.selectedCount).toBe(2);
    expect(tree.selectedIndex.value).toBe(3);

    tree.toggleFile('src/app.ts');
    expect(tree.rows.map((row) => row.kind)).toEqual([
      'file',
      'file',
      'match',
      'replacementPreview',
    ]);
    tree.toggleFile('src/app.ts');
    expect(tree.rows).toHaveLength(8);
  });

  test('adds replacement previews only when the replacement field has text', () => {
    const tree = new WorkspaceSearchResultTree.Class();
    tree.updateResults([result('src/app.ts', 3)]);
    expect(tree.rows.map((row) => row.kind)).toEqual(['file', 'match']);

    tree.updateResults([result('src/app.ts', 3)], false, true);
    expect(tree.rows.map((row) => row.kind)).toEqual([
      'file',
      'match',
      'replacementPreview',
    ]);
  });

  test('keeps scrolling inside the visible result extent', () => {
    const tree = new WorkspaceSearchResultTree.Class();
    tree.updateResults(
      Array.from({ length: 10 }, (_, line) => result('a.ts', line)),
    );
    tree.setViewportSize(20, 4);
    tree.setSelection(tree.rows.length - 1);
    expect(tree.scrollTop.value).toBe(tree.rows.length - 4);
    tree.scrollBy(100);
    expect(tree.scrollTop.value).toBe(tree.rows.length - 4);
    tree.scrollBy(-100);
    expect(tree.scrollTop.value).toBe(0);
  });

  test('wraps the final limit notice to the live viewport width', () => {
    const tree = new WorkspaceSearchResultTree.Class();
    tree.setViewportSize(24, 4);
    tree.updateResults([result('a.ts', 0)], true);
    const noticeRows = tree.rows.filter((row) => row.kind === 'limitNotice');
    expect(noticeRows.length).toBeGreaterThan(1);
    expect(noticeRows.map((row) => row.noticeText).join('')).toBe(
      WorkspaceSearchResultTree.Class.LIMIT_NOTICE_TEXT,
    );
    expect(noticeRows.every((row) => (row.noticeText?.length ?? 0) <= 22)).toBe(
      true,
    );
  });
});
