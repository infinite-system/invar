import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { TerminalEmulator } from '../../src/modules/terminal/TerminalEmulator';
import { HarnessSmoke } from './HarnessSmoke';
import { HarnessSnapshot, type HarnessSnapshotCell } from './HarnessSnapshot';
import { Drive } from './Drive';

class TestDrive extends Drive.$Class {
  static parsedActions(argumentList: readonly string[]) {
    return this.parseOptions(argumentList).actions;
  }

  static foldControlPosition(snapshot: HarnessSnapshot.Model, text: string) {
    return this.resolveClickTarget(snapshot, {
      kind: 'fold-control',
      text,
    });
  }

  static textPosition(snapshot: HarnessSnapshot.Model, text: string) {
    return this.resolveClickTarget(snapshot, { kind: 'text', text });
  }

  static coordinatePosition(
    snapshot: HarnessSnapshot.Model,
    column: number,
    row: number,
  ) {
    return this.resolveClickTarget(snapshot, {
      kind: 'coordinates',
      column,
      row,
    });
  }

  static async preparedTarget(argumentList: readonly string[]): Promise<{
    workspaceRoot: string;
    filePath: string | null;
    temporaryWorkspaceRoot?: string;
  }> {
    const target = await this.prepareTarget(this.parseOptions(argumentList));
    return {
      workspaceRoot: target.workspaceRoot,
      filePath: target.filePath,
      temporaryWorkspaceRoot: target.temporaryWorkspaceRoot,
    };
  }
}

async function snapshotForRows(
  rows: readonly string[],
  columns = 80,
): Promise<HarnessSnapshot.Model> {
  const emulator = new TerminalEmulator.Class(columns, rows.length);
  emulator.write(rows.join('\r\n'));
  await emulator.flush();
  const copiedCells: HarnessSnapshotCell[] = [];
  for (let row = 0; row < emulator.rows; row++) {
    for (let column = 0; column < emulator.columns; column++) {
      const cell = emulator.cell(row, column);
      if (!cell) throw new Error('Expected terminal emulator cell');
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
  emulator.dispose();
  return snapshot;
}

describe('Drive action completion', () => {
  test('declares canonical chord prefixes frame-silent', () => {
    const actions = TestDrive.parsedActions([
      '--key',
      'Control+k',
      '--key',
      '[',
    ]);
    expect(actions[0]?.completion).toEqual({
      kind: 'frame-silent',
      reason: 'the key is a canonical multi-step chord prefix',
    });
    expect(actions[1]?.completion).toEqual({ kind: 'screen-change' });
  });

  test('does not call a chord prefix silent when it is also a single action', () => {
    const action = TestDrive.parsedActions(['--key', 'Control+x'])[0];
    expect(action?.completion).toEqual({ kind: 'screen-change' });
  });

  test('attaches explicit frame-silent and named conditions to one action', () => {
    const frameSilentAction = TestDrive.parsedActions([
      '--key',
      'Escape',
      '--frame-silent',
    ])[0];
    expect(frameSilentAction?.completion.kind).toBe('frame-silent');

    const textAction = TestDrive.parsedActions([
      '--key',
      'Control+p',
      '--wait-for-text',
      'Go to File',
    ])[0];
    expect(textAction?.completion).toEqual({
      kind: 'grid-text',
      text: 'Go to File',
    });

    const statusAction = TestDrive.parsedActions([
      '--click',
      'text=Sidebar width',
      '--wait-for-status',
      'foldedLineStarts=[1]',
    ])[0];
    expect(statusAction?.completion).toEqual({
      kind: 'status',
      fieldName: 'foldedLineStarts',
      expectedValue: [1],
    });
  });

  test('rejects a completion option with no preceding action', () => {
    expect(() => TestDrive.parsedActions(['--wait-for-text', 'NEVER'])).toThrow(
      'must follow --key, --wheel, or --click',
    );
  });
});

describe('Drive role and text click targeting', () => {
  test('moves a fold-control target with its visible header', async () => {
    const baselineSnapshot = await snapshotForRows(['    2⌄ │ "group0000": {']);
    const shiftedSnapshot = await snapshotForRows([
      '             2⌄ │ "group0000": {',
    ]);

    expect(
      TestDrive.foldControlPosition(baselineSnapshot, '"group0000": {'),
    ).toEqual({ column: 5, row: 0 });
    expect(
      TestDrive.foldControlPosition(shiftedSnapshot, '"group0000": {'),
    ).toEqual({ column: 14, row: 0 });
  });

  test('resolves visible text while raw coordinates remain literal', async () => {
    const snapshot = await snapshotForRows(['      Sidebar width']);
    expect(TestDrive.textPosition(snapshot, 'Sidebar width')).toEqual({
      column: 6,
      row: 0,
    });
    expect(TestDrive.coordinatePosition(snapshot, 2, 0)).toEqual({
      column: 2,
      row: 0,
    });
  });

  test('rejects text that has no fold-control role before it', async () => {
    const snapshot = await snapshotForRows(['      "group0000": {']);
    expect(() =>
      TestDrive.foldControlPosition(snapshot, '"group0000": {'),
    ).toThrow('No fold-control role precedes visible text');
  });
});

describe('Drive temporary workspaces', () => {
  test('creates scale fixtures outside the repository and marks them for cleanup', async () => {
    const target = await TestDrive.preparedTarget(['--size', '10']);
    try {
      expect(target.workspaceRoot.startsWith(resolve(tmpdir()))).toBe(true);
      expect(target.workspaceRoot.includes('/tmp/drive/')).toBe(false);
      expect(target.temporaryWorkspaceRoot).toBe(target.workspaceRoot);
      expect(target.filePath).not.toBeNull();
      expect(existsSync(target.filePath ?? '')).toBe(true);
    } finally {
      await HarnessSmoke.Class.removeTemporaryDirectory(target.workspaceRoot);
    }
  });
});
