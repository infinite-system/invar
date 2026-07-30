import { expect, test } from 'bun:test';
import { HierarchicalRowIndent } from './HierarchicalRowIndent';

test('hierarchical row indentation advances exactly one cell per level', () => {
  expect(
    Array.from({ length: 5 }, (_unusedValue, depth) =>
      HierarchicalRowIndent.Class.text(depth),
    ),
  ).toEqual(['', ' ', '  ', '   ', '    ']);
  expect(HierarchicalRowIndent.Class.width(-1)).toBe(0);
});
