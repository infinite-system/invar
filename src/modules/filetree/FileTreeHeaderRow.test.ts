import { expect, test } from 'bun:test';
import { FileTreeHeaderRow } from './FileTreeHeaderRow';

test('paint and hit testing use the same right-aligned button segments', () => {
  const projection = FileTreeHeaderRow.Class.project({
    width: 12,
    buttons: [
      { action: 'reveal', glyph: 'o', tooltip: 'Reveal open file' },
      { action: 'addFile', glyph: '+', tooltip: 'Add file' },
    ],
    hoveredAction: null,
    palette: {
      dim: '#777777',
      accent: '#ffffff',
      cursorLine: '#333333',
    } as never,
  });

  expect(projection.buttons).toEqual([
    {
      action: 'reveal',
      glyph: 'o',
      tooltip: 'Reveal open file',
      text: '\u00a0o\u00a0',
      startColumn: 6,
      endColumn: 9,
    },
    {
      action: 'addFile',
      glyph: '+',
      tooltip: 'Add file',
      text: '\u00a0+\u00a0',
      startColumn: 9,
      endColumn: 12,
    },
  ]);
  expect(FileTreeHeaderRow.Class.buttonAtColumn(projection, 6)?.action).toBe(
    'reveal',
  );
  expect(FileTreeHeaderRow.Class.buttonAtColumn(projection, 8)?.action).toBe(
    'reveal',
  );
  expect(FileTreeHeaderRow.Class.buttonAtColumn(projection, 9)?.action).toBe(
    'addFile',
  );
  expect(FileTreeHeaderRow.Class.buttonAtColumn(projection, 5)).toBeNull();
  expect(FileTreeHeaderRow.Class.buttonAtColumn(projection, 12)).toBeNull();
});

test('a scrollbar pad shifts the whole button block and its hit area left', () => {
  const projection = FileTreeHeaderRow.Class.project({
    width: 12,
    trailingPaddingCells: 1,
    buttons: [{ action: 'reveal', glyph: 'o', tooltip: 'Reveal open file' }],
    hoveredAction: 'reveal',
    palette: {
      dim: '#777777',
      accent: '#ffffff',
      cursorLine: '#333333',
    } as never,
  });

  expect(projection.buttons[0]).toMatchObject({
    startColumn: 8,
    endColumn: 11,
    text: '\u00a0o\u00a0',
  });
  expect(FileTreeHeaderRow.Class.buttonAtColumn(projection, 10)).toBeDefined();
  expect(FileTreeHeaderRow.Class.buttonAtColumn(projection, 11)).toBeNull();
});
