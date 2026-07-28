import { expect, test } from 'bun:test';
import {
  mkdtempSync as makeTemporaryDirectorySync,
  rmSync as removeSync,
} from 'node:fs';
import { tmpdir as temporaryDirectory } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from '../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../scripts/harness/PtyTestDriver';

test('bun run start forwards a supplied workspace path to Invar', async () => {
  const requestedWorkspaceRoot = makeTemporaryDirectorySync(
    join(temporaryDirectory(), 'invar-start-script-workspace-'),
  );
  const homeDirectory = makeTemporaryDirectorySync(
    join(temporaryDirectory(), 'invar-start-script-home-'),
  );
  const statusPath = join(homeDirectory, 'status.json');
  await Bun.write(
    join(requestedWorkspaceRoot, 'requested-workspace.txt'),
    'requested\n',
  );
  const driver = new PtyTestDriver.Class({
    workspaceRoot: requestedWorkspaceRoot,
    repositoryRoot: process.cwd(),
    homeDirectory,
    environment: { TUI_STATUS_PATH: statusPath },
    command: [process.execPath, 'run', 'start', requestedWorkspaceRoot],
  });

  try {
    const status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'bun run start to publish an active workspace path',
      (candidate) =>
        candidate.ready === true &&
        typeof candidate.activeWorkspaceRoot === 'string',
    );
    expect(status.activeWorkspaceRoot).toBe(requestedWorkspaceRoot);
  } finally {
    await driver.dispose();
    removeSync(requestedWorkspaceRoot, { recursive: true, force: true });
    removeSync(homeDirectory, { recursive: true, force: true });
  }
});
