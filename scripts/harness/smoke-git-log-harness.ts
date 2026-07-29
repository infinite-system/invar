#!/usr/bin/env bun
// Byte-level port of commit-log freshness and the read-only branch viewer. Visible branch labels,
// commits, menus, and diffs come from the emulator; branch/tip identity remains semantic status.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

function commit(
  repositoryRoot: string,
  subject: string,
  allowEmpty = false,
): void {
  HarnessSmoke.Class.runGit(repositoryRoot, [
    '-c',
    'user.email=a@b.c',
    '-c',
    'user.name=x',
    'commit',
    '-q',
    ...(allowEmpty ? ['--allow-empty'] : []),
    '-m',
    subject,
  ]);
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-git-log-harness-'));

const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-git-log-harness-home-'));

const statusPath = join(homeDirectory, 'status.json');

HarnessSmoke.Class.runGit(fixtureRoot, ['init', '-q', '-b', 'main']);

await Bun.write(join(fixtureRoot, 'base.txt'), 'base\n');

HarnessSmoke.Class.runGit(fixtureRoot, ['add', '-A']);

commit(fixtureRoot, 'root-subject-A');

HarnessSmoke.Class.runGit(fixtureRoot, ['branch', 'feature']);

await Bun.write(join(fixtureRoot, 'main.txt'), 'main\n');

HarnessSmoke.Class.runGit(fixtureRoot, ['add', '-A']);

commit(fixtureRoot, 'main-only-B');

HarnessSmoke.Class.runGit(fixtureRoot, ['checkout', '-q', 'feature']);

await Bun.write(join(fixtureRoot, 'feat1.txt'), 'feat1\n');

HarnessSmoke.Class.runGit(fixtureRoot, ['add', '-A']);

commit(fixtureRoot, 'feat-only-1');

await Bun.write(join(fixtureRoot, 'feat2.txt'), 'feat2 content line\n');

HarnessSmoke.Class.runGit(fixtureRoot, ['add', '-A']);

commit(fixtureRoot, 'feat-only-2');

HarnessSmoke.Class.runGit(fixtureRoot, ['checkout', '-q', 'main']);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  console.log('== harness git-log: checked-out branch history ==');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('base.txt') !== null,
    15_000,
  );
  driver.sendKeys('Control+g');
  let snapshot = await driver.awaitSnapshot(
    (candidate) =>
      candidate.findText('history: main') !== null &&
      candidate.findText('main-only-B') !== null,
  );
  HarnessSmoke.Class.pass('log header names the followed branch');
  HarnessSmoke.Class.pass("main's own commit renders");
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('feat-only-2') === null,
    'feature-only commits do not render on main',
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the Git log viewer follows HEAD',
    (status) => status.gitLogBranch === '',
  );
  HarnessSmoke.Class.pass('viewer follows HEAD');

  console.log(
    '== harness git-log: external main commit appears without app input ==',
  );
  commit(fixtureRoot, 'ext-tip-C', true);
  const externalMainTip = HarnessSmoke.Class.runGit(fixtureRoot, [
    'rev-parse',
    'HEAD',
  ]);
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('ext-tip-C') !== null,
    12_000,
  );
  HarnessSmoke.Class.pass(
    'external commit reached the history pane within the reconcile window',
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the displayed Git log tip SHA matches the external main tip',
    (status) => status.gitLogTipSha === externalMainTip,
  );
  HarnessSmoke.Class.pass('displayed tip SHA matches the real tip');

  console.log(
    '== harness git-log: b switches to the read-only feature view ==',
  );
  driver.sendKeys('b');
  snapshot = await driver.awaitSnapshot(
    (candidate) =>
      candidate.findText('history: feature') !== null &&
      candidate.findText('view only') !== null &&
      candidate.findText('feat-only-2') !== null,
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the Git log viewer switches to feature',
    (status) => status.gitLogBranch === 'feature',
  );
  HarnessSmoke.Class.pass("viewer switched to 'feature'");
  HarnessSmoke.Class.pass('header names the viewed branch');
  HarnessSmoke.Class.pass("feature's own history renders");
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('main-only-B') === null,
    'main-only commits do not render on the feature view',
  );

  console.log(
    '== harness git-log: external commit on the viewed ref appears ==',
  );
  const featureExternalCommit = HarnessSmoke.Class.runGit(fixtureRoot, [
    '-c',
    'user.email=a@b.c',
    '-c',
    'user.name=x',
    'commit-tree',
    'feature^{tree}',
    '-p',
    'feature',
    '-m',
    'feat-ext-D',
  ]);
  HarnessSmoke.Class.runGit(fixtureRoot, [
    'update-ref',
    'refs/heads/feature',
    featureExternalCommit,
  ]);
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('feat-ext-D') !== null,
    12_000,
  );
  HarnessSmoke.Class.pass('viewed-branch external commit reached the pane');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the viewed Git log tip SHA tracks the external feature commit',
    (status) => status.gitLogTipSha === featureExternalCommit,
  );
  HarnessSmoke.Class.pass('viewed tip SHA tracks the viewed ref');

  console.log(
    '== harness git-log: selection previews and activation transfers focus ==',
  );
  HarnessSmoke.Class.clickText(driver, snapshot, 'feat-only-2');
  snapshot = await driver.awaitSnapshot(
    (candidate) =>
      candidate.findText('feat2 content line') !== null &&
      candidate.findText('Current (working) — feat2.txt') !== null,
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the commit click keeps focus in Git while its preview is visible',
    (status) => status.focus === 'git' && status.showingDiff === true,
  );
  HarnessSmoke.Class.pass(
    'single-clicked commit previews without moving focus',
  );

  const selectedCommitPosition = snapshot.findText('feat-only-2');
  if (!selectedCommitPosition) throw new Error('Selected commit vanished');
  const selectedCommitFileRow = selectedCommitPosition.row + 1;
  const selectedCommitFileColumn = snapshot
    .rowText(selectedCommitFileRow)
    .indexOf('feat2.txt');
  if (selectedCommitFileColumn < 0) {
    throw new Error('Expanded commit file vanished');
  }
  const commitFileRowBeforeClick = JSON.stringify(
    snapshot.rowCells(selectedCommitFileRow),
  );
  driver.sendMouse({
    kind: 'press',
    column: selectedCommitFileColumn,
    row: selectedCommitFileRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: selectedCommitFileColumn,
    row: selectedCommitFileRow,
    button: 'left',
  });
  await driver.awaitGridCondition(
    'the clicked commit file becomes the selected log row',
    (candidate) =>
      JSON.stringify(candidate.rowCells(selectedCommitFileRow)) !==
      commitFileRowBeforeClick,
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the commit file click keeps focus in Git',
    (status) => status.focus === 'git' && status.showingDiff === true,
  );
  HarnessSmoke.Class.pass('single-clicked commit file keeps focus in Git');

  driver.sendKeys('Down');
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('Current (working) — feat1.txt') !== null,
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the second commit preview keeps focus in Git',
    (status) => status.focus === 'git' && status.showingDiff === true,
  );
  HarnessSmoke.Class.pass('arrow-selected second commit updates the preview');

  driver.sendKeys('Down');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the second commit file preview keeps focus in Git',
    (status) => status.focus === 'git' && status.showingDiff === true,
  );
  HarnessSmoke.Class.pass('arrow-selected second commit file keeps browsing');

  driver.sendKeys('Down');
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('Current (working) — base.txt') !== null,
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the third commit preview keeps focus in Git',
    (status) => status.focus === 'git' && status.showingDiff === true,
  );
  HarnessSmoke.Class.pass('arrow-selected third commit updates the preview');

  driver.sendKeys('Down');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the third commit file preview keeps focus in Git',
    (status) => status.focus === 'git' && status.showingDiff === true,
  );
  HarnessSmoke.Class.pass('arrow-selected third commit file keeps browsing');

  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'explicit commit-file activation transfers focus to the comparison',
    (status) => status.focus === 'editor' && status.showingDiff === true,
  );
  HarnessSmoke.Class.pass('Enter transfers focus to the opened comparison');

  driver.sendKeys('Control+g');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'source control regains focus before double-click activation',
    (status) => status.focus === 'git',
  );
  snapshot = driver.snapshot();
  const rootCommitPosition = snapshot.findText('root-subject-A');
  if (!rootCommitPosition) throw new Error('Root commit vanished');
  const rootCommitFileRow = rootCommitPosition.row + 1;
  const rootCommitFileColumn = snapshot
    .rowText(rootCommitFileRow)
    .indexOf('base.txt');
  if (rootCommitFileColumn < 0) throw new Error('Root commit file vanished');
  for (let clickNumber = 0; clickNumber < 2; clickNumber += 1) {
    driver.sendMouse({
      kind: 'press',
      column: rootCommitFileColumn,
      row: rootCommitFileRow,
      button: 'left',
    });
    driver.sendMouse({
      kind: 'release',
      column: rootCommitFileColumn,
      row: rootCommitFileRow,
      button: 'left',
    });
  }
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'double-click activation transfers focus to the comparison',
    (status) => status.focus === 'editor' && status.showingDiff === true,
  );
  HarnessSmoke.Class.pass(
    'double-click transfers focus to the opened comparison',
  );

  console.log('== harness git-log: Escape returns the viewer to HEAD ==');
  driver.sendKeys('Control+g');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.focus === 'git'",
    (status) => status.focus === 'git',
  );
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.gitLogBranch === ''",
    (status) => status.gitLogBranch === '',
  );
  snapshot = await driver.awaitSnapshot(
    (candidate) =>
      candidate.findText('history: main') !== null &&
      candidate.findText('ext-tip-C') !== null,
  );
  HarnessSmoke.Class.pass('Esc returned the viewer to HEAD-following');
  HarnessSmoke.Class.pass('header follows HEAD and main history renders again');

  console.log('== harness git-log: branch menu is mouse-driven ==');
  HarnessSmoke.Class.clickText(driver, snapshot, 'history: main', 7);
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('main (checked out)') !== null,
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the branch menu is published as open',
    (status) => status.boundedListPopupOpen === true,
  );
  HarnessSmoke.Class.pass('header click opened the branch menu');
  HarnessSmoke.Class.pass('menu marks the checked-out branch');
  let featureMenuPosition: { row: number; column: number } | null = null;
  for (let row = 0; row < snapshot.rows; row++) {
    const rowText = snapshot.rowText(row);
    const column = rowText.indexOf('feature');
    if (column >= 0 && !rowText.includes('history:')) {
      featureMenuPosition = { row, column };
      break;
    }
  }
  HarnessSmoke.Class.requireCondition(
    featureMenuPosition !== null,
    'feature menu item is visible',
  );
  if (!featureMenuPosition) throw new Error('Feature menu position vanished');
  driver.sendMouse({
    kind: 'press',
    column: featureMenuPosition.column,
    row: featureMenuPosition.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: featureMenuPosition.column,
    row: featureMenuPosition.row,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.gitLogBranch === 'feature'",
    (status) => status.gitLogBranch === 'feature',
  );
  HarnessSmoke.Class.pass('menu click re-sourced the viewer to feature');
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.gitLogBranch === ''",
    (status) => status.gitLogBranch === '',
  );

  console.log('== harness git-log: read-only guarantee ==');
  HarnessSmoke.Class.requireCondition(
    HarnessSmoke.Class.runGit(fixtureRoot, ['branch', '--show-current']) ===
      'main',
    'checked-out branch is still main',
  );
  HarnessSmoke.Class.requireCondition(
    HarnessSmoke.Class.runGit(fixtureRoot, ['status', '--porcelain']) === '',
    'working tree and index are clean',
  );
  HarnessSmoke.Class.requireCondition(
    HarnessSmoke.Class.runGit(fixtureRoot, ['rev-parse', 'HEAD']) ===
      externalMainTip,
    'HEAD SHA is byte-identical',
  );

  driver.sendKeys('Control+q');
  console.log('smoke-git-log-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
