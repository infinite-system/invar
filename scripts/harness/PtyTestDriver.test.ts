import { describe, expect, test } from 'bun:test';
import { TerminalEmulator } from '../../src/modules/terminal/TerminalEmulator';
import { HarnessInput } from './HarnessInput';
import { HarnessSnapshot, type HarnessSnapshotCell } from './HarnessSnapshot';

describe('HarnessInput', () => {
  test('maps named keys and modifiers to terminal bytes', () => {
    expect(HarnessInput.Class.key('Enter')).toBe('\r');
    expect(HarnessInput.Class.key('Control+q')).toBe('\x11');
    expect(HarnessInput.Class.key('Alt+z')).toBe('\x1bz');
    expect(HarnessInput.Class.key('Shift+Tab')).toBe('\x1b[Z');
    expect(HarnessInput.Class.key('Control+Right')).toBe('\x1b[1;5C');
    expect(HarnessInput.Class.key('Control+,')).toBe('\x1b[44;5u');
    expect(HarnessInput.Class.key('Alt+F5')).toBe('\x1b[15;3~');
  });

  test('maps mouse gestures and bracketed paste to protocol frames', () => {
    expect(HarnessInput.Class.mouse({
      kind: 'press',
      column: 9,
      row: 4,
      button: 'left',
    })).toBe('\x1b[<0;10;5M');
    expect(HarnessInput.Class.mouse({
      kind: 'wheel',
      column: 9,
      row: 4,
      direction: 'right',
      alt: true,
    })).toBe('\x1b[<75;10;5M');
    expect(HarnessInput.Class.paste('two\nlines')).toBe('\x1b[200~two\nlines\x1b[201~');
  });
});

describe('HarnessSnapshot', () => {
  test('copies truecolor and all exposed SGR attributes from the production emulator', async () => {
    const emulator = new TerminalEmulator.Class(8, 2);
    emulator.write('\x1b[1;2;3;4;5;7;8;9;53;38;2;1;2;3;48;2;4;5;6mX');
    await emulator.flush();
    const copiedCells: HarnessSnapshotCell[] = [];
    for (let row = 0; row < emulator.rows; row++) {
      for (let column = 0; column < emulator.columns; column++) {
        const cell = emulator.cell(row, column);
        if (!cell) throw new Error('expected emulator cell');
        copiedCells.push({ ...cell, row, column });
      }
    }
    const snapshot = new HarnessSnapshot.Class(
      emulator.columns,
      emulator.rows,
      emulator.cursorColumn,
      emulator.cursorRow,
      copiedCells,
    );
    const styledCell = snapshot.cell(0, 0);
    expect(styledCell).toMatchObject({
      characters: 'X',
      foreground: 0x010203,
      background: 0x040506,
      isForegroundRgb: true,
      isBackgroundRgb: true,
      isBold: true,
      isDim: true,
      isItalic: true,
      isUnderline: true,
      isBlink: true,
      isInverse: true,
      isInvisible: true,
      isStrikethrough: true,
      isOverline: true,
    });
    expect(snapshot.findText('X')).toEqual({ row: 0, column: 0 });
    emulator.dispose();
  });
});
