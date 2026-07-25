#!/usr/bin/env bun
// Byte-level PTY port of GitWatcher wiring, including external nested changes and the untracked
// symlink-to-directory EISDIR regression.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdirSync, mkdtempSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

function initializeRepository(repositoryRoot: string): void {
  HarnessSmoke.Class.runGit(repositoryRoot, ['init', '-q']);
  HarnessSmoke.Class.runGit(repositoryRoot, ['add', '-A']);
  HarnessSmoke.Class.runGit(repositoryRoot, [
    '-c',
    'user.email=a@b.c',
    '-c',
    'user.name=x',
    'commit',
    '-qm',
    'init',
  ]);
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-git-watch-harness-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-git-watch-harness-home-'));
const statusPath = join(homeDirectory, 'status.json');
mkdirSync(join(fixtureRoot, 'src'));
await Bun.write(join(fixtureRoot, 'src', 'nested.ts'), 'a\n');
await Bun.write(join(fixtureRoot, 'root.txt'), 'root\n');
await Bun.write(join(fixtureRoot, 'src', 'doomed.ts'), 'gone\n');
initializeRepository(fixtureRoot);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});
let directoryDriver: PtyTestDriver.Model | null = null;
let directoryFixtureRoot: string | null = null;
let symlinkTargetRoot: string | null = null;

try {
  console.log('== harness git-watch: clean repository starts at zero changes ==');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('root.txt') !== null, 15_000);
  driver.sendKeys('Control+g');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.focus === 'git' && status.gitChangedCount === 0",
    (status) => status.focus === 'git' && status.gitChangedCount === 0,
  );
  HarnessSmoke.Class.pass('clean repo, 0 changes');

  console.log('== harness git-watch: external nested changes arrive without input ==');
  await Bun.write(join(fixtureRoot, 'src', 'nested.ts'), 'a\nEXTERNALLY MODIFIED\n');
  await Bun.write(join(fixtureRoot, 'src', 'added.ts'), 'brand new\n');
  unlinkSync(join(fixtureRoot, 'src', 'doomed.ts'));
  const changedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: Number(status.gitChangedCount) >= 3",
    (status) => Number(status.gitChangedCount) >= 3,
    8_000,
  );
  HarnessSmoke.Class.pass(
    `external nested modify+add+delete reflected without input (0 -> ${changedStatus.gitChangedCount})`,
  );

  console.log('== harness git-watch: reverting external changes clears the panel ==');
  HarnessSmoke.Class.runGit(fixtureRoot, ['checkout', '-q', '--', 'src/nested.ts', 'src/doomed.ts']);
  unlinkSync(join(fixtureRoot, 'src', 'added.ts'));
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.gitChangedCount === 0",
    (status) => status.gitChangedCount === 0,
    7_000,
  );
  HarnessSmoke.Class.pass('panel returned to 0 after external revert');

  console.log('== harness git-watch: opening an untracked directory symlink does not crash ==');
  await driver.dispose();
  directoryFixtureRoot = mkdtempSync(join(tmpdir(), 'tui-git-watch-directory-harness-'));
  symlinkTargetRoot = mkdtempSync(join(tmpdir(), 'tui-git-watch-target-harness-'));
  await Bun.write(join(symlinkTargetRoot, 'pkg.js'), 'module.exports={};\n');
  await Bun.write(join(directoryFixtureRoot, 'f.txt'), 'a\n');
  initializeRepository(directoryFixtureRoot);
  symlinkSync(symlinkTargetRoot, join(directoryFixtureRoot, 'node_modules'));
  const directoryStatusPath = join(homeDirectory, 'directory-status.json');
  directoryDriver = new PtyTestDriver.Class({
    workspaceRoot: directoryFixtureRoot,
    columns: 120,
    rows: 40,
    homeDirectory,
    environment: { TUI_STATUS_PATH: directoryStatusPath },
  });
  await directoryDriver.awaitSnapshot(
    (snapshot) => snapshot.findText('node_modules') !== null,
    15_000,
  );
  directoryDriver.sendKeys('Control+g');
  const beforeOpenStatus = await HarnessSmoke.Class.awaitStatus(
    directoryDriver,
    directoryStatusPath,
    "status condition: Number(status.gitChangedCount) >= 1",
    (status) => Number(status.gitChangedCount) >= 1,
  );
  directoryDriver.sendKeysWithoutFrameExpectation('o');
  await HarnessSmoke.Class.awaitFrameSilence(directoryDriver, 600);
  await HarnessSmoke.Class.awaitStatus(
    directoryDriver,
    directoryStatusPath,
    'the Git changed count remains published after opening the untracked symlink row',
    (status) => Number(status.gitChangedCount) >= 1,
  );
  HarnessSmoke.Class.requireCondition(
    Number(beforeOpenStatus.gitChangedCount) >= 1,
    'opening the untracked node_modules-symlink row did not crash the app',
  );

  directoryDriver.sendKeys('Control+q');
  console.log('smoke-git-watch-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await directoryDriver?.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  if (directoryFixtureRoot) await HarnessSmoke.Class.removeTemporaryDirectory(directoryFixtureRoot);
  if (symlinkTargetRoot) await HarnessSmoke.Class.removeTemporaryDirectory(symlinkTargetRoot);
}
