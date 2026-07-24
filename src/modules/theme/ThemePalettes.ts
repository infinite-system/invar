// Color palettes as semantic tokens, with truecolor → 256 → 16 down-quantization.
// invariant: Appearance is data with a capability fallback (project.invariants.md)
import { Static } from 'ivue/extras';
import type { ColorDepth } from './TerminalCapabilities';

export interface Palette {
  name: string;
  bg: string;
  panel: string;
  statusBg: string;
  border: string;
  borderActive: string;
  fg: string;
  dim: string;
  accent: string;
  selection: string;
  /** A softer blue selection background for MULTI-selected rows (git range-select) — reads as "selected"
   *  and keeps the row text legible, distinct from the subtle grey hover/cursor-line. */
  selectionMuted: string;
  cursorLine: string;
  /** Indent-guide bar foreground — FAINT but visible on `bg` (VS Code's editorIndentGuide role).
   *  Deliberately its own role: `border` sits BELOW the editor bg in Tokyo Night (near-invisible as a
   *  glyph colour) and `dim`/`comment` are secondary-TEXT weights, too loud for a structural guide. */
  indentGuide: string;
  added: string;
  modified: string;
  deleted: string;
  /** Diff ROW backgrounds — subtle, theme-fitting fills (distinct from the bright added/modified/deleted
   *  accents, which stay the gutter-marker foreground). Bright accents as row fills read as harsh neon
   *  on a near-black editor; these are muted so the code text on top stays legible. */
  diffAddedBg: string;
  diffModifiedBg: string;
  diffDeletedBg: string;
  // syntax roles
  keyword: string;
  string: string;
  number: string;
  comment: string;
  func: string;
  type: string;
  variable: string;
  operator: string;
  // diagnostics
  error: string;
  warning: string;
  info: string;
  /** Terminal ANSI-16 roles (spec §10): what a child process gets when it asks for SGR color 0–15.
   *  The 16 NAMED colors are APPEARANCE — themed here, their single home — while xterm-256 indices
   *  16–255 and truecolor SGR are DATA the child computed and pass through the renderer untouched.
   *  Order (black→white, then brights) mirrors the ANSI index; `TERMINAL_ANSI_ROLE_NAMES` below is
   *  the index→role mapping consumers use. */
  terminalAnsiBlack: string;
  terminalAnsiRed: string;
  terminalAnsiGreen: string;
  terminalAnsiYellow: string;
  terminalAnsiBlue: string;
  terminalAnsiMagenta: string;
  terminalAnsiCyan: string;
  terminalAnsiWhite: string;
  terminalAnsiBrightBlack: string;
  terminalAnsiBrightRed: string;
  terminalAnsiBrightGreen: string;
  terminalAnsiBrightYellow: string;
  terminalAnsiBrightBlue: string;
  terminalAnsiBrightMagenta: string;
  terminalAnsiBrightCyan: string;
  terminalAnsiBrightWhite: string;
}

/** ANSI palette index (0–15) → Palette role, in standard order: normals 0–7, brights 8–15. */
export const TERMINAL_ANSI_ROLE_NAMES = [
  'terminalAnsiBlack', 'terminalAnsiRed', 'terminalAnsiGreen', 'terminalAnsiYellow',
  'terminalAnsiBlue', 'terminalAnsiMagenta', 'terminalAnsiCyan', 'terminalAnsiWhite',
  'terminalAnsiBrightBlack', 'terminalAnsiBrightRed', 'terminalAnsiBrightGreen', 'terminalAnsiBrightYellow',
  'terminalAnsiBrightBlue', 'terminalAnsiBrightMagenta', 'terminalAnsiBrightCyan', 'terminalAnsiBrightWhite',
] as const satisfies ReadonlyArray<keyof Palette>;

// Tokyo Night — accurate spec values (the canonical dark theme). Low contrast between adjacent
// surfaces (bg/panel/border are all near-black blues that differ only slightly), hierarchy carried by
// text BRIGHTNESS (fg #A9B1D6 primary, dim #787C99 secondary) rather than background change, vivid
// colour reserved for syntax/diagnostics/active states.
//
// Translucent spec tokens are blended to an opaque equivalent over bg #1A1B26 (the Palette type is
// opaque 6-digit hex, and the quantize ladder reads only rgb): selection #515C7E@0x4D -> #2b2f41,
// selectionMuted from the blue search-match #3D59A1@0x66 -> #283457 (reads as a selected range,
// distinct from the grey hover/cursor line).
//
// Spec roles Invar's Palette type does NOT carry (left unmapped by design — no type restructuring):
// the syntax sub-roles parameter/property/tag/attribute, bracket-pair rotation, and separate
// surfaceRaised/input backgrounds. The terminal ANSI-16 set (spec §10) IS carried — the
// `terminalAnsi*` roles below — since it is appearance; the terminal's default bg rides `panel`
// (spec terminal.background #16161e == panel) and its default fg rides `terminalAnsiWhite`
// (spec terminal.foreground #787c99 == ANSI white). `dim` is one role serving
// both secondary UI text (which must stay readable -> #787C99) and inactive line numbers (spec would
// prefer a darker #363B54); readability wins, so inactive line numbers ride a touch brighter than spec.
export const DARK: Palette = {
  name: 'invar-dark',
  bg: '#1a1b26', panel: '#16161e', statusBg: '#16161e',
  border: '#101014', borderActive: '#7aa2f7',
  fg: '#a9b1d6', dim: '#787c99', accent: '#7aa2f7',
  selection: '#2b2f41', selectionMuted: '#283457', cursorLine: '#1e202e',
  indentGuide: '#292e42',
  added: '#41a6b5', modified: '#6183bb', deleted: '#db4b4b',
  diffAddedBg: '#164846', diffModifiedBg: '#394b70', diffDeletedBg: '#823c41',
  keyword: '#bb9af7', string: '#9ece6a', number: '#ff9e64',
  comment: '#51597d', func: '#7aa2f7', type: '#0db9d7',
  variable: '#c0caf5', operator: '#89ddff',
  error: '#db4b4b', warning: '#e0af68', info: '#0da0ba',
  // Terminal ANSI-16 (spec §10). Brights ride the normals except brightBlack (== black, the spec's
  // own choice) and brightWhite (#acb0d0, a step brighter than the #787c99 body text). Black is the
  // spec's VISIBLE #363b54 — `ls`/git dark-grey output stays legible on the near-black panel.
  terminalAnsiBlack: '#363b54', terminalAnsiRed: '#f7768e', terminalAnsiGreen: '#73daca',
  terminalAnsiYellow: '#e0af68', terminalAnsiBlue: '#7aa2f7', terminalAnsiMagenta: '#bb9af7',
  terminalAnsiCyan: '#7dcfff', terminalAnsiWhite: '#787c99',
  terminalAnsiBrightBlack: '#363b54', terminalAnsiBrightRed: '#f7768e', terminalAnsiBrightGreen: '#73daca',
  terminalAnsiBrightYellow: '#e0af68', terminalAnsiBrightBlue: '#7aa2f7', terminalAnsiBrightMagenta: '#bb9af7',
  terminalAnsiBrightCyan: '#7dcfff', terminalAnsiBrightWhite: '#acb0d0',
};

// Tokyo Night Day — a soft grey-blue light theme (bg is never #fff so it doesn't burn the eyes),
// body text a dark blue-grey rather than black, all accents desaturated for easy daytime reading.
export const LIGHT: Palette = {
  name: 'invar-light',
  bg: '#e1e2e7', panel: '#d4d6e4', statusBg: '#c4c8da',
  border: '#b6bad0', borderActive: '#2e7de9',
  fg: '#343b58', dim: '#848cb5', accent: '#2e7de9',
  selection: '#b7c1e3', selectionMuted: '#a3b6e8', cursorLine: '#d6d8e6',
  indentGuide: '#c8cbe0',
  added: '#587539', modified: '#8c6c3e', deleted: '#f52a65',
  diffAddedBg: '#d5e6d0', diffModifiedBg: '#ece6d0', diffDeletedBg: '#f2d5dc',
  keyword: '#9854f1', string: '#587539', number: '#b15c00',
  comment: '#848cb5', func: '#2e7de9', type: '#007197',
  variable: '#343b58', operator: '#0f4b6e',
  error: '#f52a65', warning: '#8c6c3e', info: '#2e7de9',
  // Terminal ANSI-16 — Tokyo Night DAY analog, derived (recorded choices): the six chromatic slots
  // reuse this palette's own desaturated day accents (red=error, green=string, yellow=warning,
  // blue=accent, magenta=keyword, cyan=type) so terminal output matches the editor's ink; black is
  // the day muted blue-grey #a1a6c5 (the light-surface analog of dark's #363b54 — "black" output is
  // a soft grey, never harsh #000); white #6172b0 is the terminal BODY text (day analog of dark's
  // #787c99 — a mid blue-grey readable on the #d4d6e4 panel); brightWhite is the palette's strongest
  // ink #343b58 (contrast steps UP by getting darker on a light surface). Brights = normals otherwise.
  terminalAnsiBlack: '#a1a6c5', terminalAnsiRed: '#f52a65', terminalAnsiGreen: '#587539',
  terminalAnsiYellow: '#8c6c3e', terminalAnsiBlue: '#2e7de9', terminalAnsiMagenta: '#9854f1',
  terminalAnsiCyan: '#007197', terminalAnsiWhite: '#6172b0',
  terminalAnsiBrightBlack: '#a1a6c5', terminalAnsiBrightRed: '#f52a65', terminalAnsiBrightGreen: '#587539',
  terminalAnsiBrightYellow: '#8c6c3e', terminalAnsiBrightBlue: '#2e7de9', terminalAnsiBrightMagenta: '#9854f1',
  terminalAnsiBrightCyan: '#007197', terminalAnsiBrightWhite: '#343b58',
};

export const PALETTES: Record<string, Palette> = {
  [DARK.name]: DARK,
  [LIGHT.name]: LIGHT,
};

// --- Down-quantization ---------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const hexDigits = hex.replace('#', '');
  return [parseInt(hexDigits.slice(0, 2), 16), parseInt(hexDigits.slice(2, 4), 16), parseInt(hexDigits.slice(4, 6), 16)];
}

/** Map an rgb triple to the nearest xterm-256 index, then back to a hex approximation. */
function to256Hex(hex: string): string {
  const [red, green, blue] = hexToRgb(hex);
  // 6x6x6 color cube
  const quantize = (value: number) => (value < 48 ? 0 : value < 115 ? 1 : Math.round((value - 35) / 40));
  const clamp5 = (value: number) => Math.max(0, Math.min(5, value));
  const cube = [0, 95, 135, 175, 215, 255];
  return rgbToHex(cube[clamp5(quantize(red))]!, cube[clamp5(quantize(green))]!, cube[clamp5(quantize(blue))]!);
}

/** The standard ANSI-16 palette (approx hexes), indexed 0–15. ONE table, two uses: the
 *  nearest-color target set for generic 16-depth quantization, and the role-pinned value each
 *  `terminalAnsi*` role degrades to at 16 depth (see `$quantizePalette`). */
const STANDARD_ANSI_16_HEX = [
  '#000000', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#c0c0c0',
  '#808080', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff',
] as const;
/** Map to the nearest of the 16 ANSI colors. */
const ANSI16: Array<[number, number, number]> = STANDARD_ANSI_16_HEX.map(hexToRgb);
function to16Hex(hex: string): string {
  const [red, green, blue] = hexToRgb(hex);
  let best = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < ANSI16.length; index++) {
    const [candidateRed, candidateGreen, candidateBlue] = ANSI16[index]!;
    const distance = (red - candidateRed) ** 2 + (green - candidateGreen) ** 2 + (blue - candidateBlue) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  const [nearestRed, nearestGreen, nearestBlue] = ANSI16[best]!;
  return rgbToHex(nearestRed, nearestGreen, nearestBlue);
}

function rgbToHex(red: number, green: number, blue: number): string {
  const toHexByte = (value: number) => value.toString(16).padStart(2, '0');
  return `#${toHexByte(red)}${toHexByte(green)}${toHexByte(blue)}`;
}

/** Return a palette whose colors are quantized to the terminal's depth.
 *
 *  The `terminalAnsi*` role family is INDEXED appearance: each role's identity is an ANSI slot, so
 *  at the 16 rung it pins to its OWN standard slot (`terminalAnsiRed` → `#800000`) instead of the
 *  nearest-RGB match — nearest-RGB collapses Tokyo Night's mid-brightness pastels into one silver
 *  (`#c0c0c0`) and destroys the index structure, leaving a monochrome terminal. Pinning keeps every
 *  slot distinct and is exactly what a real 16-color terminal shows for SGR 0–15. Still inside the
 *  ANSI-16 set, still the same keys — the ladder's completeness contract is unchanged. */
// invariant: The palette ladder quantizes color without leaving the palette (src/modules/theme/theme.invariants.md)
function $quantizePalette(palette: Palette, depth: ColorDepth): Palette {
  if (depth === 'truecolor') return palette;
  const mapColor = depth === '256' ? to256Hex : to16Hex;
  const result = { ...palette };
  for (const key of Object.keys(result) as Array<keyof Palette>) {
    const value = result[key];
    if (typeof value === 'string' && value.startsWith('#')) {
      (result[key] as string) = mapColor(value);
    }
  }
  if (depth === '16') {
    for (let ansiIndex = 0; ansiIndex < TERMINAL_ANSI_ROLE_NAMES.length; ansiIndex++) {
      (result[TERMINAL_ANSI_ROLE_NAMES[ansiIndex]!] as string) = STANDARD_ANSI_16_HEX[ansiIndex]!;
    }
  }
  return result;
}

/** The palette's color for ANSI index 0–15 — the theme-owned answer to a child process's SGR
 *  named-color request. Out-of-range indices fall back to the white role (the terminal body text). */
function $terminalAnsiHex(palette: Palette, ansiIndex: number): string {
  const roleName = TERMINAL_ANSI_ROLE_NAMES[ansiIndex];
  return roleName ? palette[roleName] : palette.terminalAnsiWhite;
}

class $ThemePalettes {
  static quantizePalette = $quantizePalette;
  static terminalAnsiHex = $terminalAnsiHex;
}

export namespace ThemePalettes {
  export const $Class = $ThemePalettes;
  export const Class = Static($ThemePalettes);
}
