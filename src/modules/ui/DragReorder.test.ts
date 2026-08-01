import { expect, test } from 'bun:test';
import { DragReorder } from './DragReorder';

test('drag reorder delegates only while one identified item is active', () => {
  const moves: Array<[string, number]> = [];
  const drag = new DragReorder.Class((identifier, targetIndex) => {
    moves.push([identifier, targetIndex]);
    return true;
  });

  expect(drag.move(1)).toBe(false);
  drag.begin('database');
  expect(drag.move(2)).toBe(true);
  expect(moves).toEqual([['database', 2]]);
  drag.end();
  expect(drag.move(0)).toBe(false);
});
