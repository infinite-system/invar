// Render the live app's terminal grid to a crisp SVG "screenshot".
//
// The PTY harness already knows every cell's glyph, colors, and attributes —
// this script boots the app (or runs a preparation snippet first), captures
// the completed frame, and emits an SVG that reproduces the grid exactly:
// per-cell RGB/palette colors, bold/italic/dim, merged background runs.
// SVG because the machine is headless and the output beats a bitmap anyway:
// a few hundred KB, crisp at any zoom, perfect for a static docs site.
//
// Usage:
//   bun scripts/harness/screenshot-svg.ts --out shot.svg [--open DIR]
//     [--size N] [--geometry CxR] [--eval 'await app.key("Control+Shift+t").waitForText("LIVE")']
//
// The --eval snippet runs with `app` (a DriveSession) before capture — use it
// to open panels and navigate to the composition you want in the shot.

import { writeFileSync } from 'node:fs';
import { DriveScriptRunner } from './DriveSession';
import type { HarnessSnapshot, HarnessSnapshotCell } from './HarnessSnapshot';

const CELL_WIDTH = 9.6;
const CELL_HEIGHT = 21;
const FONT_SIZE = 15.5;
const BASELINE_OFFSET = 15.5;
const DEFAULT_FOREGROUND = '#c8ccd4';
const DEFAULT_BACKGROUND = '#0d1016';
const FONT_FAMILY =
  "'JetBrains Mono','Fira Code','SF Mono',Menlo,Consolas,monospace";

/** Standard xterm 256-color palette (16 system + 216 cube + 24 grays). */
function paletteToRgb(index: number): string {
  const system = [
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
    '#ffffff',
  ];
  if (index < 16) return system[index] ?? DEFAULT_FOREGROUND;
  if (index < 232) {
    const cube = index - 16;
    const steps = [0, 95, 135, 175, 215, 255];
    const red = steps[Math.floor(cube / 36) % 6] ?? 0;
    const green = steps[Math.floor(cube / 6) % 6] ?? 0;
    const blue = steps[cube % 6] ?? 0;
    return rgbHex(red, green, blue);
  }
  const gray = 8 + (index - 232) * 10;
  return rgbHex(gray, gray, gray);
}

function rgbHex(red: number, green: number, blue: number): string {
  const part = (value: number) => value.toString(16).padStart(2, '0');
  return `#${part(red)}${part(green)}${part(blue)}`;
}

/** A packed 24-bit color from the emulator becomes #rrggbb. */
function packedToRgb(packed: number): string {
  return rgbHex((packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff);
}

function foregroundOf(cell: HarnessSnapshotCell): string {
  let color = DEFAULT_FOREGROUND;
  if (cell.isForegroundRgb) color = packedToRgb(cell.foreground);
  else if (cell.isForegroundPalette) color = paletteToRgb(cell.foreground);
  if (cell.isDim) color = dim(color);
  return color;
}

function backgroundOf(cell: HarnessSnapshotCell): string | null {
  if (cell.isBackgroundRgb) return packedToRgb(cell.background);
  if (cell.isBackgroundPalette) return paletteToRgb(cell.background);
  return null; // default background — covered by the page rect
}

function dim(hex: string): string {
  const value = parseInt(hex.slice(1), 16);
  const mix = (channel: number) => Math.round(channel * 0.55 + 22);
  return rgbHex(
    mix((value >> 16) & 0xff),
    mix((value >> 8) & 0xff),
    mix(value & 0xff),
  );
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

interface CliOptions {
  out: string;
  open?: string;
  size?: number;
  geometry?: string;
  evalCode?: string;
}

function parseArguments(argv: string[]): CliOptions {
  const options: CliOptions = { out: 'invar-screenshot.svg' };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    const next = () => argv[++index] ?? '';
    if (flag === '--out') options.out = next();
    else if (flag === '--open') options.open = next();
    else if (flag === '--size') options.size = Number(next());
    else if (flag === '--geometry') options.geometry = next();
    else if (flag === '--eval') options.evalCode = next();
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const geometry = options.geometry?.match(/^(\d+)x(\d+)$/);
  let captured: HarnessSnapshot.Model | null = null;
  (globalThis as Record<string, unknown>).__screenshotCapture = (
    snapshot: HarnessSnapshot.Model,
  ) => {
    captured = snapshot;
  };
  const preparation = options.evalCode ? `${options.evalCode}\n` : '';
  await DriveScriptRunner.Class.run({
    workspaceRoot: options.open,
    fixtureSize: options.size,
    columns: geometry ? Number(geometry[1]) : undefined,
    rows: geometry ? Number(geometry[2]) : undefined,
    source:
      preparation +
      'await app.waitForRepaint();\n' +
      'globalThis.__screenshotCapture(await app.screen());',
  });
  if (captured === null) throw new Error('screenshot-svg: no frame captured');
  const svg = renderSvg(captured);
  writeFileSync(options.out, svg.markup);
  console.log(
    `screenshot-svg: wrote ${options.out} (${svg.columns}x${svg.rows} cells, ${(svg.markup.length / 1024).toFixed(0)} KB)`,
  );
}

function renderSvg(snapshot: HarnessSnapshot.Model): {
  markup: string;
  columns: number;
  rows: number;
} {
  const rows = snapshot.rows;
  const columns = snapshot.columns;
  const width = Math.ceil(columns * CELL_WIDTH);
  const height = rows * CELL_HEIGHT;

  const backgroundRects: string[] = [];
  const textRuns: string[] = [];

  for (let row = 0; row < rows; row++) {
    const cells = snapshot.rowCells(row);

    let runStart = 0;
    let runColor: string | null = null;
    const flushBackground = (endColumn: number) => {
      if (runColor === null) return;
      const x = (runStart * CELL_WIDTH).toFixed(1);
      const rectWidth = ((endColumn - runStart) * CELL_WIDTH).toFixed(1);
      backgroundRects.push(
        `<rect x="${x}" y="${row * CELL_HEIGHT}" width="${rectWidth}" height="${CELL_HEIGHT}" fill="${runColor}"/>`,
      );
    };
    for (let column = 0; column < cells.length; column++) {
      const color = backgroundOf(cells[column]!);
      if (color !== runColor) {
        flushBackground(column);
        runStart = column;
        runColor = color;
      }
    }
    flushBackground(cells.length);

    let textStart = 0;
    let textStyleKey = '';
    let textStyle = '';
    let textBuffer = '';
    const flushText = () => {
      if (!textBuffer.trim()) {
        textBuffer = '';
        return;
      }
      const x = (textStart * CELL_WIDTH).toFixed(1);
      const y = row * CELL_HEIGHT + BASELINE_OFFSET;
      textRuns.push(
        `<text x="${x}" y="${y}"${textStyle} textLength="${(textBuffer.length * CELL_WIDTH).toFixed(1)}" lengthAdjust="spacingAndGlyphs" xml:space="preserve">${escapeXml(textBuffer)}</text>`,
      );
      textBuffer = '';
    };
    for (let column = 0; column < cells.length; column++) {
      const cell = cells[column]!;
      const characters = cell.characters || ' ';
      const style =
        ` fill="${foregroundOf(cell)}"` +
        (cell.isBold ? ' font-weight="700"' : '') +
        (cell.isItalic ? ' font-style="italic"' : '') +
        (cell.isUnderline ? ' text-decoration="underline"' : '');
      if (style !== textStyleKey) {
        flushText();
        textStyleKey = style;
        textStyle = style;
        textStart = column;
      }
      if (!textBuffer) textStart = column;
      textBuffer += characters === '' ? ' ' : characters;
      if (cell.width > 1) column += cell.width - 1;
    }
    flushText();
  }

  const markup =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `font-family="${FONT_FAMILY}" font-size="${FONT_SIZE}">\n` +
    `<rect width="${width}" height="${height}" fill="${DEFAULT_BACKGROUND}"/>\n` +
    backgroundRects.join('\n') +
    '\n' +
    textRuns.join('\n') +
    '\n</svg>\n';
  return { markup, columns, rows };
}

await main();
