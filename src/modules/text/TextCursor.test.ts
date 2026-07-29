import { expect, test } from 'bun:test';
import { TextCursor } from './TextCursor';

test('selection range normalizes anchor and cursor order', () => {
  const cursor = new TextCursor.Class();
  cursor.set(2, 3);
  cursor.setAnchorHere();
  cursor.set(1, 0);
  expect(cursor.hasSelection).toBe(true);
  const range = cursor.selectionRange();
  expect(range?.start).toEqual({ line: 1, col: 0 });
  expect(range?.end).toEqual({ line: 2, col: 3 });
  cursor.set(2, 3);
  expect(cursor.hasSelection).toBe(false);
  expect(cursor.selectionRange()).toBeNull();
});
