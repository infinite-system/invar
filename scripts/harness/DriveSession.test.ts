import { expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DriveScriptRunner, DriveSession } from './DriveSession';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

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
