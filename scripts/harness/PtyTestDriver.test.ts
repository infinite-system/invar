import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  const recordedFrames = frameTexts.map((frameText) =>
    recordedFrame(frameText),
  );
  const recordedStreamProgram = `
    const recordedFrames = ${JSON.stringify(recordedFrames)};
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
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

function createSingleChunkRecordedStreamDriver(
  frameTexts: readonly string[],
): PtyTestDriver.Model {
  const recordedStream = frameTexts
    .map((frameText) => recordedFrame(frameText))
    .join('');
  const recordedStreamProgram = `
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    await Bun.sleep(80);
    process.stdout.write(${JSON.stringify(recordedStream)});
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

class TinyOutputPtyTestDriver extends PtyTestDriver.$Class {
  protected static override get retainedOutputLengthLimit(): number {
    const retainedOutputLengthLimit = 32;
    return retainedOutputLengthLimit;
  }
}

function createTinyOutputDriver(
  outputChunks: readonly string[],
  retainFullOutput = false,
): InstanceType<typeof TinyOutputPtyTestDriver> {
  const recordedStreamProgram = `
    const outputChunks = ${JSON.stringify(outputChunks)};
    await Bun.sleep(80);
    for (const outputChunk of outputChunks) {
      process.stdout.write(outputChunk);
      await Bun.sleep(10);
    }
    process.stdout.write(${JSON.stringify(recordedFrame('TINY DONE'))});
    await Bun.sleep(1_000);
  `;
  return new TinyOutputPtyTestDriver({
    workspaceRoot: process.cwd(),
    repositoryRoot: process.cwd(),
    columns: 40,
    rows: 4,
    retainFullOutput,
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
    expect(HarnessInput.Class.key('Control+Shift+g')).toBe('\x1b[27;6;103~');
    // Ctrl+] is a real C0 byte, so it needs no protocol negotiation at all.
    expect(HarnessInput.Class.key('Control+]')).toBe('\x1d');
    expect(HarnessInput.Class.key('Control+Shift+Up')).toBe('\x1b[1;6A');
  });

  test('maps mouse gestures and bracketed paste to protocol frames', () => {
    expect(
      HarnessInput.Class.mouse({
        kind: 'press',
        column: 9,
        row: 4,
        button: 'left',
      }),
    ).toBe('\x1b[<0;10;5M');
    expect(
      HarnessInput.Class.mouse({
        kind: 'wheel',
        column: 9,
        row: 4,
        direction: 'right',
        alt: true,
      }),
    ).toBe('\x1b[<75;10;5M');
    expect(
      HarnessInput.Class.mouseClick({
        column: 9,
        row: 4,
        button: 'left',
      }),
    ).toBe('\x1b[<0;10;5M\x1b[<0;10;5m');
    expect(HarnessInput.Class.paste('two\nlines')).toBe(
      '\x1b[200~two\nlines\x1b[201~',
    );
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
      await driver.awaitScreenChange();
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
    const driver = createRecordedStreamDriver([
      'FIRST',
      'SECOND',
      'THIRD READY',
    ]);
    try {
      const snapshot = await driver.awaitGridCondition(
        'the recorded grid reaches THIRD READY',
        (candidateSnapshot) =>
          candidateSnapshot.findText('THIRD READY') !== null,
        1_000,
      );
      expect(snapshot.findText('THIRD READY')).not.toBeNull();
      expect(driver.outputSequenceCount(beginSynchronizedOutput)).toBe(3);
    } finally {
      await driver.dispose();
    }
  });

  test('rechecks a named condition even when no new frame is emitted', async () => {
    const driver = createRecordedStreamDriver(['IDLE GRID']);
    try {
      await driver.awaitGridCondition(
        'the recorded grid reaches its idle baseline',
        (candidateSnapshot) => candidateSnapshot.findText('IDLE GRID') !== null,
      );
      let externalConditionSatisfied = false;
      setTimeout(() => {
        externalConditionSatisfied = true;
      }, 30);
      const snapshot = await driver.awaitGridCondition(
        'the external state condition becomes satisfied',
        () => externalConditionSatisfied,
        200,
      );
      expect(snapshot.findText('IDLE GRID')).not.toBeNull();
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
          (candidateSnapshot) =>
            candidateSnapshot.findText('NEVER PRESENT') !== null,
          120,
          {
            startRow: 0,
            endRowExclusive: 2,
            startColumn: 0,
            endColumnExclusive: 24,
          },
        );
      } catch (error) {
        timeoutError =
          error instanceof Error ? error : new Error(String(error));
      }
      expect(timeoutError?.message).toContain(
        'Timed out waiting for grid condition: the recorded grid contains NEVER PRESENT',
      );
      expect(timeoutError?.message).toContain(
        'Final grid region rows 0-1, columns 0-23',
      );
      expect(timeoutError?.message).toContain('FINAL UNSATISFIED');
      expect(timeoutError?.message).not.toContain('synchronized frame 3');
    } finally {
      await driver.dispose();
    }
  });

  test('rejects when driven input produces no screen change or later frame', async () => {
    const driver = createRecordedStreamDriver(['IDLE GRID']);
    try {
      await driver.awaitGridCondition(
        'the no-op fixture reaches its idle grid',
        (snapshot) => snapshot.findText('IDLE GRID') !== null,
      );
      driver.sendKeys('Right');
      await expect(driver.awaitScreenChange(100)).rejects.toThrow(
        'the driven input produces an observed screen or native caret change',
      );
    } finally {
      await driver.dispose();
    }
  });
});

describe('PtyTestDriver.assertContentInvariantAcrossAction', () => {
  test('requires one region to stay byte-identical while another changes', async () => {
    const driver = createRecordedStreamDriver(
      ['STABLE HEADER\r\nBEFORE', 'STABLE HEADER\r\nAFTER'],
      80,
    );
    try {
      await driver.awaitGridCondition(
        'the content-invariance fixture reaches its baseline',
        (snapshot) => snapshot.findText('BEFORE') !== null,
      );
      const completedSnapshot = await driver.assertContentInvariantAcrossAction(
        {
          invariantRegion: {
            startRow: 0,
            endRowExclusive: 1,
            startColumn: 0,
            endColumnExclusive: 20,
          },
          changedRegion: {
            startRow: 1,
            endRowExclusive: 2,
            startColumn: 0,
            endColumnExclusive: 20,
          },
          actionDescription: 'the recorded action',
          performAction: () => undefined,
        },
      );
      expect(completedSnapshot.findText('AFTER')).not.toBeNull();
    } finally {
      await driver.dispose();
    }
  });

  test('rejects when the required invariant region changes', async () => {
    const driver = createRecordedStreamDriver(
      ['STABLE ONE\r\nBEFORE', 'STABLE TWO\r\nAFTER'],
      80,
    );
    try {
      await driver.awaitGridCondition(
        'the changing-invariant fixture reaches its baseline',
        (snapshot) => snapshot.findText('BEFORE') !== null,
      );
      await expect(
        driver.assertContentInvariantAcrossAction({
          invariantRegion: {
            startRow: 0,
            endRowExclusive: 1,
            startColumn: 0,
            endColumnExclusive: 20,
          },
          changedRegion: {
            startRow: 1,
            endRowExclusive: 2,
            startColumn: 0,
            endColumnExclusive: 20,
          },
          actionDescription: 'the invariant-breaking recorded action',
          performAction: () => undefined,
        }),
      ).rejects.toThrow('Expected byte-identical invariant region');
    } finally {
      await driver.dispose();
    }
  });
});

describe('PtyTestDriver completed-frame observations', () => {
  test('records the exact emulator grid at each frame boundary in one PTY chunk', async () => {
    const driver = createSingleChunkRecordedStreamDriver([
      'FIRST FRAME',
      'SECOND FRAME',
    ]);
    try {
      const completedFrames =
        await driver.collectCompletedFrameObservationsUntil({
          conditionDescription: 'the recorded stream reaches SECOND FRAME',
          condition: (snapshot) => snapshot.findText('SECOND FRAME') !== null,
          performAction: () => undefined,
        });
      expect(completedFrames).toHaveLength(2);
      expect(completedFrames[0]?.completedFrame.completedFrameCount).toBe(1);
      expect(
        completedFrames[0]?.snapshot.findText('FIRST FRAME'),
      ).not.toBeNull();
      expect(completedFrames[1]?.completedFrame.completedFrameCount).toBe(2);
      expect(
        completedFrames[1]?.snapshot.findText('SECOND FRAME'),
      ).not.toBeNull();
    } finally {
      await driver.dispose();
    }
  });

  test('public snapshots do not expose an incomplete synchronized frame', async () => {
    const incompleteFrameText = 'INCOMPLETE NEXT FRAME';
    const recordedStreamProgram = `
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdout.write(${JSON.stringify(recordedFrame('COMPLETE FRAME'))});
      await Bun.sleep(80);
      process.stdout.write(
        ${JSON.stringify(beginSynchronizedOutput + '\x1b[2J\x1b[H' + incompleteFrameText)},
      );
      await Bun.sleep(1_000);
    `;
    const driver = new PtyTestDriver.Class({
      workspaceRoot: process.cwd(),
      repositoryRoot: process.cwd(),
      columns: 40,
      rows: 4,
      command: [process.execPath, '-e', recordedStreamProgram],
    });
    try {
      expect(driver.outputSequenceCount(incompleteFrameText)).toBe(0);
      await driver.awaitGridCondition(
        'the recorded stream reaches its complete frame',
        (snapshot) => snapshot.findText('COMPLETE FRAME') !== null,
      );
      await driver.awaitOutputCondition(
        'the incomplete next frame bytes reach the harness',
        () => driver.outputSequenceCount(incompleteFrameText) === 1,
      );
      const snapshot = await driver.awaitGridCondition(
        'the public grid remains at the last completed synchronized frame',
        (candidate) => candidate.findText('COMPLETE FRAME') !== null,
        100,
      );
      expect(snapshot.findText(incompleteFrameText)).toBeNull();
      expect(driver.completedFrameObservationCount).toBe(1);
    } finally {
      await driver.dispose();
    }
  });

  test('process exit publishes the final terminal state after trailing reset bytes', async () => {
    const recordedStreamProgram = `
      process.stdout.write(${JSON.stringify(recordedFrame('VISIBLE APP FRAME'))});
      await Bun.sleep(80);
      process.stdout.write(${JSON.stringify('\x1b[2J\x1b[H')});
      process.exit(0);
    `;
    const driver = new PtyTestDriver.Class({
      workspaceRoot: process.cwd(),
      repositoryRoot: process.cwd(),
      columns: 40,
      rows: 4,
      command: [process.execPath, '-e', recordedStreamProgram],
    });
    try {
      await driver.awaitGridCondition(
        'the recorded app frame becomes visible',
        (snapshot) => snapshot.findText('VISIBLE APP FRAME') !== null,
      );
      expect(await driver.exitCode()).toBe(0);
      const exitedSnapshot = await driver.awaitGridCondition(
        'the process exit publishes its trailing terminal reset',
        (snapshot) => snapshot.findText('VISIBLE APP FRAME') === null,
      );
      expect(exitedSnapshot.findText('VISIBLE APP FRAME')).toBeNull();
    } finally {
      await driver.dispose();
    }
  });
});

describe('PtyTestDriver.sendKeysAndAwaitGridConditionByteArrival', () => {
  test('timestamps the completed frame that first satisfies the requested grid condition', async () => {
    const driver = createRecordedStreamDriver(
      ['FIRST FRAME', 'SECOND FRAME', 'TARGET FRAME'],
      30,
    );
    try {
      const measurement = await driver.sendKeysAndAwaitGridConditionByteArrival(
        ['Right'],
        'the recorded grid contains TARGET FRAME',
        (snapshot) => snapshot.findText('TARGET FRAME') !== null,
      );
      expect(measurement.completedFrame.completedFrameCount).toBe(3);
      expect(measurement.completedFramesUntilCondition).toBe(3);
      expect(measurement.firstCompletedFrame.completedFrameCount).toBe(1);
      expect(measurement.snapshot.findText('TARGET FRAME')).not.toBeNull();
      expect(measurement.inputToFrameByteArrivalMilliseconds).toBeGreaterThan(
        40,
      );
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

describe('PtyTestDriver child environment', () => {
  // invariant: Harness app homes are complete and isolated (scripts/harness/harness.invariants.md)
  test('a supplied home gets complete HOME and XDG state', async () => {
    const temporaryRoot = mkdtempSync(
      join(tmpdir(), 'invar-pty-environment-test-'),
    );
    const homeDirectory = join(temporaryRoot, 'home');
    const environmentCapturePath = join(temporaryRoot, 'environment.json');
    const recordedStreamProgram = `
      await Bun.write(
        ${JSON.stringify(environmentCapturePath)},
        JSON.stringify({
          HOME: process.env.HOME,
          XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
          XDG_DATA_HOME: process.env.XDG_DATA_HOME,
          XDG_STATE_HOME: process.env.XDG_STATE_HOME,
          XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
          INVAR_TEST_SUPPRESS_BUILT_IN_TASK:
            process.env.INVAR_TEST_SUPPRESS_BUILT_IN_TASK,
          INVAR_TEST_SUPPRESS_FOLDER_OPEN_TASKS:
            process.env.INVAR_TEST_SUPPRESS_FOLDER_OPEN_TASKS,
        }),
      );
      process.stdout.write(${JSON.stringify(recordedFrame('HOME READY'))});
      await Bun.sleep(1_000);
    `;
    const driver = new PtyTestDriver.Class({
      workspaceRoot: process.cwd(),
      repositoryRoot: process.cwd(),
      columns: 40,
      rows: 4,
      homeDirectory,
      command: [process.execPath, '-e', recordedStreamProgram],
    });

    try {
      await driver.awaitGridCondition(
        'the child has captured its isolated user environment',
        (snapshot) => snapshot.findText('HOME READY') !== null,
      );
      expect(JSON.parse(readFileSync(environmentCapturePath, 'utf8'))).toEqual({
        HOME: homeDirectory,
        XDG_CONFIG_HOME: join(homeDirectory, '.config'),
        XDG_DATA_HOME: join(homeDirectory, '.local', 'share'),
        XDG_STATE_HOME: join(homeDirectory, '.local', 'state'),
        XDG_CACHE_HOME: join(homeDirectory, '.cache'),
        INVAR_TEST_SUPPRESS_BUILT_IN_TASK: '1',
        INVAR_TEST_SUPPRESS_FOLDER_OPEN_TASKS: '1',
      });
      for (const directoryPath of [
        join(homeDirectory, '.config', 'invar'),
        join(homeDirectory, '.local', 'share', 'invar'),
        join(homeDirectory, '.local', 'state'),
        join(homeDirectory, '.cache'),
      ]) {
        expect(existsSync(directoryPath)).toBeTrue();
      }
    } finally {
      await driver.dispose();
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});

describe('PtyTestDriver output retention', () => {
  test('retains a bounded tail while streaming clipboard emissions with absolute offsets', async () => {
    const prefix = 'x'.repeat(80);
    const clipboardSequence = `\x1b]52;c;${Buffer.from('tail-independent').toString('base64')}\x07`;
    const driver = createTinyOutputDriver([
      prefix,
      clipboardSequence.slice(0, 5),
      clipboardSequence.slice(5),
    ]);
    try {
      await driver.awaitGridCondition(
        'the tiny-output fixture reaches TINY DONE',
        (snapshot) => snapshot.findText('TINY DONE') !== null,
      );
      expect(driver.recordedOutput().length).toBe(32);
      expect(driver.recordedOutput()).toContain('TINY DONE');
      expect(driver.clipboardEmissions()).toEqual([
        expect.objectContaining({
          startOffset: prefix.length,
          endOffset: prefix.length + clipboardSequence.length,
          decodedText: 'tail-independent',
        }),
      ]);
      expect(() =>
        driver.outputSequenceCount('not registered before overflow'),
      ).toThrow('query the sequence before the buffer overflows');
    } finally {
      await driver.dispose();
    }
  });

  test('counts registered sequences incrementally across chunks without overlap', async () => {
    const driver = createTinyOutputDriver(['aaa', 'a']);
    try {
      expect(driver.outputSequenceCount('aaa')).toBe(0);
      await driver.awaitGridCondition(
        'the incremental-count fixture reaches TINY DONE',
        (snapshot) => snapshot.findText('TINY DONE') !== null,
      );
      expect(driver.outputSequenceCount('aaa')).toBe(1);
    } finally {
      await driver.dispose();
    }
  });

  test('retains the full output stream only when explicitly requested', async () => {
    const prefix = 'full-output-'.repeat(8);
    const driver = createTinyOutputDriver([prefix], true);
    try {
      await driver.awaitGridCondition(
        'the full-output fixture reaches TINY DONE',
        (snapshot) => snapshot.findText('TINY DONE') !== null,
      );
      expect(driver.recordedOutput().length).toBeGreaterThan(32);
      expect(driver.recordedOutput()).toStartWith(prefix);
    } finally {
      await driver.dispose();
    }
  });
});
