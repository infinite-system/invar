import { expect, test } from 'bun:test';
import { TextSelectionGeometry } from './TextSelectionGeometry';

test('selection points normalize from earlier to later', () => {
  expect(
    TextSelectionGeometry.Class.orderPoints(
      { line: 3, column: 2 },
      { line: 1, column: 4 },
    ),
  ).toEqual([
    { line: 1, column: 4 },
    { line: 3, column: 2 },
  ]);
});
