import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { TerminalEmulator } from '../../src/modules/terminal/TerminalEmulator';
import { HarnessSmoke } from './HarnessSmoke';
import { HarnessSnapshot, type HarnessSnapshotCell } from './HarnessSnapshot';
import { Drive } from './Drive';
import type { PtyTestDriver } from './PtyTestDriver';

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

  static pendingStatusNames(
    status: Readonly<Record<string, unknown>>,
    snapshot?: HarnessSnapshot.Model,
  ): readonly string[] {
    return this.pendingSettledStatusNames(status, snapshot);
  }

  static async performParsedAction(
    driver: PtyTestDriver.Model,
    statusPath: string,
    argumentList: readonly string[],
  ): Promise<void> {
    const action = this.parseOptions(argumentList).actions[0];
    if (!action) throw new Error('The test drive requires one action');
    await this.performAction(driver, statusPath, action, 80, 4, 1_000);
  }

  static publishedStatus(output: string): Readonly<Record<string, unknown>> {
    const marker = '--- published status/probe keys';
    const markerIndex = output.lastIndexOf(marker);
    if (markerIndex < 0) throw new Error('Drive output has no status marker');
    const status: Record<string, unknown> = {};
    for (const line of output.slice(markerIndex).split('\n').slice(1)) {
      const separatorIndex = line.indexOf('=');
      if (separatorIndex <= 0) continue;
      status[line.slice(0, separatorIndex)] = JSON.parse(
        line.slice(separatorIndex + 1),
      );
    }
    return status;
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

  test('holds status completion until the action paints its click target', async () => {
    const temporaryDirectory = mkdtempSync(
      join(tmpdir(), 'invar-drive-status-paint-test-'),
    );
    const statusPath = join(temporaryDirectory, 'status.json');
    const hiddenTargetSnapshot = await snapshotForRows(['Settings opening']);
    const paintedTargetSnapshot = await snapshotForRows([
      'Mirror activity bar on right',
    ]);
    let currentSnapshot = hiddenTargetSnapshot;
    let screenChangeWaitStarted = false;
    let actionCompleted = false;
    let releasePaint: () => void = () => {};
    const paintRelease = new Promise<void>((resolvePaint) => {
      releasePaint = resolvePaint;
    });
    await Bun.write(statusPath, JSON.stringify({ settingsOpen: false }));
    const driver = {
      snapshot: () => currentSnapshot,
      sendKeys: () => {
        void Bun.write(statusPath, JSON.stringify({ settingsOpen: true }));
      },
      awaitScreenChange: async () => {
        screenChangeWaitStarted = true;
        await paintRelease;
      },
    } as unknown as PtyTestDriver.Model;

    try {
      const actionCompletion = TestDrive.performParsedAction(
        driver,
        statusPath,
        ['--key', 'Control+,', '--wait-for-status', 'settingsOpen=true'],
      ).then(() => {
        actionCompleted = true;
      });
      const observationDeadline = performance.now() + 1_000;
      while (
        !screenChangeWaitStarted &&
        !actionCompleted &&
        performance.now() < observationDeadline
      ) {
        await Bun.sleep(1);
      }

      expect(screenChangeWaitStarted).toBeTrue();
      expect(actionCompleted).toBeFalse();
      expect(() =>
        TestDrive.textPosition(currentSnapshot, 'Mirror activity bar on right'),
      ).toThrow('Click target text is not visible');

      currentSnapshot = paintedTargetSnapshot;
      releasePaint();
      await actionCompletion;
      expect(
        TestDrive.textPosition(currentSnapshot, 'Mirror activity bar on right'),
      ).toEqual({ column: 0, row: 0 });
    } finally {
      await HarnessSmoke.Class.removeTemporaryDirectory(temporaryDirectory);
    }
  });
});

describe('Drive settled observations', () => {
  test('names pending Markdown and observed structure work', () => {
    expect(
      TestDrive.pendingStatusNames({
        activeBuffer: '/tmp/README.md',
        bufferRevision: 4,
        markdownActive: true,
        markdownParsing: true,
        markdownRevision: 3,
        structureStatus: 'no-document',
        rightDockActiveContent: 'structure',
        rightDockVisible: true,
      }),
    ).toEqual([
      'markdownParsing=true',
      'markdownRevision differs from bufferRevision',
      'structureStatus has not refreshed the active file',
    ]);
    expect(
      TestDrive.pendingStatusNames({
        activeBuffer: '/tmp/README.md',
        bufferRevision: 4,
        markdownActive: true,
        markdownParsing: false,
        markdownRevision: 4,
        structureStatus: 'ready',
        rightDockActiveContent: 'structure',
        rightDockVisible: true,
      }),
    ).toEqual([]);
    expect(
      TestDrive.pendingStatusNames({
        activeBuffer: null,
        structureStatus: 'no-document',
      }),
    ).toEqual([]);
  });

  test('settles hidden unsupported structure but holds loading work', () => {
    expect(
      TestDrive.pendingStatusNames({
        activeBuffer: '/tmp/notes.txt',
        rightDockActiveContent: 'structure',
        rightDockVisible: false,
        structureStatus: 'no-document',
      }),
    ).toEqual([]);
    expect(
      TestDrive.pendingStatusNames({
        activeBuffer: '/tmp/source.ts',
        primaryDockVisible: true,
        sidebarView: 'structure',
        structureStatus: 'no-document',
      }),
    ).toEqual(['structureStatus has not refreshed the active file']);
    expect(
      TestDrive.pendingStatusNames({
        activeBuffer: '/tmp/source.ts',
        rightDockActiveContent: 'structure',
        rightDockVisible: true,
        structureStatus: 'loading',
      }),
    ).toEqual(['structureStatus has not refreshed the active file']);
    expect(
      TestDrive.pendingStatusNames({
        activeBuffer: '/tmp/source.ts',
        rightDockActiveContent: 'structure',
        rightDockVisible: false,
        structureStatus: 'loading',
      }),
    ).toEqual(['structureStatus has not refreshed the active file']);
  });

  test('holds ready structure status until the active file paints', async () => {
    const staleSnapshot = await snapshotForRows(['No file is open.']);
    const paintedSnapshot = await snapshotForRows([
      '⌄ ▤ Orchestration Lessons',
    ]);
    const readyStatus = {
      activeBuffer: '/tmp/project.conductor.archive.md',
      rightDockActiveContent: 'structure',
      rightDockVisible: true,
      structureRows: 110,
      structureStatus: 'ready',
    };

    expect(TestDrive.pendingStatusNames(readyStatus, staleSnapshot)).toEqual([
      'structure pane has not painted the active file',
    ]);
    expect(TestDrive.pendingStatusNames(readyStatus, paintedSnapshot)).toEqual(
      [],
    );
  });

  test('prints a large Markdown file only after preview and structure work settle', async () => {
    const repositoryRoot = resolve(import.meta.dir, '../..');
    const driveProcess = Bun.spawn(
      [
        process.execPath,
        resolve(import.meta.dir, 'Drive.ts'),
        '--open',
        resolve(repositoryRoot, 'project.conductor.archive.md'),
        '--key',
        'Control+Shift+v',
        '--wait-for-status',
        'markdownParsing=false',
      ],
      {
        cwd: repositoryRoot,
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    const [output, errorOutput, exitCode] = await Promise.all([
      new Response(driveProcess.stdout).text(),
      new Response(driveProcess.stderr).text(),
      driveProcess.exited,
    ]);
    if (exitCode !== 0) {
      throw new Error(`Drive exited ${exitCode}\n${errorOutput}\n${output}`);
    }

    const status = TestDrive.publishedStatus(output);
    expect(output).not.toContain('Parsing Markdown…');
    expect(output).not.toContain('No file is open.');
    expect(status.markdownParsing).toBe(false);
    expect(status.markdownRevision).toBe(status.bufferRevision);
    expect(status.structureStatus).toBe('ready');
    expect(status.structureRequests).toBe(1);
  }, 30_000);
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
