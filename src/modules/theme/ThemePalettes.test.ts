import { expect, test } from 'bun:test';
import { ThemePalettes } from './ThemePalettes';

test('truecolor quantization is identity', () => {
  const darkPalette = ThemePalettes.Class.DARK;
  const palette = ThemePalettes.Class.quantizePalette(darkPalette, 'truecolor');
  expect(palette.bg).toBe(darkPalette.bg);
});

test('16-color quantization maps every color into the ANSI-16 set', () => {
  const palette = ThemePalettes.Class.quantizePalette(
    ThemePalettes.Class.DARK,
    '16',
  );
  const ansiColors = new Set([
    '#000000',
    '#800000',
    '#008000',
    '#808000',
    '#000080',
    '#800080',
    '#008080',
    '#c0c0c0',
    '#808080',
    '#ff0000',
    '#00ff00',
    '#ffff00',
    '#0000ff',
    '#ff00ff',
    '#00ffff',
    '#ffffff',
  ]);
  for (const key of Object.keys(palette) as Array<keyof typeof palette>) {
    const value = palette[key];
    if (typeof value === 'string' && value.startsWith('#')) {
      expect(ansiColors.has(value)).toBe(true);
    }
  }
});

test('256 quantization keeps hex shape', () => {
  const palette = ThemePalettes.Class.quantizePalette(
    ThemePalettes.Class.DARK,
    '256',
  );
  expect(palette.accent).toMatch(/^#[0-9a-f]{6}$/);
});

test('inline rewrite decoration has semantic colors in both palettes', () => {
  for (const palette of [ThemePalettes.Class.DARK, ThemePalettes.Class.LIGHT]) {
    expect(palette.inlineRewriteForeground).not.toBe(palette.fg);
    expect(palette.inlineRewriteBackground).not.toBe(palette.bg);
  }
});

test('terminal defaults and ANSI slots are complete theme data', () => {
  const terminalColorKeys = [
    'terminalAnsiBlack',
    'terminalAnsiRed',
    'terminalAnsiGreen',
    'terminalAnsiYellow',
    'terminalAnsiBlue',
    'terminalAnsiMagenta',
    'terminalAnsiCyan',
    'terminalAnsiWhite',
    'terminalAnsiBrightBlack',
    'terminalAnsiBrightRed',
    'terminalAnsiBrightGreen',
    'terminalAnsiBrightYellow',
    'terminalAnsiBrightBlue',
    'terminalAnsiBrightMagenta',
    'terminalAnsiBrightCyan',
    'terminalAnsiBrightWhite',
  ] as const;
  expect(terminalColorKeys.map((key) => ThemePalettes.Class.DARK[key])).toEqual(
    [
      '#000000',
      '#cd3131',
      '#0dbc79',
      '#e5e510',
      '#2472c8',
      '#bc3fbc',
      '#11a8cd',
      '#e5e5e5',
      '#666666',
      '#f14c4c',
      '#23d18b',
      '#f5f543',
      '#3b8eea',
      '#d670d6',
      '#29b8db',
      '#e5e5e5',
    ],
  );
  expect(
    terminalColorKeys.map((key) => ThemePalettes.Class.LIGHT[key]),
  ).toEqual([
    '#000000',
    '#cd3131',
    '#107c10',
    '#949800',
    '#0451a5',
    '#bc05bc',
    '#0598bc',
    '#555555',
    '#666666',
    '#cd3131',
    '#14ce14',
    '#b5ba00',
    '#0451a5',
    '#bc05bc',
    '#0598bc',
    '#a5a5a5',
  ]);
  expect(ThemePalettes.Class.DARK.terminalForeground).toBe(
    ThemePalettes.Class.DARK.fg,
  );
  expect(ThemePalettes.Class.DARK.terminalBackground).toBe(
    ThemePalettes.Class.DARK.panel,
  );
  expect(ThemePalettes.Class.LIGHT.terminalForeground).toBe(
    ThemePalettes.Class.LIGHT.fg,
  );
  expect(ThemePalettes.Class.LIGHT.terminalBackground).toBe(
    ThemePalettes.Class.LIGHT.panel,
  );
});
