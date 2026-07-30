import { expect, test } from 'bun:test';
import { RGBA, type OptimizedBuffer } from '@opentui/core';
import { SeparatorAppearance } from './SeparatorAppearance';

test('separator appearance uses one cross-axis cell for both orientations', () => {
  expect(SeparatorAppearance.Class.CROSS_AXIS_CELL_COUNT).toBe(1);
});

test('vertical separators fill cells while horizontal separators paint lower halves', () => {
  const fillRectangles: unknown[][] = [];
  const paintedCells: unknown[][] = [];
  const buffer = {
    fillRect: (...argumentsList: unknown[]) => {
      fillRectangles.push(argumentsList);
    },
    setCellWithAlphaBlending: (...argumentsList: unknown[]) => {
      paintedCells.push(argumentsList);
    },
  } as unknown as OptimizedBuffer;
  const color = RGBA.fromHex('#abcdef');

  SeparatorAppearance.Class.paint(
    buffer,
    'vertical',
    { x: 2, y: 3, width: 1, height: 4 },
    color,
  );
  expect(fillRectangles).toEqual([[2, 3, 1, 4, color]]);
  expect(paintedCells).toEqual([]);

  SeparatorAppearance.Class.paint(
    buffer,
    'horizontal',
    { x: 5, y: 7, width: 3, height: 1 },
    color,
  );
  expect(paintedCells.map((cell) => cell.slice(0, 4))).toEqual([
    [5, 7, '▄', color],
    [6, 7, '▄', color],
    [7, 7, '▄', color],
  ]);
});
