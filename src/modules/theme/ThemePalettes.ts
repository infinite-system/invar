// Color palettes as semantic tokens, with truecolor → 256 → 16 down-quantization.
// invariant: Appearance is data with a capability fallback (project.invariants.md)
import { Static } from 'ivue/extras';
import type { ColorDepth } from './TerminalCapabilities';

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
// the syntax sub-roles parameter/property/tag/attribute, bracket-pair rotation, the terminal ANSI-16
// set (that lives in TerminalPaneRenderer as the emulator's standard-ANSI fallback; terminal bg/fg
// already track panel/fg), and separate surfaceRaised/input backgrounds. `dim` is one role serving
// both secondary UI text (which must stay readable -> #787C99) and inactive line numbers (spec would
// prefer a darker #363B54); readability wins, so inactive line numbers ride a touch brighter than spec.
class $ThemePalettes {
  static get DARK(): Palette {
    return {
      name: 'invar-dark',
      bg: '#1a1b26',
      panel: '#16161e',
      statusBg: '#16161e',
      border: '#101014',
      borderActive: '#7aa2f7',
      fg: '#a9b1d6',
      dim: '#787c99',
      accent: '#7aa2f7',
      terminalPrompt: '#7aa2f7',
      selection: '#2b2f41',
      selectionMuted: '#283457',
      cursorLine: '#1e202e',
      indentGuide: '#292e42',
      inlineRewriteForeground: '#7dcfff',
      inlineRewriteBackground: '#24283b',
      added: '#41a6b5',
      modified: '#6183bb',
      deleted: '#db4b4b',
      diffAddedBg: '#164846',
      diffModifiedBg: '#394b70',
      diffDeletedBg: '#823c41',
      keyword: '#bb9af7',
      string: '#9ece6a',
      number: '#ff9e64',
      comment: '#51597d',
      func: '#7aa2f7',
      type: '#0db9d7',
      variable: '#c0caf5',
      operator: '#89ddff',
      error: '#db4b4b',
      warning: '#e0af68',
      info: '#0da0ba',
    };
  }

  // Tokyo Night Day — a soft grey-blue light theme (bg is never #fff so it doesn't burn the eyes),
  // body text a dark blue-grey rather than black, all accents desaturated for easy daytime reading.
  static get LIGHT(): Palette {
    return {
      name: 'invar-light',
      bg: '#e1e2e7',
      panel: '#d4d6e4',
      statusBg: '#c4c8da',
      border: '#b6bad0',
      borderActive: '#2e7de9',
      fg: '#343b58',
      dim: '#848cb5',
      accent: '#2e7de9',
      terminalPrompt: '#2e7de9',
      selection: '#b7c1e3',
      selectionMuted: '#a3b6e8',
      cursorLine: '#d6d8e6',
      indentGuide: '#c8cbe0',
      inlineRewriteForeground: '#007197',
      inlineRewriteBackground: '#cbd5ef',
      added: '#587539',
      modified: '#8c6c3e',
      deleted: '#f52a65',
      diffAddedBg: '#d5e6d0',
      diffModifiedBg: '#ece6d0',
      diffDeletedBg: '#f2d5dc',
      keyword: '#9854f1',
      string: '#587539',
      number: '#b15c00',
      comment: '#848cb5',
      func: '#2e7de9',
      type: '#007197',
      variable: '#343b58',
      operator: '#0f4b6e',
      error: '#f52a65',
      warning: '#8c6c3e',
      info: '#2e7de9',
    };
  }

  protected static get $palettes(): Readonly<Record<string, Palette>> {
    return {
      [this.DARK.name]: this.DARK,
      [this.LIGHT.name]: this.LIGHT,
    };
  }

  static get palettes(): Readonly<Record<string, Palette>> {
    return this.$palettes;
  }

  // --- Down-quantization ---------------------------------------------------------

  protected static hexToRgb(hex: string): [number, number, number] {
    const hexDigits = hex.replace('#', '');
    return [
      parseInt(hexDigits.slice(0, 2), 16),
      parseInt(hexDigits.slice(2, 4), 16),
      parseInt(hexDigits.slice(4, 6), 16),
    ];
  }

  /** Map an rgb triple to the nearest xterm-256 index, then back to a hex approximation. */
  protected static to256Hex(hex: string): string {
    const [red, green, blue] = this.hexToRgb(hex);
    // 6x6x6 color cube
    const quantize = (value: number) =>
      value < 48 ? 0 : value < 115 ? 1 : Math.round((value - 35) / 40);
    const clamp5 = (value: number) => Math.max(0, Math.min(5, value));
    const cube = [0, 95, 135, 175, 215, 255];
    return this.rgbToHex(
      cube[clamp5(quantize(red))]!,
      cube[clamp5(quantize(green))]!,
      cube[clamp5(quantize(blue))]!,
    );
  }

  /** Map to the nearest of the 16 ANSI colors (approx hexes). */
  protected static get ANSI16(): ReadonlyArray<
    readonly [number, number, number]
  > {
    return [
      [0, 0, 0],
      [128, 0, 0],
      [0, 128, 0],
      [128, 128, 0],
      [0, 0, 128],
      [128, 0, 128],
      [0, 128, 128],
      [192, 192, 192],
      [128, 128, 128],
      [255, 0, 0],
      [0, 255, 0],
      [255, 255, 0],
      [0, 0, 255],
      [255, 0, 255],
      [0, 255, 255],
      [255, 255, 255],
    ];
  }

  protected static to16Hex(hex: string): string {
    const [red, green, blue] = this.hexToRgb(hex);
    let best = 0;
    let bestDistance = Infinity;
    for (let index = 0; index < this.ANSI16.length; index++) {
      const [candidateRed, candidateGreen, candidateBlue] = this.ANSI16[index]!;
      const distance =
        (red - candidateRed) ** 2 +
        (green - candidateGreen) ** 2 +
        (blue - candidateBlue) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    const [nearestRed, nearestGreen, nearestBlue] = this.ANSI16[best]!;
    return this.rgbToHex(nearestRed, nearestGreen, nearestBlue);
  }

  protected static rgbToHex(red: number, green: number, blue: number): string {
    const toHexByte = (value: number) => value.toString(16).padStart(2, '0');
    return `#${toHexByte(red)}${toHexByte(green)}${toHexByte(blue)}`;
  }

  /** Return a palette whose colors are quantized to the terminal's depth. */
  // invariant: The palette ladder quantizes color without leaving the palette (src/modules/theme/theme.invariants.md)
  static quantizePalette(palette: Palette, depth: ColorDepth): Palette {
    if (depth === 'truecolor') return palette;
    const mapColor =
      depth === '256'
        ? (color: string) => this.to256Hex(color)
        : (color: string) => this.to16Hex(color);
    const result = { ...palette };
    for (const key of Object.keys(result) as Array<keyof Palette>) {
      const value = result[key];
      if (typeof value === 'string' && value.startsWith('#')) {
        (result[key] as string) = mapColor(value);
      }
    }
    return result;
  }
}

export namespace ThemePalettes {
  export const $Class = $ThemePalettes;
  export const Class = Static($ThemePalettes);
}

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
  terminalPrompt: string;
  selection: string;
  selectionMuted: string;
  cursorLine: string;
  indentGuide: string;
  inlineRewriteForeground: string;
  inlineRewriteBackground: string;
  added: string;
  modified: string;
  deleted: string;
  diffAddedBg: string;
  diffModifiedBg: string;
  diffDeletedBg: string;
  keyword: string;
  string: string;
  number: string;
  comment: string;
  func: string;
  type: string;
  variable: string;
  operator: string;
  error: string;
  warning: string;
  info: string;
}
