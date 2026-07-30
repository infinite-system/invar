// The terminal pane renderer: pulls the emulator's visible rows×cols cell grid per frame into a
// StyledText, coalescing runs of same-styled cells into one chunk (flyweight viewport-pull — the same
// shape as TreePaneRenderer / GitPaneRenderer, no per-cell renderable, no dirty-region bookkeeping).
// Stateless Static capability: every read flows through the passed-in TerminalInstance, so reactivity
// flows when the owner calls render() inside its reactive update.
//
// invariant: The panel renders exactly the visible pane content cells each frame (src/modules/ui/ui.invariants.md)
// invariant: The emulator is the single source of terminal screen state (src/modules/terminal/terminal.invariants.md)
// invariant: Pane chrome and child cells keep separate authority (src/modules/terminal/terminal.invariants.md)
import { StyledText, fg, bg, bold, type TextChunk } from '@opentui/core';
import { Static } from 'ivue/extras';
import type { Palette } from '../theme/ThemePalettes';
import type { SelectionSpanRange } from '../ui/TextSelectionModel';
import type { TerminalInstance } from './TerminalInstance';
import type { TerminalCell } from './TerminalEmulator';

class $TerminalPaneRenderer {
  protected static terminalAnsiPalette(palette: Palette): readonly string[] {
    return [
      palette.terminalAnsiBlack,
      palette.terminalAnsiRed,
      palette.terminalAnsiGreen,
      palette.terminalAnsiYellow,
      palette.terminalAnsiBlue,
      palette.terminalAnsiMagenta,
      palette.terminalAnsiCyan,
      palette.terminalAnsiWhite,
      palette.terminalAnsiBrightBlack,
      palette.terminalAnsiBrightRed,
      palette.terminalAnsiBrightGreen,
      palette.terminalAnsiBrightYellow,
      palette.terminalAnsiBrightBlue,
      palette.terminalAnsiBrightMagenta,
      palette.terminalAnsiBrightCyan,
      palette.terminalAnsiBrightWhite,
    ];
  }

  protected static toHex(value: number): string {
    return value.toString(16).padStart(2, '0');
  }

  protected static paletteToHex(
    index: number,
    palette: Palette,
    instance: TerminalInstance.Instance,
  ): string {
    const childOverride = instance.paletteOverride(index);
    if (childOverride) return childOverride;
    if (index < 16) {
      return (
        this.terminalAnsiPalette(palette)[index] ?? palette.terminalForeground
      );
    }
    if (index < 232) {
      const cubeIndex = index - 16;
      const steps = [0, 95, 135, 175, 215, 255];
      const red = steps[Math.floor(cubeIndex / 36) % 6] ?? 0;
      const green = steps[Math.floor(cubeIndex / 6) % 6] ?? 0;
      const blue = steps[cubeIndex % 6] ?? 0;
      return `#${this.toHex(red)}${this.toHex(green)}${this.toHex(blue)}`;
    }
    const gray = 8 + (index - 232) * 10;
    return `#${this.toHex(gray)}${this.toHex(gray)}${this.toHex(gray)}`;
  }

  protected static rgbToHex(value: number): string {
    return `#${this.toHex((value >> 16) & 0xff)}${this.toHex((value >> 8) & 0xff)}${this.toHex(value & 0xff)}`;
  }

  /** The cell's foreground color as a hex string, honoring RGB / palette / default. */
  protected static foregroundHex(
    cell: TerminalCell,
    palette: Palette,
    instance: TerminalInstance.Instance,
  ): string {
    if (cell.isForegroundRgb) return this.rgbToHex(cell.foreground);
    if (cell.isForegroundPalette) {
      return this.paletteToHex(cell.foreground, palette, instance);
    }
    return palette.terminalForeground;
  }

  /** The cell's background color as a hex string, honoring RGB / palette / default. */
  protected static backgroundHex(
    cell: TerminalCell,
    palette: Palette,
    instance: TerminalInstance.Instance,
  ): string {
    if (cell.isBackgroundRgb) return this.rgbToHex(cell.background);
    if (cell.isBackgroundPalette) {
      return this.paletteToHex(cell.background, palette, instance);
    }
    return palette.terminalBackground;
  }

  protected static styleKey(cell: TerminalCell, selected: boolean): string {
    return `${cell.foreground}:${cell.background}:${cell.isForegroundRgb}:${cell.isForegroundPalette}:${cell.isBackgroundRgb}:${cell.isBackgroundPalette}:${cell.isBold}:${cell.isInverse}:${selected}`;
  }

  protected static chunkFor(
    text: string,
    cell: TerminalCell,
    instance: TerminalInstance.Instance,
    palette: Palette,
    selected: boolean,
  ): TextChunk {
    let foreground = this.foregroundHex(cell, palette, instance);
    let background = this.backgroundHex(cell, palette, instance);
    if (cell.isInverse) {
      const swap = background;
      background = foreground;
      foreground = swap;
    }
    if (selected) background = palette.selection;
    let chunk = fg(foreground)(text);
    if (cell.isBold) chunk = bold(chunk);
    chunk = bg(background)(chunk);
    return chunk;
  }

  static render(context: TerminalPaneRenderContext): StyledText {
    const { instance, palette } = context;
    const padColumns = Math.max(0, context.padColumns ?? 0);
    const padRows = Math.max(0, context.padRows ?? 0);
    // The emulator draws into the region INSIDE the gutter; the outer margin stays panel background.
    const rows = Math.min(
      Math.max(0, context.height - 2 * padRows),
      instance.rows,
    );
    const columns = Math.min(
      Math.max(0, context.width - 2 * padColumns),
      instance.columns,
    );
    const leadingGutter = padColumns > 0 ? ' '.repeat(padColumns) : '';
    // Build each emulator row's coalesced chunks, then frame with blank gutter rows + a left margin.
    const rowChunkLists: TextChunk[][] = [];
    for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
      const rowChunks: TextChunk[] = [];
      if (leadingGutter) rowChunks.push(fg(palette.fg)(leadingGutter));
      let runText = '';
      let runCell: TerminalCell | null = null;
      let runSelected = false;
      let runKey = '';
      const flushRun = () => {
        if (runCell && runText) {
          rowChunks.push(
            this.chunkFor(runText, runCell, instance, palette, runSelected),
          );
        }
        runText = '';
        runCell = null;
        runKey = '';
        runSelected = false;
      };
      let columnIndex = 0;
      while (columnIndex < columns) {
        const cell = instance.cell(rowIndex, columnIndex) ?? {
          characters: ' ',
          foreground: 0,
          background: 0,
          isForegroundDefault: true,
          isForegroundRgb: false,
          isForegroundPalette: false,
          isBackgroundDefault: true,
          isBackgroundRgb: false,
          isBackgroundPalette: false,
          isBold: false,
          isDim: false,
          isItalic: false,
          isUnderline: false,
          isBlink: false,
          isInverse: false,
          isInvisible: false,
          isStrikethrough: false,
          isOverline: false,
          width: 1,
        };
        const selectionRange = context.selectionRanges?.[rowIndex] ?? null;
        const selected =
          selectionRange !== null &&
          columnIndex < selectionRange.end &&
          columnIndex + Math.max(1, cell.width) > selectionRange.start;
        const key = this.styleKey(cell, selected);
        if (runCell && key !== runKey) flushRun();
        runText += cell.characters;
        runCell = cell;
        runKey = key;
        runSelected = selected;
        // A wide (2-cell) glyph occupies the next column with a 0-width spacer xterm returns as ''.
        columnIndex += Math.max(1, cell.width);
      }
      flushRun();
      rowChunkLists.push(rowChunks);
    }
    // Frame: padRows blank rows, then the gutter-indented content rows, then padRows blank rows.
    const framedRows: TextChunk[][] = [];
    for (let blank = 0; blank < padRows; blank += 1) framedRows.push([]);
    for (const rowChunks of rowChunkLists) framedRows.push(rowChunks);
    for (let blank = 0; blank < padRows; blank += 1) framedRows.push([]);
    const chunks: TextChunk[] = [];
    for (let rowIndex = 0; rowIndex < framedRows.length; rowIndex += 1) {
      chunks.push(...(framedRows[rowIndex] as TextChunk[]));
      if (rowIndex < framedRows.length - 1) chunks.push(fg(palette.fg)('\n'));
    }
    return new StyledText(chunks);
  }
}

export namespace TerminalPaneRenderer {
  export const $Class = Static($TerminalPaneRenderer);
  export let Class = $Class;
}

export interface TerminalPaneRenderContext {
  instance: TerminalInstance.Instance;
  palette: Palette;
  /** Available cell rows for the terminal body (the whole pane region, gutter included). */
  height: number;
  /** Available cell columns for the terminal body (the whole pane region, gutter included). */
  width: number;
  /** Left/right gutter columns kept blank around the emulator (default 0). */
  padColumns?: number;
  /** Top/bottom gutter rows kept blank around the emulator (default 0). */
  padRows?: number;
  selectionRanges?: readonly (SelectionSpanRange | null)[];
}
