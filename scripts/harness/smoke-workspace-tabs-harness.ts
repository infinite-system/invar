#!/usr/bin/env bun
// Byte-level workspace-tabs port: roots are added and switched through the painted strip and settings.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import {
  awaitStatus,
  clickMarker,
  markerForeground,
  pass,
  requireCondition,
  requireEqual,
  runGit,
  statusField,
} from './HarnessSmokeSupport';
import { PtyTestDriver } from './PtyTestDriver';

const firstRoot = mkdtempSync(join(tmpdir(), 'tui-workspace-first-'));
const secondRoot = mkdtempSync(join(tmpdir(), 'tui-workspace-second-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-workspace-tabs-harness-home-'));
const statusPath = join(homeDirectory, 'status.json');
const firstName = basename(firstRoot);
const secondName = basename(secondRoot);

await Bun.write(join(firstRoot, 'FIRST_TREE_ONLY.txt'), 'first tree\n');
await Bun.write(join(firstRoot, 'first-root-change.txt'), 'first committed\n');
runGit(firstRoot, ['init', '-q']);
runGit(firstRoot, ['config', 'user.email', 'first@example.invalid']);
runGit(firstRoot, ['config', 'user.name', 'First']);
runGit(firstRoot, ['add', '.']);
runGit(firstRoot, ['commit', '-qm', 'first']);
await Bun.write(join(firstRoot, 'first-root-change.txt'), 'first committed\nfirst modified\n');

await Bun.write(join(secondRoot, 'SECOND_TREE_ONLY.txt'), 'second tree\n');
await Bun.write(join(secondRoot, 'second-root-change.txt'), 'second committed\n');
runGit(secondRoot, ['init', '-q']);
runGit(secondRoot, ['config', 'user.email', 'second@example.invalid']);
runGit(secondRoot, ['config', 'user.name', 'Second']);
runGit(secondRoot, ['add', '.']);
runGit(secondRoot, ['commit', '-qm', 'second']);
await Bun.write(join(secondRoot, 'second-root-change.txt'), 'second committed\nsecond modified\n');

const driver = new PtyTestDriver.Class({
  workspaceRoot: firstRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  console.log('== harness workspace tabs: add a second root through the plus picker ==');
  let snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText(firstName.slice(0, 17)) !== null,
    15_000,
  );
  requireEqual(statusField<number>(statusPath, 'workspaceCount'), 1, 'booted one workspace');
  const plusColumn = Array.from(snapshot.rowText(0)).lastIndexOf('+');
  requireCondition(plusColumn >= 0, 'workspace plus button paints on the top strip');
  driver.sendMouse({ kind: 'press', column: plusColumn, row: 0, button: 'left' });
  driver.sendMouse({ kind: 'release', column: plusColumn, row: 0, button: 'left' });
  await driver.awaitSnapshot(
    (candidate) => candidate.findText(`+ ${dirname(firstRoot)}`) !== null,
  );
  pass('project picker prefills the current root parent');
  driver.sendText(secondName);
  await driver.awaitSnapshot((candidate) => candidate.findText(secondRoot) !== null);
  pass('fuzzy match list paints the sibling absolute path');
  driver.sendKeys('Enter');
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('SECOND_TREE_ONLY.txt') !== null,
    15_000,
  );
  requireEqual(statusField<number>(statusPath, 'workspaceCount'), 2, 'second workspace was added');
  requireEqual(
    statusField<string>(statusPath, 'activeWorkspaceRoot'),
    secondRoot,
    'new workspace is active',
  );
  requireCondition(snapshot.findText('…') !== null, 'long project name is capped with an ellipsis');

  const secondNamePosition = snapshot.findText(secondName.slice(0, 17));
  requireCondition(secondNamePosition !== null, 'second workspace name paints');
  snapshot = await driver.awaitGridCondition(
    'the active workspace detail and readable name foregrounds match',
    (candidate) => {
      const candidateNamePosition = candidate.findText(secondName.slice(0, 17));
      if (!candidateNamePosition) return false;
      const candidateNameForeground = markerForeground(candidate, secondName.slice(0, 17));
      const candidateBranchCell = candidate.rowCells(candidateNamePosition.row + 1).find(
        (cell, column) => column >= candidateNamePosition.column && cell.characters !== ' ',
      );
      return candidateBranchCell?.foreground === candidateNameForeground;
    },
  );
  const settledSecondNameForeground = markerForeground(snapshot, secondName.slice(0, 17));
  const settledSecondNamePosition = snapshot.findText(secondName.slice(0, 17));
  if (!settledSecondNamePosition) throw new Error('Second workspace name disappeared');
  const branchRow = settledSecondNamePosition.row + 1;
  const branchCell = snapshot.rowCells(branchRow).find(
    (cell, column) => column >= settledSecondNamePosition.column && cell.characters !== ' ',
  );
  requireCondition(
    branchCell?.foreground === settledSecondNameForeground,
    'active workspace detail foreground matches the readable name foreground',
  );

  console.log('== harness workspace tabs: git panel follows the active root ==');
  driver.sendKeys('Control+g');
  await driver.awaitSnapshot((candidate) => candidate.findText('second-root-change.txt') !== null);
  pass('git panel paints the second repository change');

  console.log('== harness workspace tabs: clicking first tab restores tree and git ==');
  snapshot = driver.snapshot();
  clickMarker(driver, snapshot, firstName.slice(0, 17));
  await driver.awaitSnapshot((candidate) => candidate.findText('FIRST_TREE_ONLY.txt') !== null);
  requireEqual(
    statusField<string>(statusPath, 'activeWorkspaceRoot'),
    firstRoot,
    'click switched to the first root',
  );
  driver.sendKeys('Control+g');
  await driver.awaitSnapshot((candidate) => candidate.findText('first-root-change.txt') !== null);
  pass('git panel returned to the first repository');
  requireEqual(
    statusField<number>(statusPath, 'liveGitWatcherCount'),
    1,
    'two workspaces cost one live GitWatcher',
  );
  requireCondition(
    String(statusField<unknown>(statusPath, 'workspaceLiveGitWatchers')) === 'true,false',
    'only the active workspace owns a watcher',
  );

  console.log('== harness workspace tabs: settings reorients top to left and back ==');
  driver.sendKeys('Control+,');
  await driver.awaitSnapshot((candidate) => candidate.findText('Settings') !== null);
  for (let settingRow = 1; settingRow <= 12; settingRow++) {
    driver.sendKeys('Down');
    await driver.awaitQuiescence();
  }
  driver.sendKeys('Right');
  await driver.awaitQuiescence();
  driver.sendKeys('Escape');
  snapshot = await driver.awaitGridCondition(
    'the left-oriented workspace strip stacks the second project in the left column',
    (candidate) => {
      const secondProjectPosition = candidate.findText(secondName.slice(0, 17));
      return secondProjectPosition?.row === 1 && secondProjectPosition.column < 22;
    },
  );
  const secondVerticalPosition = snapshot.findText(secondName.slice(0, 17));
  requireCondition(
    secondVerticalPosition?.row === 1 && secondVerticalPosition.column < 22,
    'left-oriented strip stacks the second project in the left column',
  );
  driver.sendKeys('Control+,');
  await driver.awaitSnapshot((candidate) => candidate.findText('Settings') !== null);
  driver.sendKeys('Left');
  await driver.awaitQuiescence();
  driver.sendKeys('Escape');
  snapshot = await driver.awaitGridCondition(
    'the workspace strip returns to the top row',
    (candidate) => candidate.findText(secondName.slice(0, 17))?.row === 0,
  );
  requireCondition(
    snapshot.findText(secondName.slice(0, 17))?.row === 0,
    'workspace strip returns to the top row',
  );

  console.log('== harness workspace tabs: Ctrl+Shift brackets cycle projects ==');
  const cycleRootBefore = statusField<string>(statusPath, 'activeWorkspaceRoot');
  driver.sendRawInput('\x1b[93;6u');
  await awaitStatus(
    driver,
    statusPath,
    (status) => status.activeWorkspaceRoot !== cycleRootBefore,
  );
  pass('Ctrl+Shift+] cycles to the next project');
  driver.sendRawInput('\x1b[91;6u');
  await awaitStatus(
    driver,
    statusPath,
    (status) => status.activeWorkspaceRoot === cycleRootBefore,
  );
  pass('Ctrl+Shift+[ cycles back to the previous project');

  driver.sendKeys('Control+q');
  console.log('smoke-workspace-tabs-harness: ALL-PASS');
} finally {
  await driver.dispose();
  rmSync(firstRoot, { recursive: true, force: true });
  rmSync(secondRoot, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
