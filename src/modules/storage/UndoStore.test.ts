import { expect, test } from 'bun:test';
import { UndoStore, type UndoState } from './UndoStore';

function state(text: string, kind: UndoState['kind'], at: number): UndoState {
  return {
    lines: [text],
    cursor: { line: 0, col: text.length },
    kind,
    at,
  };
}

test('undo and redo exchange the recorded and current states', () => {
  const store = new UndoStore.Class();
  const before = state('', 'insert', 0);
  const after = state('a', 'insert', 500);
  store.record(before, 0);
  expect(store.undo(after)).toEqual(before);
  expect(store.redo(before)).toEqual(after);
});

test('adjacent edits of the same kind coalesce', () => {
  const store = new UndoStore.Class();
  store.record(state('', 'insert', 0), 0);
  store.record(state('a', 'insert', 100), 100);
  expect(store.depth).toBe(1);
});
