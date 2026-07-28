import { expect, test } from 'bun:test';
import { UndoStore, type EditKind } from './UndoStore';

function recordEdit(
  store: UndoStore.Instance,
  beforeText: string,
  afterText: string,
  kind: EditKind,
  at: number,
): void {
  store.begin(
    {
      at,
      beforeCursor: { line: 0, col: beforeText.length },
      kind,
    },
    at,
  );
  store.recordChange({
    deletedLines: [beforeText],
    insertedLines: [afterText],
    startLineIndex: 0,
  });
}

test('undo and redo exchange one localized delta group', () => {
  const store = new UndoStore.Class();
  recordEdit(store, '', 'a', 'insert', 0);
  const target = store.undo({ line: 0, col: 1 });
  expect(target?.beforeCursor).toEqual({ line: 0, col: 0 });
  expect(target?.changes).toEqual([
    {
      deletedLines: [''],
      insertedLines: ['a'],
      startLineIndex: 0,
    },
  ]);
  expect(store.redo()).toBe(target);
  expect(target?.afterCursor).toEqual({ line: 0, col: 1 });
});

test('adjacent edits of the same kind coalesce their deltas', () => {
  const store = new UndoStore.Class();
  recordEdit(store, '', 'a', 'insert', 0);
  recordEdit(store, 'a', 'ab', 'insert', 100);
  expect(store.depth).toBe(1);
  expect(store.undo({ line: 0, col: 2 })?.changes).toHaveLength(2);
});

test('a begun no-op does not pollute history', () => {
  const store = new UndoStore.Class();
  store.begin(
    {
      at: 0,
      beforeCursor: { line: 0, col: 0 },
      kind: 'delete',
    },
    0,
  );
  expect(store.depth).toBe(0);
  expect(store.undo({ line: 0, col: 0 })).toBeNull();
});
