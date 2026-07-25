import { expect, test } from 'bun:test';
import type { Palette } from '../theme/ThemePalettes';
import { PanelHeading } from './PanelHeading';

const palette = {
  accent: '#00ffff',
  dim: '#777777',
  error: '#ff0000',
  selection: '#333333',
} as Palette;

test('heading projection keeps add expand and close paint and hit geometry identical', () => {
  const projection = PanelHeading.Class.project({
    width: 32,
    title: 'Terminal 2',
    icon: '>',
    focused: true,
    expanded: false,
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
