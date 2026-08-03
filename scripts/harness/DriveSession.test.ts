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
