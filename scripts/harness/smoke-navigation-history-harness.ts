#!/usr/bin/env bun
// Byte-level port of navigation history: file opens, Alt-bracket replay, and breadcrumb clicks use
// the real terminal path; exact locations remain semantic status assertions.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Programmatic history navigation does not record new history (src/modules/navigation/navigation.invariants.md)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-navigation-history-harness-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-navigation-history-harness-home-'));
const statusPath = join(homeDirectory, 'status.json');
const alphaPath = join(fixtureRoot, 'alpha.ts');
const betaPath = join(fixtureRoot, 'beta.ts');
await Bun.write(alphaPath, 'alpha one\nalpha two\nalpha three\nalpha four\nalpha five\n');
await Bun.write(betaPath, 'beta one\nbeta two\nbeta three\nbeta four\nbeta five\n');

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  console.log('== harness navigation history: open alpha and preserve its cursor ==');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('alpha.ts') !== null, 15_000);
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(driver, statusPath, (status) => status.activeBuffer === alphaPath);
  HarnessSmoke.Class.pass('alpha.ts opened as the active buffer');
  driver.sendKeys('Down', 'Down', 'Down');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => status.cursor?.line === 3 && status.cursor.col === 0,
  );
  HarnessSmoke.Class.pass('cursor moved to alpha.ts line 3 (3,0)');

  driver.sendKeys('Escape');
  await driver.awaitQuiescence();
  driver.sendKeys('Down');
  await HarnessSmoke.Class.awaitStatus(driver, statusPath, (status) => status.treeSelected === 1);
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(driver, statusPath, (status) => status.activeBuffer === betaPath);
  HarnessSmoke.Class.pass('beta.ts opened as the active buffer');

  console.log('== harness navigation history: Alt+[ and Alt+] replay both directions ==');
  driver.sendKeys('Alt+[');
  const backStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => status.activeBuffer === alphaPath && status.cursor?.line === 3,
  );
  HarnessSmoke.Class.pass('Alt+[ restored alpha.ts as the active buffer');
  HarnessSmoke.Class.requireCondition(
    backStatus.cursor?.line === 3 && backStatus.cursor.col === 0,
    'Alt+[ restored the cursor to where it was left (3,0)',
  );
  driver.sendKeys('Alt+]');
  await HarnessSmoke.Class.awaitStatus(driver, statusPath, (status) => status.activeBuffer === betaPath);
  HarnessSmoke.Class.pass('Alt+] returned forward to beta.ts');

  console.log('== harness navigation history: breadcrumb buttons drive the same history ==');
  let snapshot = driver.snapshot();
  let breadcrumbRow = -1;
  let backColumn = -1;
  for (let row = 0; row < snapshot.rows; row++) {
    const rowText = snapshot.rowText(row);
    if (!rowText.includes('beta.ts') || !rowText.includes('‹')) continue;
    breadcrumbRow = row;
    backColumn = rowText.indexOf('‹');
    break;
  }
  HarnessSmoke.Class.requireCondition(
    breadcrumbRow >= 0 && backColumn >= 0,
    `breadcrumb buttons rendered (‹ at col ${backColumn}, row ${breadcrumbRow})`,
  );
  driver.sendMouse({ kind: 'press', column: backColumn, row: breadcrumbRow, button: 'left' });
  driver.sendMouse({ kind: 'release', column: backColumn, row: breadcrumbRow, button: 'left' });
  await HarnessSmoke.Class.awaitStatus(driver, statusPath, (status) => status.activeBuffer === alphaPath);
  HarnessSmoke.Class.pass('clicking ‹ went back to alpha.ts');
  snapshot = driver.snapshot();
  driver.sendMouse({
    kind: 'press',
    column: backColumn + 2,
    row: breadcrumbRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: backColumn + 2,
    row: breadcrumbRow,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(driver, statusPath, (status) => status.activeBuffer === betaPath);
  HarnessSmoke.Class.pass('clicking › went forward to beta.ts');

  driver.sendKeys('Control+q');
  console.log('smoke-navigation-history-harness: ALL-PASS');
} finally {
  driver.dispose();
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
