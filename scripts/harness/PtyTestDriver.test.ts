import { describe, expect, test } from 'bun:test';
import { TerminalEmulator } from '../../src/modules/terminal/TerminalEmulator';
import { HarnessInput } from './HarnessInput';
import { HarnessSnapshot, type HarnessSnapshotCell } from './HarnessSnapshot';
import { PtyTestDriver } from './PtyTestDriver';

const beginSynchronizedOutput = '\x1b[?2026h';
const endSynchronizedOutput = '\x1b[?2026l';

function recordedFrame(frameText: string): string {
  return `${beginSynchronizedOutput}\x1b[2J\x1b[H${frameText}${endSynchronizedOutput}`;
}

function createRecordedStreamDriver(
  frameTexts: readonly string[],
  frameIntervalMilliseconds = 15,
): PtyTestDriver.Model {
  const recordedFrames = frameTexts.map((frameText) => recordedFrame(frameText));
  const recordedStreamProgram = `
    const recordedFrames = ${JSON.stringify(recordedFrames)};
    await Bun.sleep(20);
    for (const recordedFrame of recordedFrames) {
      process.stdout.write(recordedFrame);
      await Bun.sleep(${frameIntervalMilliseconds});
    }
    await Bun.sleep(1_000);
  `;
  return new PtyTestDriver.Class({
    workspaceRoot: process.cwd(),
    repositoryRoot: process.cwd(),
    columns: 40,
    rows: 4,
    command: [process.execPath, '-e', recordedStreamProgram],
  });
}

describe('HarnessInput', () => {
  test('maps named keys and modifiers to terminal bytes', () => {
    expect(HarnessInput.Class.key('Enter')).toBe('\r');
    expect(HarnessInput.Class.key('Control+q')).toBe('\x11');
    expect(HarnessInput.Class.key('Alt+z')).toBe('\x1bz');
    expect(HarnessInput.Class.key('Shift+Tab')).toBe('\x1b[Z');
    expect(HarnessInput.Class.key('Control+Right')).toBe('\x1b[1;5C');
    expect(HarnessInput.Class.key('Control+,')).toBe('\x1b[44;5u');
    expect(HarnessInput.Class.key('Alt+F5')).toBe('\x1b[15;3~');
    expect(HarnessInput.Class.key('Alt+[')).toBe('\x1b[27;3;91~');
    expect(HarnessInput.Class.key('Control+Shift+g')).toBe('\x1b[103;6u');
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

describe('PtyTestDriver.awaitGridCondition', () => {
  test('resolves from the current grid when the condition is already satisfied', async () => {
    const driver = createRecordedStreamDriver(['ALREADY READY']);
    try {
      await driver.awaitQuiescence();
      const snapshot = await driver.awaitGridCondition(
        'the recorded grid already contains READY',
        (candidateSnapshot) => candidateSnapshot.findText('READY') !== null,
        100,
      );
      expect(snapshot.findText('ALREADY READY')).not.toBeNull();
    } finally {
      await driver.dispose();
    }
  });

  test('checks each completed recorded frame until the condition is satisfied', async () => {
    const driver = createRecordedStreamDriver(['FIRST', 'SECOND', 'THIRD READY']);
    try {
      const snapshot = await driver.awaitGridCondition(
        'the recorded grid reaches THIRD READY',
        (candidateSnapshot) => candidateSnapshot.findText('THIRD READY') !== null,
        1_000,
      );
      expect(snapshot.findText('THIRD READY')).not.toBeNull();
      expect(driver.outputSequenceCount(beginSynchronizedOutput)).toBe(3);
    } finally {
      await driver.dispose();
    }
  });

  test('reports the predicate and final grid region when no frame satisfies it', async () => {
    const driver = createRecordedStreamDriver(['FIRST', 'FINAL UNSATISFIED']);
    try {
      let timeoutError: Error | null = null;
      try {
        await driver.awaitGridCondition(
          'the recorded grid contains NEVER PRESENT',
          (candidateSnapshot) => candidateSnapshot.findText('NEVER PRESENT') !== null,
          120,
          {
            startRow: 0,
            endRowExclusive: 2,
            startColumn: 0,
            endColumnExclusive: 24,
          },
        );
      } catch (error) {
        timeoutError = error instanceof Error ? error : new Error(String(error));
      }
      expect(timeoutError?.message).toContain(
        'Timed out waiting for grid condition: the recorded grid contains NEVER PRESENT',
      );
      expect(timeoutError?.message).toContain('Final grid region rows 0-1, columns 0-23');
      expect(timeoutError?.message).toContain('FINAL UNSATISFIED');
      expect(timeoutError?.message).not.toContain('synchronized frame 3');
    } finally {
      await driver.dispose();
    }
  });
});

describe('PtyTestDriver.dispose', () => {
  test('does not resolve until the child process exits', async () => {
    const recordedStreamProgram = `
      process.on('SIGTERM', () => {
        setTimeout(() => process.exit(0), 80);
      });
      process.stdout.write(${JSON.stringify(recordedFrame('READY TO DISPOSE'))});
      await Bun.sleep(1_000);
    `;
    const driver = new PtyTestDriver.Class({
      workspaceRoot: process.cwd(),
      repositoryRoot: process.cwd(),
      columns: 40,
      rows: 4,
      command: [process.execPath, '-e', recordedStreamProgram],
    });
    await driver.awaitGridCondition(
      'the disposal fixture child is ready',
      (snapshot) => snapshot.findText('READY TO DISPOSE') !== null,
    );

    const disposalPromise = driver.dispose();
    const resolvedBeforeChildExit = await Promise.race([
      disposalPromise.then(() => true),
      Bun.sleep(20).then(() => false),
    ]);
    expect(resolvedBeforeChildExit).toBeFalse();
    await disposalPromise;
    expect(await driver.exitCode()).toBe(0);
  });
});
