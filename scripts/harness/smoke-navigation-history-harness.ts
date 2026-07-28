#!/usr/bin/env bun
// Byte-level port of navigation history: file opens, Alt-bracket replay, and command-bar clicks use
// the real terminal path; exact locations remain semantic status assertions.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Programmatic history navigation does not record new history (src/modules/navigation/navigation.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
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
  'alpha one\nalpha two\nalpha three\nalpha four\nalpha five\n',
);
await Bun.write(
  betaPath,
  'beta one\nbeta two\nbeta three\nbeta four\nbeta five\n',
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
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.activeBuffer === alphaPath',
    (status) => status.activeBuffer === alphaPath,
  );
  await driver.awaitGridCondition(
    'alpha.ts content is visible after opening the file',
    (snapshot) => snapshot.findText('alpha one') !== null,
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

  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.focus === 'files'",
    (status) => status.focus === 'files',
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
    'status condition: status.activeBuffer === betaPath',
    (status) => status.activeBuffer === betaPath,
  );
  await driver.awaitGridCondition(
    'beta.ts content is visible after opening the file',
    (snapshot) => snapshot.findText('beta one') !== null,
  );
  HarnessSmoke.Class.pass('beta.ts opened as the active buffer');

  console.log(
    '== harness navigation history: Alt+[ and Alt+] replay both directions ==',
  );
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
    (snapshot) => snapshot.findText('alpha one') !== null,
  );
  driver.sendKeys('Alt+]');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.activeBuffer === betaPath',
    (status) => status.activeBuffer === betaPath,
  );
  await driver.awaitGridCondition(
    'beta.ts content is visible after navigating forward',
    (snapshot) => snapshot.findText('beta one') !== null,
  );
  HarnessSmoke.Class.pass('Alt+] returned forward to beta.ts');

  console.log(
    '== harness navigation history: command-bar buttons drive the same history ==',
  );
  let snapshot = await driver.awaitGridCondition(
    'the workspace command bar renders the navigation and layouts controls',
    (candidate) =>
      candidate.findText(' layouts ') !== null &&
      candidate
        .textRows()
        .some(
          (rowText) =>
            rowText.includes('‹') &&
            rowText.includes('›') &&
            rowText.includes(' layouts '),
        ),
  );
  let commandBarRow = -1;
  let backColumn = -1;
  for (let row = 0; row < snapshot.rows; row++) {
    const rowText = snapshot.rowText(row);
    if (!rowText.includes(' layouts ') || !rowText.includes('‹')) continue;
    commandBarRow = row;
    backColumn = rowText.indexOf('‹');
    break;
  }
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
    'clicking command-bar back activates alpha.ts',
    (status) => status.activeBuffer === alphaPath,
  );
  await driver.awaitGridCondition(
    'alpha.ts content is visible after clicking the back breadcrumb',
    (candidate) => candidate.findText('alpha one') !== null,
  );
  HarnessSmoke.Class.pass('clicking command-bar ‹ went back to alpha.ts');
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
    (status) => status.activeBuffer === betaPath,
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
