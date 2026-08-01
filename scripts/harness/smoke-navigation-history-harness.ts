#!/usr/bin/env bun
// Byte-level port of editor-area navigation history: source files and a Git comparison share one
// trail, while Alt-bracket replay and command-bar clicks use the real terminal path.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Programmatic history navigation does not record new history (src/modules/navigation/navigation.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { commandBarLayoutSwitcherPosition } from './HarnessSmokeSupport';
import { PtyTestDriver } from './PtyTestDriver';

const fixtureRoot = mkdtempSync(
  join(tmpdir(), 'tui-navigation-history-harness-'),
);

const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-navigation-history-harness-home-'),
);

const statusPath = join(homeDirectory, 'status.json');

const alphaPath = join(fixtureRoot, 'alpha.ts');

const betaPath = join(fixtureRoot, 'beta.ts');

await Bun.write(
  alphaPath,
  'alpha before\nalpha two\nalpha three\nalpha four\nalpha five\n',
);

await Bun.write(
  betaPath,
  'beta one\nbeta two\nbeta three\nbeta four\nbeta five\n',
);

HarnessSmoke.Class.runGit(fixtureRoot, ['init', '-q']);
HarnessSmoke.Class.runGit(fixtureRoot, ['add', '-A']);
HarnessSmoke.Class.runGit(fixtureRoot, [
  '-c',
  'user.email=history@example.test',
  '-c',
  'user.name=History Smoke',
  'commit',
  '-qm',
  'initial files',
]);
await Bun.write(
  alphaPath,
  'alpha after\nalpha two\nalpha three\nalpha four\nalpha five\n',
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  console.log(
    '== harness navigation history: open alpha and preserve its cursor ==',
  );
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('alpha.ts') !== null,
    15_000,
  );
  driver.sendKeys('Down');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.treeSelected === 1',
    (status) => status.treeSelected === 1,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.activeBuffer === alphaPath',
    (status) => status.activeBuffer === alphaPath,
  );
  await driver.awaitGridCondition(
    'alpha.ts content is visible after opening the file',
    (snapshot) => snapshot.findText('alpha after') !== null,
  );
  HarnessSmoke.Class.pass('alpha.ts opened as the active buffer');
  driver.sendKeys('Down', 'Down', 'Down');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.cursor?.line === 3 && status.cursor.col === 0',
    (status) => status.cursor?.line === 3 && status.cursor.col === 0,
  );
  HarnessSmoke.Class.pass('cursor moved to alpha.ts line 3 (3,0)');
  await driver.awaitScreenChange();

  console.log(
    '== harness navigation history: open a Git comparison between source files ==',
  );
  driver.sendKeys('Control+g');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.focus === 'git' && status.gitChangedCount === 1",
    (status) => status.focus === 'git' && status.gitChangedCount === 1,
  );
  driver.sendKeys('o');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.showingDiff === true',
    (status) => status.showingDiff === true,
  );
  await driver.awaitGridCondition(
    'the Git comparison shows both alpha revisions',
    (snapshot) =>
      snapshot.findText('alpha before') !== null &&
      snapshot.findText('alpha after') !== null,
  );
  HarnessSmoke.Class.pass('the Git comparison opened between source files');

  driver.sendKeys('Control+Shift+e');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.sidebarView === 'files' && status.treeSelected === 1",
    (status) => status.sidebarView === 'files' && status.treeSelected === 1,
  );
  driver.sendKeys('Down');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.treeSelected === 2',
    (status) => status.treeSelected === 2,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.activeBuffer === betaPath',
    (status) => status.activeBuffer === betaPath,
  );
  await driver.awaitGridCondition(
    'beta.ts content is visible after opening the file',
    (snapshot) => snapshot.findText('beta one') !== null,
  );
  HarnessSmoke.Class.pass('beta.ts opened as the active buffer');

  console.log(
    '== harness navigation history: Alt+[ restores diff, then source ==',
  );
  driver.sendKeys('Alt+[');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.showingDiff === true',
    (status) => status.showingDiff === true,
  );
  await driver.awaitGridCondition(
    'the Git comparison is visible after navigating back once',
    (snapshot) =>
      snapshot.findText('alpha before') !== null &&
      snapshot.findText('alpha after') !== null,
  );
  HarnessSmoke.Class.pass('the first Alt+[ restored the Git comparison');
  driver.sendKeys('Alt+[');
  const backStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.activeBuffer === alphaPath && status.cursor?.line === 3',
    (status) => status.activeBuffer === alphaPath && status.cursor?.line === 3,
  );
  HarnessSmoke.Class.pass('Alt+[ restored alpha.ts as the active buffer');
  HarnessSmoke.Class.requireCondition(
    backStatus.cursor?.line === 3 && backStatus.cursor.col === 0,
    'Alt+[ restored the cursor to where it was left (3,0)',
  );
  await driver.awaitGridCondition(
    'alpha.ts content is visible after navigating back',
    (snapshot) => snapshot.findText('alpha after') !== null,
  );
  driver.sendKeys('Alt+]');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.showingDiff === true',
    (status) => status.showingDiff === true,
  );
  await driver.awaitGridCondition(
    'the Git comparison is visible after navigating forward once',
    (snapshot) => snapshot.findText('alpha before') !== null,
  );
  driver.sendKeys('Alt+]');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.activeBuffer === betaPath',
    (status) =>
      status.activeBuffer === betaPath && status.showingDiff === false,
  );
  await driver.awaitGridCondition(
    'beta.ts content is visible after navigating forward',
    (snapshot) => snapshot.findText('beta one') !== null,
  );
  HarnessSmoke.Class.pass(
    'two Alt+] inputs returned through the comparison to beta.ts',
  );

  console.log(
    '== harness navigation history: command-bar buttons drive the same history ==',
  );
  let snapshot = await driver.awaitGridCondition(
    'the workspace command bar renders the navigation and layouts controls',
    (candidate) => {
      const layoutSwitcherPosition =
        commandBarLayoutSwitcherPosition(candidate);
      if (!layoutSwitcherPosition) return false;
      const rowText = candidate.rowText(layoutSwitcherPosition.row);
      return rowText.includes('‹') && rowText.includes('›');
    },
  );
  const layoutSwitcherPosition = commandBarLayoutSwitcherPosition(snapshot);
  const commandBarRow = layoutSwitcherPosition?.row ?? -1;
  const backColumn =
    commandBarRow >= 0 ? snapshot.rowText(commandBarRow).indexOf('‹') : -1;
  HarnessSmoke.Class.requireCondition(
    commandBarRow >= 0 && backColumn >= 0,
    `command-bar buttons rendered (‹ at col ${backColumn}, row ${commandBarRow})`,
  );
  driver.sendMouse({
    kind: 'press',
    column: backColumn,
    row: commandBarRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: backColumn,
    row: commandBarRow,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'clicking command-bar back restores the Git comparison',
    (status) => status.showingDiff === true,
  );
  await driver.awaitGridCondition(
    'the Git comparison is visible after clicking the back breadcrumb',
    (candidate) => candidate.findText('alpha before') !== null,
  );
  HarnessSmoke.Class.pass(
    'clicking command-bar ‹ went back to the Git comparison',
  );
  snapshot = driver.snapshot();
  driver.sendMouse({
    kind: 'press',
    column: backColumn + 2,
    row: commandBarRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: backColumn + 2,
    row: commandBarRow,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.activeBuffer === betaPath',
    (status) =>
      status.activeBuffer === betaPath && status.showingDiff === false,
  );
  await driver.awaitGridCondition(
    'beta.ts content is visible after clicking the forward breadcrumb',
    (candidate) => candidate.findText('beta one') !== null,
  );
  HarnessSmoke.Class.pass('clicking command-bar › went forward to beta.ts');

  driver.sendKeys('Control+q');
  console.log('smoke-navigation-history-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
