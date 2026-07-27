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
