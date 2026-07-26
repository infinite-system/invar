#!/usr/bin/env bun
// Byte-level port of current-line blame: the unit layer is preserved and the real app proves both
// tracked-author rendering and the negative untracked-file path.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

console.log(
  '== harness git-blame: deterministic parser and relative-time tests ==',
);
const unitResult = Bun.spawnSync(
  [
    process.execPath,
    'test',
    'src/modules/git/GitBlame.test.ts',
    'src/modules/git/RelativeTime.test.ts',
  ],
  { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' },
);
HarnessSmoke.Class.requireCondition(
  unitResult.exitCode === 0,
  'blame unit tests (porcelain parse, metadata reuse, uncommitted, relative-date buckets)',
);

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-git-blame-harness-'));
const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-git-blame-harness-home-'),
);
const statusPath = join(homeDirectory, 'status.json');
HarnessSmoke.Class.runGit(fixtureRoot, ['init', '-q']);
HarnessSmoke.Class.runGit(fixtureRoot, ['config', 'user.name', 'Blame Tester']);
HarnessSmoke.Class.runGit(fixtureRoot, [
  'config',
  'user.email',
  'blame@test.local',
]);
await Bun.write(
  join(fixtureRoot, 'tracked.txt'),
  'first line\nsecond line\nthird line\n',
);
HarnessSmoke.Class.runGit(fixtureRoot, ['add', 'tracked.txt']);
HarnessSmoke.Class.runGit(fixtureRoot, [
  '-c',
  'user.name=Blame Tester',
  '-c',
  'user.email=blame@test.local',
  'commit',
  '-qm',
  'add tracked file',
]);
await Bun.write(
  join(fixtureRoot, 'untracked.txt'),
  'untracked one\nuntracked two\n',
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  console.log('== harness git-blame: a committed line shows its author ==');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('tracked.txt') !== null,
    15_000,
  );
  driver.sendKeys('Control+p');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Go to File') !== null,
  );
  driver.sendText('tracked');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('tracked.txt') !== null,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: String(status.activeBuffer).endsWith('/tracked.txt')",
    (status) => String(status.activeBuffer).endsWith('/tracked.txt'),
  );
  HarnessSmoke.Class.pass('opened tracked.txt');
  driver.sendKeys('Down');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.currentLineBlameAuthor === 'Blame Tester'",
    (status) => status.currentLineBlameAuthor === 'Blame Tester',
  );
  HarnessSmoke.Class.pass("cursor-line blame author is 'Blame Tester' (probe)");
  const blameSnapshot = await driver.awaitGridCondition(
    'the status bar renders the current line blame author',
    (candidate) =>
      candidate.rowText(candidate.rows - 1).includes('Blame Tester'),
  );
  HarnessSmoke.Class.requireCondition(
    blameSnapshot.rowText(blameSnapshot.rows - 1).includes('Blame Tester'),
    'status bar renders the blame author',
  );

  console.log('== harness git-blame: an untracked document shows no blame ==');
  driver.sendKeys('Control+p');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Go to File') !== null,
  );
  driver.sendText('untracked');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('untracked.txt') !== null,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: String(status.activeBuffer).endsWith('/untracked.txt')",
    (status) => String(status.activeBuffer).endsWith('/untracked.txt'),
  );
  HarnessSmoke.Class.pass('opened untracked.txt');
  const untrackedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the untracked document publishes no blame author',
    (status) => status.currentLineBlameAuthor === '',
  );
  HarnessSmoke.Class.pass('untracked document has no blame author');
  const changedCountBeforeReconcile = Number(untrackedStatus.gitChangedCount);
  await Bun.write(
    join(fixtureRoot, 'reconcile-liveness.txt'),
    'force a watched-tree reconciliation\n',
  );
  const settledStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the watched-tree reconcile advances while blame stays absent',
    (status) =>
      Number(status.gitChangedCount) > changedCountBeforeReconcile &&
      status.currentLineBlameAuthor === '',
  );
  HarnessSmoke.Class.requireCondition(
    settledStatus.currentLineBlameAuthor === '',
    'the untracked document still publishes no blame author after reconcile',
  );

  driver.sendKeys('Control+q');
  console.log('smoke-git-blame-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
