import { fg } from '@opentui/core';
import { expect, test } from 'bun:test';
import type { Palette } from '../theme/ThemePalettes';
import { ThemeIcons } from '../theme/ThemeIcons';
import { PanelHeading } from './PanelHeading';

const palette = {
  accent: '#00ffff',
  fg: '#eeeeee',
  dim: '#777777',
  error: '#ff0000',
  selection: '#333333',
  cursorLine: '#111111',
} as Palette;

function attributesAtColumn(
  projection: ReturnType<typeof PanelHeading.Class.project>,
  column: number,
): string {
  let chunkStartColumn = 0;
  for (const chunk of projection.text.chunks) {
    const chunkEndColumn = chunkStartColumn + chunk.text.length;
    if (column >= chunkStartColumn && column < chunkEndColumn) {
      return JSON.stringify({
        foreground: chunk.fg ? [...chunk.fg.buffer] : null,
        background: chunk.bg ? [...chunk.bg.buffer] : null,
        attributes: chunk.attributes,
      });
    }
    chunkStartColumn = chunkEndColumn;
  }
  throw new Error(`No projected chunk at column ${column}`);
}

test('heading projection keeps add expand and close paint and hit geometry identical', () => {
  const projection = PanelHeading.Class.project({
    width: 32,
    title: 'Terminal 2',
    icon: '>',
    focused: true,
    expanded: false,
    hoveredAction: null,
    glyphVocabulary: ThemeIcons.Class.interfaceGlyphVocabularyFor('ascii'),
    palette,
  });

  const renderedText = projection.text.chunks
    .map((chunk) => chunk.text)
    .join('');
  expect(renderedText).toContain('Terminal 2');
  expect(renderedText).toContain('EXPAND');
  expect(projection.controls.map((control) => control.action)).toEqual([
    'add',
    'expand',
    'close',
  ]);
  for (const control of projection.controls) {
    expect(
      PanelHeading.Class.controlAtColumn(projection, control.startColumn),
    ).toBe(control.action);
  }
});

test('expanded heading replaces the toggle label without moving close from the right edge', () => {
  const projection = PanelHeading.Class.project({
    width: 32,
    title: 'Agent',
    focused: false,
    expanded: true,
    hoveredAction: null,
    glyphVocabulary: ThemeIcons.Class.interfaceGlyphVocabularyFor('ascii'),
    palette,
  });
  const close = projection.controls.find(
    (control) => control.action === 'close',
  );

  expect(projection.text.chunks.map((chunk) => chunk.text).join('')).toContain(
    'RESTORE',
  );
  expect(close?.endColumn).toBe(32);
});

test('each hovered control reuses the cursor-line highlight while siblings keep their paint', () => {
  const restingProjection = PanelHeading.Class.project({
    width: 32,
    title: 'Terminal',
    focused: true,
    expanded: false,
    hoveredAction: null,
    glyphVocabulary: ThemeIcons.Class.interfaceGlyphVocabularyFor('ascii'),
    palette,
  });

  for (const hoveredAction of ['add', 'expand', 'close'] as const) {
    const hoveredProjection = PanelHeading.Class.project({
      width: 32,
      title: 'Terminal',
      focused: true,
      expanded: false,
      hoveredAction,
      glyphVocabulary: ThemeIcons.Class.interfaceGlyphVocabularyFor('ascii'),
      palette,
    });
    const hoveredControlIndex = hoveredProjection.controls.findIndex(
      (control) => control.action === hoveredAction,
    );
    const hoveredControl = hoveredProjection.controls[hoveredControlIndex]!;
    expect(
      attributesAtColumn(hoveredProjection, hoveredControl.startColumn),
    ).not.toEqual(
      attributesAtColumn(restingProjection, hoveredControl.startColumn),
    );
    const siblingControlIndex = (hoveredControlIndex + 1) % 3;
    const siblingControl = hoveredProjection.controls[siblingControlIndex]!;
    expect(
      attributesAtColumn(hoveredProjection, siblingControl.startColumn),
    ).toEqual(
      attributesAtColumn(restingProjection, siblingControl.startColumn),
    );
  }
});

test('close uses the ordinary foreground instead of the error color', () => {
  const projection = PanelHeading.Class.project({
    width: 32,
    title: 'Terminal',
    focused: true,
    expanded: false,
    hoveredAction: null,
    glyphVocabulary: ThemeIcons.Class.interfaceGlyphVocabularyFor('ascii'),
    palette,
  });

  const closeChunk = projection.text.chunks.at(-1);
  expect(closeChunk?.fg).toEqual(fg(palette.fg)(' X ').fg);
  expect(closeChunk?.fg).not.toEqual(fg(palette.error)(' X ').fg);
});
