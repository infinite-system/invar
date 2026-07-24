// The terminal ANSI-16 role set: index→role mapping, spec values, and the quantization tiers.
// The named ANSI colors are APPEARANCE (themed, spec §10); this file proves the roles ride the
// quantize ladder correctly at every rung and never quantize into invisibility against the
// terminal background (`panel`) at the tiers where the theme's own values are emitted.
import { test, expect } from 'bun:test';
import { DARK, LIGHT, TERMINAL_ANSI_ROLE_NAMES, ThemePalettes, type Palette } from '../ThemePalettes';

const STANDARD_ANSI_16_HEX = [
  '#000000', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#c0c0c0',
  '#808080', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff',
];

test('terminalAnsiHex maps every ANSI index 0-15 to its role in standard order', () => {
  for (const palette of [DARK, LIGHT]) {
    for (let ansiIndex = 0; ansiIndex < 16; ansiIndex++) {
      const roleName = TERMINAL_ANSI_ROLE_NAMES[ansiIndex]!;
      expect(ThemePalettes.Class.terminalAnsiHex(palette, ansiIndex)).toBe(palette[roleName] as string);
    }
  }
  // Spot-check the order is the ANSI order, not alphabetical.
  expect(ThemePalettes.Class.terminalAnsiHex(DARK, 1)).toBe(DARK.terminalAnsiRed);
  expect(ThemePalettes.Class.terminalAnsiHex(DARK, 8)).toBe(DARK.terminalAnsiBrightBlack);
  expect(ThemePalettes.Class.terminalAnsiHex(DARK, 15)).toBe(DARK.terminalAnsiBrightWhite);
});

test('terminalAnsiHex falls back to the white role (terminal body text) for an out-of-range index', () => {
  expect(ThemePalettes.Class.terminalAnsiHex(DARK, 16)).toBe(DARK.terminalAnsiWhite);
  expect(ThemePalettes.Class.terminalAnsiHex(DARK, -1)).toBe(DARK.terminalAnsiWhite);
});

test('dark terminal ANSI roles carry the Tokyo Night spec values at truecolor', () => {
  expect(DARK.terminalAnsiBlack).toBe('#363b54'); // the VISIBLE spec black, not #000000
  expect(DARK.terminalAnsiRed).toBe('#f7768e');
  expect(DARK.terminalAnsiGreen).toBe('#73daca');
  expect(DARK.terminalAnsiYellow).toBe('#e0af68');
  expect(DARK.terminalAnsiBlue).toBe('#7aa2f7');
  expect(DARK.terminalAnsiMagenta).toBe('#bb9af7');
  expect(DARK.terminalAnsiCyan).toBe('#7dcfff');
  expect(DARK.terminalAnsiWhite).toBe('#787c99'); // == spec terminal.foreground
  expect(DARK.terminalAnsiBrightBlack).toBe(DARK.terminalAnsiBlack);
  expect(DARK.terminalAnsiBrightWhite).toBe('#acb0d0');
});

test('truecolor: no terminal ANSI role is invisible against the terminal background (both palettes)', () => {
  for (const palette of [DARK, LIGHT]) {
    for (const roleName of TERMINAL_ANSI_ROLE_NAMES) {
      expect(palette[roleName]).not.toBe(palette.panel); // panel IS the terminal background
      expect(palette[roleName]).not.toBe(palette.bg);
    }
  }
});

test('256 tier: every terminal ANSI role quantizes to a distinct-from-background cube color (both palettes)', () => {
  for (const palette of [DARK, LIGHT]) {
    const quantized: Palette = ThemePalettes.Class.quantizePalette(palette, '256');
    for (const roleName of TERMINAL_ANSI_ROLE_NAMES) {
      expect(quantized[roleName] as string).toMatch(/^#[0-9a-f]{6}$/);
      // The collision check: a role that lands ON the quantized terminal background is invisible.
      expect(quantized[roleName]).not.toBe(quantized.panel);
    }
  }
});

test('16 tier: each terminal ANSI role pins to its OWN standard ANSI slot (index identity, not nearest-RGB)', () => {
  // Nearest-RGB would collapse the mid-brightness Tokyo pastels (red/green/yellow/blue/magenta/cyan)
  // into one silver #c0c0c0 — a monochrome terminal. Pinning by index keeps every slot distinct and
  // matches what a real 16-color terminal renders for SGR 0-15.
  for (const palette of [DARK, LIGHT]) {
    const quantized = ThemePalettes.Class.quantizePalette(palette, '16');
    for (let ansiIndex = 0; ansiIndex < 16; ansiIndex++) {
      expect(quantized[TERMINAL_ANSI_ROLE_NAMES[ansiIndex]!] as string).toBe(STANDARD_ANSI_16_HEX[ansiIndex]!);
    }
  }
});

test('16 tier: the chromatic slots stay pairwise distinct and visible on the dark terminal background', () => {
  const quantized = ThemePalettes.Class.quantizePalette(DARK, '16');
  const chromaticRoleNames = TERMINAL_ANSI_ROLE_NAMES.slice(1, 8); // red..white
  const seenColors = new Set<string>();
  for (const roleName of chromaticRoleNames) {
    const color = quantized[roleName] as string;
    expect(color).not.toBe(quantized.panel); // dark panel quantizes to #000000 — all chromatics differ
    seenColors.add(color);
  }
  expect(seenColors.size).toBe(chromaticRoleNames.length);
});
