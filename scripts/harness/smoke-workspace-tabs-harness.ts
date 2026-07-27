#!/usr/bin/env bun
// Byte-level workspace-tabs port: roots are added and switched through the painted strip and settings.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Workspace activation is view-only (src/modules/workspace/workspace.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import {
  awaitStatus,
  clickMarker,
  markerForeground,
  pass,
  requireCondition,
  runGit,
} from './HarnessSmokeSupport';
import { ThemePalettes } from '../../src/modules/theme/ThemePalettes';
import { PtyTestDriver } from './PtyTestDriver';
import { HarnessSmoke } from './HarnessSmoke';

// Both roots live INSIDE THEIR OWN PARENT, never directly in the system temp
// directory, and that is load-bearing rather than tidiness. The project picker
// prefills the parent of the current root and fuzzy-scores that parent's entries, so
// rooting the fixture at tmpdir() made this smoke's cost depend on how many entries
// the whole machine happened to have in /tmp: it was ~1-in-3 flaky in the morning and
// ~2-in-3 by evening purely because a day of worktrees, gate logs, and failure
// directories grew /tmp to 3,752 entries, while retry-once-on-timeout kept rescuing it
// so the gate still reported green. A dedicated parent means the scan sees exactly
// these two directories on any machine.
//
// The names also carry meaning: `tiny` and `wide` are the two activation fixtures the
// GitWatcher subprocess-count assertions compare, and both are long enough for the
// later tab-name assertions (one requires an ellipsis cap, another slices 17 chars).
const fixtureParent = mkdtempSync(
  join(tmpdir(), 'tui-workspace-tabs-harness-'),
);
const firstRoot = join(fixtureParent, 'tiny-workspace-project');
const secondRoot = join(fixtureParent, 'wide-workspace-project');
mkdirSync(firstRoot);
mkdirSync(secondRoot);
const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-workspace-tabs-harness-home-'),
);
const statusPath = join(homeDirectory, 'status.json');
const firstName = basename(firstRoot);
const secondName = basename(secondRoot);
const tinyTrackedDirectoryCount = 3;
const wideTrackedDirectoryCount = 520;
const ignoredPackageCount = 600;

async function selectVisibleSetting(label: string): Promise<void> {
  const settingsSnapshot = await driver.awaitGridCondition(
    `${label} is visible in the settings panel`,
    (candidate) => candidate.findText(label) !== null,
  );
  clickMarker(driver, settingsSnapshot, label);
  await driver.awaitGridCondition(
    `${label} is the visibly selected settings row`,
    (candidate) => candidate.findText(`› ${label}`) !== null,
  );
}

mkdirSync(join(firstRoot, 'tracked'), { recursive: true });
for (
  let directoryIndex = 0;
  directoryIndex < tinyTrackedDirectoryCount;
  directoryIndex += 1
) {
  mkdirSync(join(firstRoot, 'tracked', `directory-${directoryIndex}`));
}
await Bun.write(join(firstRoot, 'FIRST_TREE_ONLY.txt'), 'first tree\n');
await Bun.write(join(firstRoot, 'first-root-change.txt'), 'first committed\n');
runGit(firstRoot, ['init', '-q']);
runGit(firstRoot, ['config', 'user.email', 'first@example.invalid']);
runGit(firstRoot, ['config', 'user.name', 'First']);
runGit(firstRoot, ['add', '.']);
runGit(firstRoot, ['commit', '-qm', 'first']);
await Bun.write(
  join(firstRoot, 'first-root-change.txt'),
  'first committed\nfirst modified\n',
);

mkdirSync(join(secondRoot, 'tracked'), { recursive: true });
for (
  let directoryIndex = 0;
  directoryIndex < wideTrackedDirectoryCount;
  directoryIndex += 1
) {
  mkdirSync(join(secondRoot, 'tracked', `directory-${directoryIndex}`));
}
for (
  let packageIndex = 0;
  packageIndex < ignoredPackageCount;
  packageIndex += 1
) {
  mkdirSync(
    join(secondRoot, 'ignored-cache', `package-${packageIndex}`, 'lib'),
    { recursive: true },
  );
}
await Bun.write(join(secondRoot, '.gitignore'), 'ignored-cache/\n');
await Bun.write(join(secondRoot, 'SECOND_TREE_ONLY.txt'), 'second tree\n');
await Bun.write(
  join(secondRoot, 'second-root-change.txt'),
  'second committed\n',
);
runGit(secondRoot, ['init', '-q']);
runGit(secondRoot, ['config', 'user.email', 'second@example.invalid']);
runGit(secondRoot, ['config', 'user.name', 'Second']);
runGit(secondRoot, ['add', '.']);
runGit(secondRoot, ['commit', '-qm', 'second']);
await Bun.write(
  join(secondRoot, 'second-root-change.txt'),
  'second committed\nsecond modified\n',
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: firstRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  console.log(
    '== harness workspace tabs: add a second root through the plus picker ==',
  );
  let snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText(firstName.slice(0, 17)) !== null,
    15_000,
  );
  await awaitStatus(
    driver,
    statusPath,
    'one workspace is present after boot',
    (status) => status.workspaceCount === 1,
  );
  pass('booted one workspace');
  const tinyActivationStatus = await awaitStatus(
    driver,
    statusPath,
    'the tiny workspace watcher activation completes',
    (status) =>
      status.gitWatcherActivationCompleted === true &&
      Number(status.gitWatcherActivationIgnoreQuerySubprocessCount) > 0,
  );
  const tinyIgnoreQuerySubprocessCount = Number(
    tinyActivationStatus.gitWatcherActivationIgnoreQuerySubprocessCount,
  );
  requireCondition(
    tinyIgnoreQuerySubprocessCount > 0,
    'the tiny activation liveness counter moves when its walk runs',
  );
  requireCondition(
    Number(tinyActivationStatus.gitWatcherActivationWatchedDirectoryCount) ===
      tinyTrackedDirectoryCount + 2,
    'the tiny activation reports every retained directory watch',
  );
  const plusColumn = Array.from(snapshot.rowText(0)).lastIndexOf('+');
  requireCondition(
    plusColumn >= 0,
    'workspace plus button paints on the top strip',
  );
  driver.sendMouse({
    kind: 'press',
    column: plusColumn,
    row: 0,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: plusColumn,
    row: 0,
    button: 'left',
  });
  await driver.awaitSnapshot(
    (candidate) => candidate.findText(`+ ${dirname(firstRoot)}`) !== null,
  );
  pass('project picker prefills the current root parent');
  driver.sendText(secondName);
  await driver.awaitGridCondition(
    'the project picker paints the complete typed path on its input row',
    (candidate) => {
      const pathPosition = candidate.findText(`+ ${secondRoot}`);
      if (!pathPosition) return false;
      // The shared field painter puts the caret in the cell AFTER the typed path by inverting it,
      // so the caret is read as the field foreground turned into a background, not as a glyph.
      const caretColumn = pathPosition.column + `+ ${secondRoot}`.length;
      return (
        candidate.cell(pathPosition.row, caretColumn)?.background ===
        Number.parseInt(ThemePalettes.Class.DARK.fg.slice(1), 16)
      );
    },
  );
  pass('project picker paints the complete typed path');
  await driver.awaitSnapshot((candidate) =>
    candidate
      .textRows()
      .slice(4)
      .some((rowText) => rowText.includes(secondRoot)),
  );
  pass('fuzzy match list paints the sibling absolute path');
  driver.sendKeys('Enter');
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('SECOND_TREE_ONLY.txt') !== null,
    15_000,
  );
  await awaitStatus(
    driver,
    statusPath,
    'the second workspace is added and active',
    (status) =>
      status.workspaceCount === 2 && status.activeWorkspaceRoot === secondRoot,
  );
  pass('second workspace was added');
  pass('new workspace is active');
  const wideActivationStatus = await awaitStatus(
    driver,
    statusPath,
    'the wide workspace watcher activation completes',
    (status) =>
      status.activeWorkspaceRoot === secondRoot &&
      status.gitWatcherActivationCompleted === true,
  );
  requireCondition(
    Number(
      wideActivationStatus.gitWatcherActivationIgnoreQuerySubprocessCount,
    ) === tinyIgnoreQuerySubprocessCount,
    'tiny and 500-directory activations launch equal ignore-query subprocess counts',
  );
  requireCondition(
    Number(wideActivationStatus.gitWatcherActivationWatchedDirectoryCount) ===
      wideTrackedDirectoryCount + 2,
    'the wide activation watches tracked directories and prunes the ignored subtree',
  );
  pass(
    `activation counters: tiny queries=${tinyIgnoreQuerySubprocessCount}, watched=${
      tinyActivationStatus.gitWatcherActivationWatchedDirectoryCount
    }; wide queries=${
      wideActivationStatus.gitWatcherActivationIgnoreQuerySubprocessCount
    }, watched=${wideActivationStatus.gitWatcherActivationWatchedDirectoryCount}`,
  );
  requireCondition(
    snapshot.findText('…') !== null,
    'long project name is capped with an ellipsis',
  );

  const secondNamePosition = snapshot.findText(secondName.slice(0, 17));
  requireCondition(secondNamePosition !== null, 'second workspace name paints');
  snapshot = await driver.awaitGridCondition(
    'the active workspace detail and readable name foregrounds match',
    (candidate) => {
      const candidateNamePosition = candidate.findText(secondName.slice(0, 17));
      if (!candidateNamePosition) return false;
      const candidateNameForeground = markerForeground(
        candidate,
        secondName.slice(0, 17),
      );
      const candidateBranchCell = candidate
        .rowCells(candidateNamePosition.row + 1)
        .find(
          (cell, column) =>
            column >= candidateNamePosition.column && cell.characters !== ' ',
        );
      return candidateBranchCell?.foreground === candidateNameForeground;
    },
  );
  const settledSecondNameForeground = markerForeground(
    snapshot,
    secondName.slice(0, 17),
  );
  const settledSecondNamePosition = snapshot.findText(secondName.slice(0, 17));
  if (!settledSecondNamePosition)
    throw new Error('Second workspace name disappeared');
  const branchRow = settledSecondNamePosition.row + 1;
  const branchCell = snapshot
    .rowCells(branchRow)
    .find(
      (cell, column) =>
        column >= settledSecondNamePosition.column && cell.characters !== ' ',
    );
  requireCondition(
    branchCell?.foreground === settledSecondNameForeground,
    'active workspace detail foreground matches the readable name foreground',
  );

  console.log(
    '== harness workspace tabs: git panel follows the active root ==',
  );
  driver.sendKeys('Control+g');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('second-root-change.txt') !== null,
  );
  pass('git panel paints the second repository change');

  console.log(
    '== harness workspace tabs: clicking first tab restores tree and git ==',
  );
  snapshot = driver.snapshot();
  clickMarker(driver, snapshot, firstName.slice(0, 17));
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('FIRST_TREE_ONLY.txt') !== null,
  );
  await awaitStatus(
    driver,
    statusPath,
    'the first workspace becomes active after its tab is clicked',
    (status) => status.activeWorkspaceRoot === firstRoot,
  );
  pass('click switched to the first root');
  await awaitStatus(
    driver,
    statusPath,
    'the reactivated tiny workspace watcher completes',
    (status) =>
      status.activeWorkspaceRoot === firstRoot &&
      status.gitWatcherActivationCompleted === true,
  );
  driver.sendKeys('Control+g');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('first-root-change.txt') !== null,
  );
  pass('git panel returned to the first repository');
  await awaitStatus(
    driver,
    statusPath,
    'only the active workspace owns a live Git watcher',
    (status) =>
      status.liveGitWatcherCount === 1 &&
      String(status.workspaceLiveGitWatchers) === 'true,false',
  );
  pass('two workspaces cost one live GitWatcher');
  pass('only the active workspace owns a watcher');

  console.log(
    '== harness workspace tabs: switched frame precedes repository work ==',
  );
  snapshot = driver.snapshot();
  clickMarker(driver, snapshot, secondName.slice(0, 17));
  await driver.awaitQuiescence();
  const firstSwitchedFrameStatus = await awaitStatus(
    driver,
    statusPath,
    'the switched frame is published before the watcher walk completes',
    (status) =>
      status.activeWorkspaceRoot === secondRoot &&
      status.gitWatcherActivationCompleted === false,
  );
  requireCondition(
    firstSwitchedFrameStatus.activeWorkspaceRoot === secondRoot,
    'the first switched frame belongs to the selected workspace',
  );
  requireCondition(
    firstSwitchedFrameStatus.gitWatcherActivationCompleted === false,
    'the first switched frame arrives before the watcher walk completes',
  );
  const reactivatedWideStatus = await awaitStatus(
    driver,
    statusPath,
    'the reactivated wide workspace watcher completes after the frame',
    (status) =>
      status.activeWorkspaceRoot === secondRoot &&
      status.gitWatcherActivationCompleted === true,
  );
  requireCondition(
    Number(
      reactivatedWideStatus.gitWatcherActivationIgnoreQuerySubprocessCount,
    ) === tinyIgnoreQuerySubprocessCount,
    'the completed wide walk repeats the depth-bounded query count',
  );
  snapshot = driver.snapshot();
  clickMarker(driver, snapshot, firstName.slice(0, 17));
  await awaitStatus(
    driver,
    statusPath,
    'the tiny workspace is restored after the deferral assertion',
    (status) => status.activeWorkspaceRoot === firstRoot,
  );

  console.log(
    '== harness workspace tabs: settings reorients top to left and back ==',
  );
  driver.sendKeys('Control+,');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('Settings') !== null,
  );
  await selectVisibleSetting('Workspace tabs');
  driver.sendKeys('Right');
  await driver.awaitQuiescence();
  driver.sendKeys('Escape');
  snapshot = await driver.awaitGridCondition(
    'the left-oriented workspace strip stacks the second project in the left column',
    (candidate) => {
      const firstProjectRow = candidate
        .textRows()
        .findIndex((rowText) =>
          rowText.slice(0, 22).includes(firstName.slice(0, 17)),
        );
      const secondProjectPosition = candidate.findText(secondName.slice(0, 17));
      return (
        firstProjectRow >= 0 &&
        secondProjectPosition?.row === firstProjectRow + 1 &&
        secondProjectPosition.column < 22
      );
    },
  );
  const firstProjectRow = snapshot
    .textRows()
    .findIndex((rowText) =>
      rowText.slice(0, 22).includes(firstName.slice(0, 17)),
    );
  const secondVerticalPosition = snapshot.findText(secondName.slice(0, 17));
  requireCondition(
    firstProjectRow >= 0 &&
      secondVerticalPosition?.row === firstProjectRow + 1 &&
      secondVerticalPosition.column < 22,
    'left-oriented strip stacks the second project in the left column',
  );
  driver.sendKeys('Control+,');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('Settings') !== null,
  );
  await selectVisibleSetting('Workspace tabs');
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

  console.log(
    '== harness workspace tabs: Ctrl+Shift brackets cycle projects ==',
  );
  const cycleStatusBefore = await awaitStatus(
    driver,
    statusPath,
    'an active workspace root is published before keyboard cycling',
    (status) => typeof status.activeWorkspaceRoot === 'string',
  );
  const cycleRootBefore = cycleStatusBefore.activeWorkspaceRoot;
  driver.sendRawInput('\x1b[93;6u');
  await awaitStatus(
    driver,
    statusPath,
    'status condition: status.activeWorkspaceRoot !== cycleRootBefore',
    (status) => status.activeWorkspaceRoot !== cycleRootBefore,
  );
  pass('Ctrl+Shift+] cycles to the next project');
  driver.sendRawInput('\x1b[91;6u');
  await awaitStatus(
    driver,
    statusPath,
    'status condition: status.activeWorkspaceRoot === cycleRootBefore',
    (status) => status.activeWorkspaceRoot === cycleRootBefore,
  );
  pass('Ctrl+Shift+[ cycles back to the previous project');

  driver.sendKeys('Control+q');
  console.log('smoke-workspace-tabs-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureParent);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
