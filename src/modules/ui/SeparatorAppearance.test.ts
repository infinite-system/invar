import { expect, test } from 'bun:test';
import { RGBA, type OptimizedBuffer } from '@opentui/core';
import { SeparatorAppearance } from './SeparatorAppearance';

function recordingBuffer(): {
  buffer: OptimizedBuffer;
  fillRectangles: unknown[][];
  paintedCells: unknown[][];
} {
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
  return { buffer, fillRectangles, paintedCells };
}

test('separator appearance uses one cross-axis cell for both orientations', () => {
  expect(SeparatorAppearance.Class.CROSS_AXIS_CELL_COUNT).toBe(1);
});

test('the centered-line mark paints a slim glyph on BOTH axes and never fills', () => {
  const color = RGBA.fromHex('#abcdef');
  const vertical = recordingBuffer();

  SeparatorAppearance.Class.paint({
    buffer: vertical.buffer,
    orientation: 'vertical',
    rectangle: { x: 2, y: 3, width: 1, height: 4 },
    color,
    mark: 'centeredLine',
  });
  expect(vertical.fillRectangles).toEqual([]);
  expect(vertical.paintedCells.map((cell) => cell.slice(0, 4))).toEqual([
    [2, 3, '┃', color],
    [2, 4, '┃', color],
    [2, 5, '┃', color],
    [2, 6, '┃', color],
  ]);

  const horizontal = recordingBuffer();
  SeparatorAppearance.Class.paint({
    buffer: horizontal.buffer,
    orientation: 'horizontal',
    rectangle: { x: 5, y: 7, width: 3, height: 1 },
    color,
    mark: 'centeredLine',
  });
  expect(horizontal.fillRectangles).toEqual([]);
  expect(horizontal.paintedCells.map((cell) => cell.slice(0, 4))).toEqual([
    [5, 7, '━', color],
    [6, 7, '━', color],
    [7, 7, '━', color],
  ]);
});

test('the edge-anchored mark keeps the vertical fill and the horizontal half block', () => {
  const color = RGBA.fromHex('#abcdef');
  const vertical = recordingBuffer();

  SeparatorAppearance.Class.paint({
    buffer: vertical.buffer,
    orientation: 'vertical',
    rectangle: { x: 2, y: 3, width: 1, height: 4 },
    color,
    mark: 'bottomAnchoredHalfBlock',
  });
  expect(vertical.fillRectangles).toEqual([[2, 3, 1, 4, color]]);
  expect(vertical.paintedCells).toEqual([]);

  const horizontal = recordingBuffer();
  SeparatorAppearance.Class.paint({
    buffer: horizontal.buffer,
    orientation: 'horizontal',
    rectangle: { x: 5, y: 7, width: 3, height: 1 },
    color,
    mark: 'bottomAnchoredHalfBlock',
  });
  expect(horizontal.paintedCells.map((cell) => cell.slice(0, 4))).toEqual([
    [5, 7, '▄', color],
    [6, 7, '▄', color],
    [7, 7, '▄', color],
  ]);
});

test('a leading paint pad skips cells at the start of the long axis only', () => {
  const color = RGBA.fromHex('#abcdef');
  const horizontal = recordingBuffer();

  SeparatorAppearance.Class.paint({
    buffer: horizontal.buffer,
    orientation: 'horizontal',
    rectangle: { x: 5, y: 7, width: 3, height: 1 },
    color,
    mark: 'centeredLine',
    leadingPaintPadCells: 1,
  });
  expect(horizontal.paintedCells.map((cell) => cell.slice(0, 4))).toEqual([
    [6, 7, '━', color],
    [7, 7, '━', color],
  ]);

  const vertical = recordingBuffer();
  SeparatorAppearance.Class.paint({
    buffer: vertical.buffer,
    orientation: 'vertical',
    rectangle: { x: 2, y: 3, width: 1, height: 3 },
    color,
    mark: 'centeredLine',
    leadingPaintPadCells: 1,
  });
  expect(vertical.paintedCells.map((cell) => cell.slice(0, 4))).toEqual([
    [2, 4, '┃', color],
    [2, 5, '┃', color],
  ]);
});

test('the two marks stay distinct glyphs on each axis', () => {
  expect(SeparatorAppearance.Class.glyphFor('horizontal', 'centeredLine')).toBe(
    '━',
  );
  expect(SeparatorAppearance.Class.glyphFor('vertical', 'centeredLine')).toBe(
    '┃',
  );
  expect(
    SeparatorAppearance.Class.glyphFor('horizontal', 'bottomAnchoredHalfBlock'),
  ).toBe('▄');
  expect(
    SeparatorAppearance.Class.glyphFor('vertical', 'bottomAnchoredHalfBlock'),
  ).toBe('▄');
});
