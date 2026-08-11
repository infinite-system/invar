import { expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DriveScriptRunner, DriveSession } from './DriveSession';
import type { HarnessSnapshotCell } from './HarnessSnapshot';
import { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

class $DriveSessionTest {
  static async awaitManifest(serverDirectory: string): Promise<void> {
    const manifestPath = join(serverDirectory, 'server.json');
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (existsSync(manifestPath)) return;
      await new Promise((resolveWait) => setTimeout(resolveWait, 15));
    }
    throw new Error(`Drive server did not publish ${manifestPath}`);
  }

  static processIdentifier(output: string): number {
    const processIdentifierText = output
      .trim()
      .split('\n')
      .findLast((line) => /^\d+$/.test(line.trim()));
    const processIdentifier = Number(processIdentifierText);
    if (!Number.isSafeInteger(processIdentifier) || processIdentifier < 1) {
      throw new Error(`Drive attach returned an invalid app pid: ${output}`);
    }
    return processIdentifier;
  }

  static processIsLive(processIdentifier: number): boolean {
    try {
      process.kill(processIdentifier, 0);
      return true;
    } catch {
      return false;
    }
  }

  static async awaitProcessStopped(processIdentifier: number): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (!this.processIsLive(processIdentifier)) return;
      await new Promise((resolveWait) => setTimeout(resolveWait, 15));
    }
    throw new Error(`App pid ${processIdentifier} did not exit`);
  }
}

/** A real HarnessSnapshot built from plain text rows, so scope tests exercise
 *  the production findTextOccurrences instead of a re-implementation. */
function snapshotFromRows(rowTexts: readonly string[]): HarnessSnapshot.Model {
  const columns = Math.max(...rowTexts.map((rowText) => rowText.length));
  const cells: HarnessSnapshotCell[] = [];
  for (let row = 0; row < rowTexts.length; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      cells.push({
        characters: rowTexts[row]?.[column] ?? ' ',
        row,
        column,
        width: 1,
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
      });
    }
  }
  return new HarnessSnapshot.Class(columns, rowTexts.length, 0, 0, cells);
}

/** A driver double whose grid is a fixed snapshot: clickText resolution runs
 *  against the real snapshot code, and every mouse byte lands in `events`. */
function clickRecordingDriver(
  rowTexts: readonly string[],
  events: { kind: string; column: number; row: number }[],
): never {
  const snapshot = snapshotFromRows(rowTexts);
  const recordEvent = (event: (typeof events)[number]) => {
    events.push(event);
  };
  return {
    snapshot: () => snapshot,
    awaitGridCondition: async (
      description: string,
      predicate: (candidate: HarnessSnapshot.Model) => boolean,
    ) => {
      if (!predicate(snapshot)) {
        throw new Error(`condition not satisfied: ${description}`);
      }
      return snapshot;
    },
    sendMouse: recordEvent,
    sendMouseWithoutFrameExpectation: recordEvent,
    completedFrameObservationCount: 0,
  } as never;
}

test('clickText unscoped clicks the FIRST of two identical texts', async () => {
  const events: { kind: string; column: number; row: number }[] = [];
  const session = new DriveSession.Class(
    clickRecordingDriver(['  note.txt', '', '  note.txt  '], events),
    '/tmp/unused',
  ).silence();
  await session.clickText('note.txt');
  const press = events.find((event) => event.kind === 'press');
  expect(press).toMatchObject({ column: 2, row: 0 });
});

test('clickText occurrence scope clicks the Nth twin, same-row twins included', async () => {
  const events: { kind: string; column: number; row: number }[] = [];
  const session = new DriveSession.Class(
    clickRecordingDriver(['❯ one ❯ two', '❯ three'], events),
    '/tmp/unused',
  ).silence();
  await session.clickText('❯', 0, {}, { occurrence: 2 });
  expect(events.find((event) => event.kind === 'press')).toMatchObject({
    column: 6,
    row: 0,
  });
  events.length = 0;
  await session.clickText('❯', 0, {}, { occurrence: 3 });
  expect(events.find((event) => event.kind === 'press')).toMatchObject({
    column: 0,
    row: 1,
  });
});

test('clickText band scope skips an identical glyph outside the band', async () => {
  const events: { kind: string; column: number; row: number }[] = [];
  const session = new DriveSession.Class(
    clickRecordingDriver(
      ['top ❯ chrome', 'editor ❯ body', 'status ❯ row'],
      events,
    ),
    '/tmp/unused',
  ).silence();
  await session.clickText('❯', 0, {}, { band: 'statusRow' });
  expect(events.find((event) => event.kind === 'press')).toMatchObject({
    column: 7,
    row: 2,
  });
  events.length = 0;
  await session.clickText('❯', 0, {}, { band: 'firstRow' });
  expect(events.find((event) => event.kind === 'press')).toMatchObject({
    column: 4,
    row: 0,
  });
});

test('clickText rectangle scope composes with occurrence', async () => {
  const events: { kind: string; column: number; row: number }[] = [];
  const session = new DriveSession.Class(
    clickRecordingDriver(['ab ab ab', 'ab ab ab'], events),
    '/tmp/unused',
  ).silence();
  await session.clickText(
    'ab',
    0,
    {},
    { rectangle: { left: 3, top: 1, width: 5, height: 1 }, occurrence: 2 },
  );
  expect(events.find((event) => event.kind === 'press')).toMatchObject({
    column: 6,
    row: 1,
  });
});

test('clickText scope with a missing Nth twin fails loudly, never first-match', async () => {
  const events: { kind: string; column: number; row: number }[] = [];
  const session = new DriveSession.Class(
    clickRecordingDriver(['only one ❯ here'], events),
    '/tmp/unused',
  ).silence();
  session.clickText('❯', 0, {}, { occurrence: 2 });
  await expect(session.flush()).rejects.toThrow('match #2');
  expect(events).toHaveLength(0);
});

test('clickText scope shapes are refused at call time', () => {
  const session = new DriveSession.Class({} as never, '/tmp/unused').silence();
  expect(() =>
    session.clickText(
      'x',
      0,
      {},
      {
        band: 'statusRow',
        rectangle: { left: 0, top: 0, width: 1, height: 1 },
      },
    ),
  ).toThrow('both a band and a rectangle');
  expect(() =>
    session.clickText('x', 0, {}, { band: 'bottomRow' as never }),
  ).toThrow('is unknown');
  expect(() => session.clickText('x', 0, {}, { occurrence: 0 })).toThrow(
    '1-based integer',
  );
  expect(() => session.clickText('x', 0, {}, { occurrence: 1.5 })).toThrow(
    '1-based integer',
  );
});

test('paste sends the text as one framed gesture through the driver', async () => {
  const pastedTexts: string[] = [];
  const fakeDriver = {
    sendPaste: (text: string) => {
      pastedTexts.push(text);
    },
    completedFrameObservationCount: 0,
  } as never;
  const session = new DriveSession.Class(fakeDriver, '/tmp/unused').silence();
  await session.paste('line one\nline two');
  expect(pastedTexts).toEqual(['line one\nline two']);
});

test('drag presses, glides pressed, and releases — real intermediate drag moves', async () => {
  const mouseEvents: {
    kind: string;
    column: number;
    row: number;
    button?: string;
    shift?: boolean;
  }[] = [];
  const recordEvent = (event: (typeof mouseEvents)[number]) => {
    mouseEvents.push(event);
  };
  const fakeDriver = {
    snapshot: () => ({ columns: 100, rows: 40 }),
    sendMouse: recordEvent,
    sendMouseWithoutFrameExpectation: recordEvent,
  } as never;
  const session = new DriveSession.Class(fakeDriver, '/tmp/unused').silence();

  await session.drag(10, 5, 30, 9, { shift: true });

  const pressIndex = mouseEvents.findIndex((event) => event.kind === 'press');
  const releaseIndex = mouseEvents.findIndex(
    (event) => event.kind === 'release',
  );
  expect(pressIndex).toBeGreaterThan(-1);
  expect(releaseIndex).toBe(mouseEvents.length - 1);
  expect(mouseEvents[pressIndex]).toMatchObject({
    kind: 'press',
    column: 10,
    row: 5,
    button: 'left',
    shift: true,
  });
  expect(mouseEvents[releaseIndex]).toMatchObject({
    kind: 'release',
    column: 30,
    row: 9,
    button: 'left',
    shift: true,
  });
  const pressedMoves = mouseEvents.slice(pressIndex + 1, releaseIndex);
  expect(pressedMoves.length).toBeGreaterThan(0);
  for (const pressedMove of pressedMoves) {
    expect(pressedMove).toMatchObject({
      kind: 'move',
      button: 'left',
      shift: true,
    });
  }
  expect(pressedMoves.at(-1)).toMatchObject({ column: 30, row: 9 });
});

test('drag refuses a target outside the live screen', async () => {
  const fakeDriver = {
    snapshot: () => ({ columns: 100, rows: 40 }),
    sendMouse: () => {},
    sendMouseWithoutFrameExpectation: () => {},
  } as never;
  const session = new DriveSession.Class(fakeDriver, '/tmp/unused').silence();
  await expect(session.flush()).resolves.toBeUndefined();
  session.drag(10, 5, 150, 9);
  await expect(session.flush()).rejects.toThrow('outside the 100x40 screen');
});

test('showScreen rejects non-integer shapes at call time', () => {
  const session = new DriveSession.Class({} as never, '/tmp/unused').silence();
  expect(() => session.showScreen([5] as never)).toThrow(
    'showScreen takes two integers',
  );
  expect(() => session.showScreen(2.5)).toThrow(
    'showScreen takes two integers',
  );
});

test('showScreen rejects an empty or out-of-range band loudly', async () => {
  const fakeDriver = {
    snapshot: () => ({
      columns: 80,
      rows: 24,
      rowText: (row: number) => `row-${row}`,
    }),
  } as never;
  const session = new DriveSession.Class(fakeDriver, '/tmp/unused').silence();
  session.showScreen(5, 3);
  await expect(session.flush()).rejects.toThrow('band 5..3 is empty');
  const outOfRange = new DriveSession.Class(
    fakeDriver,
    '/tmp/unused',
  ).silence();
  outOfRange.showScreen(99);
  await expect(outOfRange.flush()).rejects.toThrow('outside the 24-row screen');
});

test('logTail and showLog read only this instance through the provenance guard', async () => {
  const logPath = join(tmpdir(), `invar-drive-log-${crypto.randomUUID()}.log`);
  await Bun.write(
    logPath,
    [
      '2026-08-04T00:00:00.000Z [info] [instance=harness-own] first',
      '2026-08-04T00:00:01.000Z [info] [instance=harness-foreign] intruder',
      '2026-08-04T00:00:02.000Z [info] [instance=harness-own] second',
      'unstamped leftover line',
      '',
    ].join('\n'),
  );
  const fakeDriver = {
    diagnosticLogPath: logPath,
    diagnosticLogInstance: 'harness-own',
  } as never;
  const session = new DriveSession.Class(fakeDriver, '/tmp/unused').silence();
  try {
    expect(session.diagnosticLogPath).toBe(logPath);
    const tail = await session.logTail(1);
    expect(tail).toEqual([
      '2026-08-04T00:00:02.000Z [info] [instance=harness-own] second',
    ]);
    const fullTail = await session.logTail();
    expect(fullTail).toHaveLength(2);
    expect(fullTail.join('\n')).not.toContain('intruder');

    const outputLines: string[] = [];
    const originalLog = console.log;
    console.log = (...parts: unknown[]) => {
      outputLines.push(parts.map((part) => String(part)).join(' '));
    };
    try {
      await session.showLog(5);
    } finally {
      console.log = originalLog;
    }
    expect(outputLines[0]).toContain(logPath);
    expect(outputLines.join('\n')).toContain('second');
    expect(outputLines.join('\n')).not.toContain('intruder');
  } finally {
    rmSync(logPath, { force: true });
  }
});

test('--show parses fields and appends one show step to the probe', () => {
  expect(
    DriveScriptRunner.Class.parseShowFields(' panelVisible, frame '),
  ).toEqual(['panelVisible', 'frame']);
  expect(() => DriveScriptRunner.Class.parseShowFields(' , ')).toThrow(
    '--show needs FIELD[,FIELD]',
  );
  expect(
    DriveScriptRunner.Class.showSnippet(['panelVisible', 'geometry.width']),
  ).toBe('\n;app.show("panelVisible", "geometry.width");');
});

test('show accepts a label without treating it as a status path', async () => {
  const statusPath = `/tmp/invar-drive-show-${crypto.randomUUID()}.json`;
  await Bun.write(
    statusPath,
    JSON.stringify({ frame: 12, renderQuiescent: true }),
  );
  const outputLines: string[] = [];
  const originalLog = console.log;
  console.log = (...parts: unknown[]) => {
    outputLines.push(parts.map((part) => String(part)).join(' '));
  };
  try {
    const session = new DriveSession.Class({} as never, statusPath).silence();
    await session.show('settled checkpoint', ['frame', 'renderQuiescent']);
    expect(outputLines).toEqual([
      '\n== settled checkpoint ==',
      '  frame = 12',
      '  renderQuiescent = true',
    ]);
  } finally {
    console.log = originalLog;
    rmSync(statusPath, { force: true });
  }
});

test('mirror forwards hosting terminal resize to the driven app', async () => {
  const workspaceRoot = mkdtempSync(
    join(tmpdir(), 'invar-drive-mirror-workspace-'),
  );
  const homeDirectory = mkdtempSync(
    join(tmpdir(), 'invar-drive-mirror-host-home-'),
  );
  const serverDirectory = mkdtempSync(
    join(tmpdir(), 'invar-drive-mirror-server-'),
  );
  const serverManifestPath = join(serverDirectory, 'server.json');
  const driver = new PtyTestDriver.Class({
    workspaceRoot,
    homeDirectory,
    columns: 100,
    rows: 30,
    command: [
      process.execPath,
      resolve(import.meta.dir, 'DriveSession.ts'),
      '--serve',
      '--mirror',
      '--open',
      workspaceRoot,
      '--server-dir',
      serverDirectory,
    ],
  });
  try {
    await driver.awaitGridCondition(
      'the mirrored drive server to publish its manifest',
      () => existsSync(serverManifestPath),
    );
    const manifest = JSON.parse(readFileSync(serverManifestPath, 'utf8')) as {
      statusPath: string;
    };
    await HarnessSmoke.Class.awaitStatus(
      driver,
      manifest.statusPath,
      'the mirrored app to match the initial hosting terminal size',
      (status) => status.width === 100 && status.height === 30,
    );

    driver.resize(140, 45);

    await HarnessSmoke.Class.awaitStatus(
      driver,
      manifest.statusPath,
      'the mirrored app to match the resized hosting terminal',
      (status) => status.width === 140 && status.height === 45,
    );
    expect(driver.snapshot().columns).toBe(140);
    expect(driver.snapshot().rows).toBe(45);
    await DriveScriptRunner.Class.attach({
      source: '',
      stop: true,
      serverDirectory,
    });
    expect(await driver.exitCode()).toBe(0);
  } finally {
    await driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(workspaceRoot);
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
    await HarnessSmoke.Class.removeTemporaryDirectory(serverDirectory);
  }
}, 30_000);

test('reload keeps the current app on boot failure and releases it after a successful swap', async () => {
  const scratchRoot = mkdtempSync(join(tmpdir(), 'invar-drive-reload-'));
  const workspaceRoot = join(scratchRoot, 'workspace');
  const homeDirectory = join(scratchRoot, 'home');
  const serverDirectory = join(scratchRoot, 'server');
  const heldCacheDirectory = join(scratchRoot, 'held-cache');
  for (const directoryPath of [workspaceRoot, homeDirectory, serverDirectory]) {
    mkdirSync(directoryPath, { recursive: true });
  }
  const serverProcess = Bun.spawn({
    cmd: [
      process.execPath,
      resolve(import.meta.dir, 'DriveSession.ts'),
      '--serve',
      '--open',
      workspaceRoot,
      '--home',
      homeDirectory,
      '--server-dir',
      serverDirectory,
    ],
    cwd: resolve(import.meta.dir, '../..'),
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
  });
  let homeDirectoryIsWritable = true;
  let cacheDirectoryIsHeld = false;
  try {
    await $DriveSessionTest.awaitManifest(serverDirectory);
    const originalProcessIdentifier = $DriveSessionTest.processIdentifier(
      await DriveScriptRunner.Class.attach({
        source: 'console.log(driver.processId)',
        serverDirectory,
      }),
    );

    renameSync(join(homeDirectory, '.cache'), heldCacheDirectory);
    cacheDirectoryIsHeld = true;
    chmodSync(homeDirectory, 0o500);
    homeDirectoryIsWritable = false;
    let reloadFailure = '';
    try {
      await DriveScriptRunner.Class.attach({
        source: '',
        reload: true,
        serverDirectory,
      });
    } catch (thrown) {
      reloadFailure = thrown instanceof Error ? thrown.message : String(thrown);
    } finally {
      chmodSync(homeDirectory, 0o700);
      homeDirectoryIsWritable = true;
      renameSync(heldCacheDirectory, join(homeDirectory, '.cache'));
      cacheDirectoryIsHeld = false;
    }
    expect(reloadFailure).toContain('EACCES');

    const survivingProcessIdentifier = $DriveSessionTest.processIdentifier(
      await DriveScriptRunner.Class.attach({
        source:
          `await app.key('Control+p').waitForStatus('quickOpenOpen', true);` +
          `console.log(driver.processId);`,
        serverDirectory,
      }),
    );
    expect(survivingProcessIdentifier).toBe(originalProcessIdentifier);

    const reloadOutput = await DriveScriptRunner.Class.attach({
      source: '',
      reload: true,
      serverDirectory,
    });
    expect(reloadOutput).toContain('drive-server: reloaded');
    const replacementProcessIdentifier = $DriveSessionTest.processIdentifier(
      await DriveScriptRunner.Class.attach({
        source: 'console.log(driver.processId)',
        serverDirectory,
      }),
    );
    expect(replacementProcessIdentifier).not.toBe(originalProcessIdentifier);
    expect(
      $DriveSessionTest.processIsLive(originalProcessIdentifier),
    ).toBeFalse();
    expect(
      $DriveSessionTest.processIsLive(replacementProcessIdentifier),
    ).toBeTrue();

    await DriveScriptRunner.Class.attach({
      source: '',
      stop: true,
      serverDirectory,
    });
    await $DriveSessionTest.awaitProcessStopped(replacementProcessIdentifier);
    if ($DriveSessionTest.processIsLive(serverProcess.pid)) {
      serverProcess.kill();
    }
    await serverProcess.exited;
  } finally {
    if (!homeDirectoryIsWritable) chmodSync(homeDirectory, 0o700);
    if (cacheDirectoryIsHeld && !existsSync(join(homeDirectory, '.cache'))) {
      renameSync(heldCacheDirectory, join(homeDirectory, '.cache'));
    }
    if ($DriveSessionTest.processIsLive(serverProcess.pid)) {
      try {
        await DriveScriptRunner.Class.attach({
          source: '',
          stop: true,
          serverDirectory,
        });
      } catch {
        serverProcess.kill();
      }
      if ($DriveSessionTest.processIsLive(serverProcess.pid)) {
        serverProcess.kill();
      }
      await serverProcess.exited;
    }
    await HarnessSmoke.Class.removeTemporaryDirectory(scratchRoot);
  }
}, 60_000);

test('reload honors --size by rebuilding the fixture, and a plain reload keeps it', async () => {
  const serverDirectory = mkdtempSync(
    join(tmpdir(), 'invar-drive-size-reload-'),
  );
  const serverProcess = Bun.spawn({
    cmd: [
      process.execPath,
      resolve(import.meta.dir, 'DriveSession.ts'),
      '--serve',
      '--size',
      '30',
      '--server-dir',
      serverDirectory,
    ],
    cwd: resolve(import.meta.dir, '../..'),
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
  });
  try {
    await $DriveSessionTest.awaitManifest(serverDirectory);
    await DriveScriptRunner.Class.attach({
      source: `await app.waitForText('scale-30.txt');`,
      serverDirectory,
    });

    const reloadOutput = await DriveScriptRunner.Class.attach({
      source: '',
      reload: true,
      reloadFixtureSize: 10,
      serverDirectory,
    });
    expect(reloadOutput).toContain('fixture scale-10.txt');
    await DriveScriptRunner.Class.attach({
      source:
        `await app.waitForText('scale-10.txt');` +
        `const screen = await app.screen();` +
        `if (screen.findText('scale-30.txt') !== null) {` +
        `  throw new Error('the old 30-line fixture is still on screen');` +
        `}`,
      serverDirectory,
    });

    // A plain reload afterwards keeps serving the CURRENT (10-line) fixture.
    const plainReloadOutput = await DriveScriptRunner.Class.attach({
      source: '',
      reload: true,
      serverDirectory,
    });
    expect(plainReloadOutput).toContain('drive-server: reloaded');
    await DriveScriptRunner.Class.attach({
      source: `await app.waitForText('scale-10.txt');`,
      serverDirectory,
    });
  } finally {
    if ($DriveSessionTest.processIsLive(serverProcess.pid)) {
      try {
        await DriveScriptRunner.Class.attach({
          source: '',
          stop: true,
          serverDirectory,
        });
      } catch {
        serverProcess.kill();
      }
      if ($DriveSessionTest.processIsLive(serverProcess.pid)) {
        serverProcess.kill();
      }
      await serverProcess.exited;
    }
    await HarnessSmoke.Class.removeTemporaryDirectory(serverDirectory);
  }
}, 90_000);

test('attach-only flags refuse --open and --size instead of silently ignoring them', async () => {
  await expect(
    DriveScriptRunner.Class.main(['--attach', '', '--size', '5']),
  ).rejects.toThrow('--size does nothing');
  await expect(
    DriveScriptRunner.Class.main(['--stop', '--size', '5']),
  ).rejects.toThrow('--size does nothing');
  await expect(
    DriveScriptRunner.Class.main(['--reload', '--open', '/tmp']),
  ).rejects.toThrow('--open does nothing');
});
